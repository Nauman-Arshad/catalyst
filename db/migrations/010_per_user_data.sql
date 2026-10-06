-- Per-user data: a user_id on every app table, foreign keys that include it,
-- and row-level security for catalyst_app (see src/lib/db.ts). Idempotent.
-- Existing rows need an owner:
--   psql "$DATABASE_URL" -v owner=user_xxx -f db/migrations/010_per_user_data.sql

\set ON_ERROR_STOP on
\if :{?owner}
\else
\set owner ''
\endif

begin;

select set_config('catalyst.owner', :'owner', true);

do $$
declare
  owner text := current_setting('catalyst.owner');
  tables text[] := array['parties', 'products', 'companies', 'orders', 'order_items', 'payments',
    'product_returns', 'product_return_items', 'company_purchases', 'company_ledger_days',
    'company_ledger_order_paid', 'company_payments'];
  -- Referenced by composite foreign keys, so each needs unique (id, user_id).
  parents text[] := array['parties', 'products', 'companies', 'orders', 'order_items', 'payments', 'product_returns'];
  fks text[][] := array[
    ['orders', 'orders_party_id_fkey', 'FOREIGN KEY (party_id, user_id) REFERENCES parties(id, user_id) ON DELETE RESTRICT'],
    ['order_items', 'order_items_order_id_fkey', 'FOREIGN KEY (order_id, user_id) REFERENCES orders(id, user_id) ON DELETE CASCADE'],
    ['order_items', 'order_items_product_id_fkey', 'FOREIGN KEY (product_id, user_id) REFERENCES products(id, user_id) ON DELETE RESTRICT'],
    ['payments', 'payments_party_id_fkey', 'FOREIGN KEY (party_id, user_id) REFERENCES parties(id, user_id) ON DELETE RESTRICT'],
    ['payments', 'payments_order_id_fkey', 'FOREIGN KEY (order_id, user_id) REFERENCES orders(id, user_id) ON DELETE SET NULL (order_id)'],
    ['product_returns', 'product_returns_order_id_fkey', 'FOREIGN KEY (order_id, user_id) REFERENCES orders(id, user_id) ON DELETE CASCADE'],
    ['product_returns', 'product_returns_payment_id_fkey', 'FOREIGN KEY (payment_id, user_id) REFERENCES payments(id, user_id) ON DELETE SET NULL (payment_id)'],
    ['product_return_items', 'product_return_items_return_id_fkey', 'FOREIGN KEY (return_id, user_id) REFERENCES product_returns(id, user_id) ON DELETE CASCADE'],
    ['product_return_items', 'product_return_items_order_item_id_fkey', 'FOREIGN KEY (order_item_id, user_id) REFERENCES order_items(id, user_id) ON DELETE SET NULL (order_item_id)'],
    ['product_return_items', 'product_return_items_product_id_fkey', 'FOREIGN KEY (product_id, user_id) REFERENCES products(id, user_id) ON DELETE RESTRICT'],
    ['company_purchases', 'company_purchases_company_id_fkey', 'FOREIGN KEY (company_id, user_id) REFERENCES companies(id, user_id) ON DELETE RESTRICT'],
    ['company_ledger_order_paid', 'company_ledger_order_paid_order_id_fkey', 'FOREIGN KEY (order_id, user_id) REFERENCES orders(id, user_id) ON DELETE CASCADE']];
  t text;
  c record;
  n bigint;
  seq text;
  i int;
