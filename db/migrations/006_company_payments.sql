-- Money paid directly to the supplier company, as opposed to the party
-- receipts the ledger already credits against a day's bill. One row per
-- payment so the ledger can show each one with its amount and time.
-- `company_ledger_days` held a single figure per day and is superseded by
-- this; it stays unread. Additive only.
create table if not exists company_payments (
  id             bigint generated always as identity primary key,
  payment_date   date not null,
  amount         numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash','bank')),
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists company_payments_date_idx
  on company_payments (payment_date desc, created_at desc);
