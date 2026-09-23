-- What each order's party has paid, as entered on the Company Ledger. Read
-- only by that page: it is not a customer payment, so party balances, the
-- Payments page and the party ledgers never see it. Additive only.
create table if not exists company_ledger_order_paid (
  order_id     bigint primary key references orders (id) on delete cascade,
  amount_paid  numeric(14,2) not null check (amount_paid > 0),
  updated_at   timestamptz not null default now()
);
