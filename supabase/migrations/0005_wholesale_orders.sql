-- Wholesale Orders (src/routes/supply.home.tsx) — a snapshot of the Cart's contents at
-- the moment "Make Order" was clicked. Read-only history once created.
create table if not exists wholesale_orders (
  id text primary key,
  data jsonb not null
);
alter table wholesale_orders enable row level security;
