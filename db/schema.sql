-- Catalyst — B2B business management schema (PostgreSQL / Supabase)
-- Auth is handled by Clerk; Supabase is used as a plain Postgres database.
-- Integer (identity) primary keys. No tax — order totals are Σ(qty × unit_price).

drop table if exists company_ledger_days cascade;
drop table if exists company_purchases   cascade;
drop table if exists companies           cascade;
drop table if exists order_items cascade;
drop table if exists payments    cascade;
drop table if exists orders       cascade;
drop table if exists products     cascade;
drop table if exists parties      cascade;
drop sequence if exists order_number_seq;
drop function if exists set_updated_at cascade;

-- ── Parties (customers) ──────────────────────────────────────────────────────
create table parties (
  id              bigint generated always as identity primary key,
  name            text not null,
  phone           text,
  address         text,
  status          text not null default 'active' check (status in ('active','inactive')),
  opening_balance numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index parties_name_idx on parties (lower(name));

-- ── Products ─────────────────────────────────────────────────────────────────
create table products (
  id          bigint generated always as identity primary key,
  name        text not null,
  unit_price  numeric(14,2) not null default 0,
  company_rate numeric(14,2) check (company_rate >= 0), -- purchase rate from the company
  deleted_at  timestamptz,                               -- set when a product used in orders is deleted (archived)
  created_at  timestamptz not null default now()
);
create index products_name_idx on products (lower(name));

-- ── Orders ───────────────────────────────────────────────────────────────────
create table orders (
  id              bigint generated always as identity primary key,
  order_number    text not null unique,
  party_id        bigint not null references parties (id) on delete restrict,
  order_date      date not null default current_date,
  status          text not null default 'progress' check (status in ('progress','completed')),
  advance_payment numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index orders_party_idx on orders (party_id);
create index orders_date_idx  on orders (order_date desc);

-- ── Order line items ─────────────────────────────────────────────────────────
create table order_items (
  id          bigint generated always as identity primary key,
  order_id    bigint not null references orders (id)   on delete cascade,
  product_id  bigint not null references products (id) on delete restrict,
  quantity    numeric(14,2) not null default 1,
  unit_price  numeric(14,2) not null default 0,
  company_rate numeric(14,2) check (company_rate >= 0), -- snapshot of products.company_rate; null = use product's
  created_at  timestamptz not null default now()
);
create index order_items_order_idx on order_items (order_id);

-- ── Payments ─────────────────────────────────────────────────────────────────
create table payments (
  id            bigint generated always as identity primary key,
  party_id      bigint not null references parties (id) on delete restrict,
  order_id      bigint references orders (id) on delete set null,
  amount        numeric(14,2) not null,
  payment_date  date not null default current_date,
  created_at    timestamptz not null default now()
);
create index payments_party_idx on payments (party_id);
create index payments_order_idx on payments (order_id);
create index payments_date_idx  on payments (payment_date desc);

-- ── Company ledger ───────────────────────
create table company_ledger_days (
  ledger_date  date primary key,
  amount_paid  numeric(14,2) not null default 0 check (amount_paid >= 0),
  updated_at   timestamptz not null default now()
);
