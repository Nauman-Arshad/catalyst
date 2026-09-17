-- Daily company ledger. Additive only.
-- amount paid to the company per day is stored.

alter table order_items add column if not exists company_rate numeric(14,2) check (company_rate >= 0);

create table if not exists company_ledger_days (
  ledger_date  date primary key,
  amount_paid  numeric(14,2) not null default 0 check (amount_paid >= 0),
  updated_at   timestamptz not null default now()
);