begin
  -- A role without RLS bypass would see no rows once RLS is forced.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    raise exception 'run this as a role that bypasses row-level security (e.g. postgres), not %', current_user;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'catalyst_app') then
    create role catalyst_app nologin;
  end if;
  -- The app switches to catalyst_app per transaction. From Postgres 16 the
  -- creating role gets ADMIN on it but not SET, so check SET explicitly.
  if current_setting('server_version_num')::int >= 160000 then
    if not pg_has_role(current_user, 'catalyst_app', 'SET') then
      execute format('grant catalyst_app to %I with set true', current_user);
    end if;
  elsif not pg_has_role(current_user, 'catalyst_app', 'MEMBER') then
    execute format('grant catalyst_app to %I', current_user);
  end if;
  grant usage on schema public to catalyst_app;

  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise exception 'table public.% is missing; apply the earlier migrations first', t;
    end if;

    if not exists (select 1 from pg_attribute where attrelid = ('public.' || t)::regclass and attname = 'user_id' and not attisdropped) then
      execute format('alter table public.%I add column user_id text', t);
    end if;

    execute format('select count(*) from public.%I where user_id is null', t) into n;
    if n > 0 then
      if owner !~ '^user_[A-Za-z0-9]+$' then
        raise exception '% has % row(s) without an owner; rerun with -v owner=user_... (the Clerk user id that owns the existing data)', t, n;
      end if;
      execute format('update public.%I set user_id = %L where user_id is null', t, owner);
      raise notice '%: % existing row(s) now owned by %', t, n, owner;
    end if;

    execute format($q$alter table public.%I alter column user_id set default current_setting('app.current_user_id'), alter column user_id set not null$q$, t);
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and conname = t || '_user_id_check') then
      execute format($q$alter table public.%I add constraint %I check (user_id <> '')$q$, t, t || '_user_id_check');
    end if;
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'user_isolation') then
      execute format($q$create policy user_isolation on public.%I to catalyst_app
        using (user_id = current_setting('app.current_user_id', true))
        with check (user_id = current_setting('app.current_user_id', true))$q$, t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to catalyst_app', t);
    seq := (select pg_get_serial_sequence('public.' || t, 'id') from pg_attribute
            where attrelid = ('public.' || t)::regclass and attname = 'id' and not attisdropped);
    if seq is not null then
      execute format('grant select, usage on sequence %s to catalyst_app', seq);
    end if;
  end loop;

  foreach t in array parents loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || t)::regclass and contype = 'u'
                   and pg_get_constraintdef(oid) = 'UNIQUE (id, user_id)') then
      execute format('alter table public.%I add constraint %I unique (id, user_id)', t, t || '_id_user_id_key');
    end if;
  end loop;

  -- Order numbers are unique per user, not across all users.
  for c in select conname from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'u'
           and pg_get_constraintdef(oid) = 'UNIQUE (order_number)' loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'u'
                 and pg_get_constraintdef(oid) = 'UNIQUE (user_id, order_number)') then
    alter table public.orders add constraint orders_user_id_order_number_key unique (user_id, order_number);
  end if;

  -- One ledger day per user.
  select conname, pg_get_constraintdef(oid) as def into c from pg_constraint
    where conrelid = 'public.company_ledger_days'::regclass and contype = 'p';
  if c.def is distinct from 'PRIMARY KEY (user_id, ledger_date)' then
    if c.conname is not null then
      execute format('alter table public.company_ledger_days drop constraint %I', c.conname);
    end if;
    alter table public.company_ledger_days add constraint company_ledger_days_pkey primary key (user_id, ledger_date);
  end if;

  -- Replace any foreign key that isn't one of the composite ones above.
  foreach t in array array(select distinct x from unnest(fks[:][1:1]) x) loop
    for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
             where conrelid = ('public.' || t)::regclass and contype = 'f' loop
      if not exists (select 1 from generate_subscripts(fks, 1) s where fks[s][1] = t and fks[s][3] = c.def) then
        execute format('alter table public.%I drop constraint %I', t, c.conname);
      end if;
    end loop;
  end loop;
  for i in 1 .. array_length(fks, 1) loop
    if not exists (select 1 from pg_constraint where conrelid = ('public.' || fks[i][1])::regclass and contype = 'f'
                   and pg_get_constraintdef(oid) = fks[i][3]) then
      execute format('alter table public.%I add constraint %I %s', fks[i][1], fks[i][2], fks[i][3]);
    end if;
  end loop;
end $$;

commit;
