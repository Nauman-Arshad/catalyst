-- Product returns. Additive only.


create table if not exists product_returns (
  id              bigint generated always as identity primary key,
  order_id        bigint not null references orders (id) on delete cascade,
  return_date     date not null default current_date,
  total_amount    numeric(14,2) not null check (total_amount >= 0),   
  company_amount  numeric(14,2) not null default 0 check (company_amount >= 0), 
  refund_amount   numeric(14,2) not null default 0 check (refund_amount >= 0),  
  payment_id      bigint references payments (id) on delete set null,  
  note            text,
  created_by      text,        
  created_by_name text,        
  created_at      timestamptz not null default now()
);
create index if not exists product_returns_order_idx
  on product_returns (order_id);
create index if not exists product_returns_date_idx
  on product_returns (return_date desc, created_at desc);


create table if not exists product_return_items (
  id            bigint generated always as identity primary key,
  return_id     bigint not null references product_returns (id) on delete cascade,
  order_item_id bigint references order_items (id) on delete set null,
  product_id    bigint not null references products (id) on delete restrict,
  quantity      numeric(14,2) not null check (quantity > 0),
  unit_price    numeric(14,2) not null,
  company_rate  numeric(14,2),
  created_at    timestamptz not null default now()
);
create index if not exists product_return_items_return_idx
  on product_return_items (return_id);
