-- Customers, Expenses, and Purchase Invoices were local-device-only (localStorage) — not
-- shared across devices/users at all. Moved to Supabase so they're shared like
-- products/bills, and so outlet-scoping (src/lib/outlet-scope.ts) can actually apply to them.

create table if not exists customers (
  id text primary key,
  data jsonb not null
);
alter table customers enable row level security;

create table if not exists expenses (
  id text primary key,
  data jsonb not null
);
alter table expenses enable row level security;

create table if not exists purchase_invoices (
  id text primary key,
  data jsonb not null
);
alter table purchase_invoices enable row level security;
