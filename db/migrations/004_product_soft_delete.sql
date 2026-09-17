-- Products used in orders can't be hard-deleted (order_items restricts), so
-- deleting one archives it instead. Additive only.
alter table products add column if not exists deleted_at timestamptz;
