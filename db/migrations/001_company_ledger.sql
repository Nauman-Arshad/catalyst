-- Company ledger: suppliers we purchase from, and each purchase bill.
-- Additive only — safe to run against an existing database (unlike db/schema.sql).

create table if not exists companies (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text,
  address     text,
  created_at  timestamptz not null default now()
);
create index if not exists companies_name_idx on companies (lower(name));

create table if not exists company_purchases (
  id             bigint generated always as identity primary key,
  company_id     bigint not null references companies (id) on delete restrict,
  product        text not null,
  purchase_date  date not null default current_date,
  bill_amount    numeric(14,2) not null check (bill_amount >= 0),
  amount_paid    numeric(14,2) not null default 0 check (amount_paid >= 0),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists company_purchases_company_idx on company_purchases (company_id);
create index if not exists company_purchases_date_idx    on company_purchases (purchase_date desc);
