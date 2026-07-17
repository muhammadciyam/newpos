-- Cart (src/routes/supply.home.tsx) — a running list of products added while browsing
-- wholesaler catalogues. One row per product; qty adjustments upsert the same row.
create table if not exists cart_items (
  id text primary key,
  data jsonb not null
);
alter table cart_items enable row level security;
