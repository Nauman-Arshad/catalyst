-- How the money came in. Cash is the default because it is how most payments
-- are taken, and because the advance on an order and the company-ledger
-- adjustment both insert payments without naming a method. Additive only.
alter table payments
  add column if not exists payment_method text not null default 'cash';

alter table payments
  drop constraint if exists payments_payment_method_check;
alter table payments
  add constraint payments_payment_method_check
  check (payment_method in ('cash','bank'));
