-- Rate the product is bought at from the company (optional). Additive only.
alter table products add column if not exists company_rate numeric(14,2) check (company_rate >= 0);
