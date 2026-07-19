-- Outlet directory (src/routes/admin.locations.tsx) — the physical stores/branches a
-- company operates, manageable only by the Super Admin (see outlets.manage in
-- src/lib/permissions.ts).
create table if not exists outlets (
  id text primary key,
  data jsonb not null
);
alter table outlets enable row level security;
