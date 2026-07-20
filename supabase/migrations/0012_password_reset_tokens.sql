-- Password reset tokens (Forgot Password on the login page, src/routes/login.tsx) —
-- a short-lived, single-use token emailed to the account holder that lets them set a new
-- password without being logged in. See src/lib/password-reset-server-store.ts.
create table if not exists password_reset_tokens (
  id text primary key,
  data jsonb not null
);
alter table password_reset_tokens enable row level security;
