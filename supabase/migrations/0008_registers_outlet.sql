-- Registers now belong to one outlet (src/lib/register-store.ts), so a sale rung up there
-- deducts that outlet's inventory specifically instead of a single global stock number.
alter table registers add column if not exists outlet_id text;
