-- Lets two different outlets each have a register with the same human-readable name
-- (e.g. every outlet can have its own "Counter 1"). `registers.name` (the primary key)
-- becomes an internal composite key ("<outletId>::<display name>"); `display_name` is the
-- plain label actually shown in the UI. See src/lib/register-key.ts.
alter table registers add column if not exists display_name text;
