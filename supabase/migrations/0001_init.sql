-- Dhipos initial schema — mirrors the shape of the .data/*.json files the app currently
-- persists to on disk. Each table is only ever accessed server-side via the service_role
-- key (see src/lib/supabase-client.ts), which bypasses Row Level Security entirely — RLS
-- is still enabled below as a safety net so the anon/publishable key can never read or
-- write anything here, even by accident.

create table if not exists registers (
  name text primary key,
  is_open boolean not null default false,
  opened_at bigint,
  opened_by text,
  opened_by_device_id text,
  last_closed_at bigint,
  held_bill jsonb,
  opening jsonb
);
alter table registers enable row level security;

create table if not exists sessions (
  email text primary key,
  device_id text not null,
  login_at bigint not null
);
alter table sessions enable row level security;

create table if not exists users (
  id text primary key,
  email text not null,
  username text not null,
  data jsonb not null
);
create unique index if not exists users_email_idx on users (lower(email));
create unique index if not exists users_username_idx on users (lower(username));
alter table users enable row level security;

create table if not exists products (
  id text primary key,
  data jsonb not null
);
alter table products enable row level security;

create table if not exists bills (
  number text primary key,
  data jsonb not null
);
alter table bills enable row level security;

create table if not exists audit_log (
  id bigserial primary key,
  at text not null,
  data jsonb not null
);
alter table audit_log enable row level security;

-- Seed the Super Admin account and the default register, matching the app's current
-- hardcoded seed data — only inserted if the tables are empty (safe to re-run).
insert into users (id, email, username, data)
select
  'seed-admin',
  'siyante003@gmail.com',
  'siyante003',
  '{
    "id": "seed-admin",
    "name": "Owner",
    "email": "siyante003@gmail.com",
    "username": "siyante003",
    "password": "229022#",
    "role": "Super Admin",
    "status": "Active",
    "authorizedRegister": null,
    "createdAt": "2026-07-13T07:00:00.000Z",
    "photo": null,
    "phone": "",
    "jobTitle": "Owner",
    "department": "",
    "hireDate": "",
    "employmentStatus": "Active",
    "salary": null,
    "payType": "Monthly",
    "nationalId": "",
    "address": "",
    "emergencyContactName": "",
    "emergencyContactPhone": "",
    "idCardPhoto": null,
    "certificates": []
  }'::jsonb
where not exists (select 1 from users);

insert into registers (name, is_open, opened_at, opened_by, opened_by_device_id, last_closed_at, held_bill, opening)
select 'Counter 1', false, null, null, null, null, null, null
where not exists (select 1 from registers);
