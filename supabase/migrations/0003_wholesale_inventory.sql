-- Wholesale Inventory (src/routes/supply.home.tsx) — a manually-tracked list of items
-- sourced from wholesalers, separate from the main Products catalog and Purchase Invoices.
create table if not exists wholesale_inventory (
  id text primary key,
  data jsonb not null
);
alter table wholesale_inventory enable row level security;
