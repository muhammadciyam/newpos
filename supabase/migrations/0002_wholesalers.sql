-- Wholesaler directory (src/routes/supply.home.tsx) — was local-device-only storage,
-- moved to Supabase so entries are shared across devices like products/bills/users.
create table if not exists wholesalers (
  id text primary key,
  data jsonb not null
);
alter table wholesalers enable row level security;
