-- Register Sessions (open/close history, src/routes/pos.register-sessions.tsx) was
-- local-device-only (localStorage) — not shared across devices, and with no outlet field,
-- so it couldn't be scoped even if it were shared. Moved to Supabase like every other
-- domain this session, with an outletId so it's properly isolated per outlet too.
create table if not exists register_sessions (
  id text primary key,
  data jsonb not null
);
alter table register_sessions enable row level security;
