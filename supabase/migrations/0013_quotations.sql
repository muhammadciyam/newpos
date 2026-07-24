-- Quotations (src/routes/pos.quotations.tsx) were local-device-only (localStorage) with no
-- line items at all — just a header row. Moved to Supabase, same jsonb-blob pattern as
-- wholesale_orders/customers, so a quotation created on one device/register is visible on
-- every other one, and outlet-scoping (src/lib/outlet-scope.ts) can actually apply to it.
create table if not exists quotations (
  number text primary key,
  data jsonb not null
);
alter table quotations enable row level security;
