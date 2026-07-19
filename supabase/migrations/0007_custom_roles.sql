-- Custom roles (Admin > Users > Create Role) — Super Admin defined roles with a hand-picked
-- set of permissions, alongside the built-in Admin/Manager/Supervisor/Cashier roles.
create table if not exists custom_roles (
  id text primary key,
  data jsonb not null
);
alter table custom_roles enable row level security;
