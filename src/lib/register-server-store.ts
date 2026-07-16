import { getSupabase } from "@/lib/supabase-client";

// Server-only. Never import this from a client component or from register-store.ts's
// client-facing exports — it must stay out of the client bundle. Only register-api.ts
// (the createServerFn boundary) should import it.
//
// Backed by Supabase (see supabase/migrations/0001_init.sql) so register open/close state
// is shared across every device/process.

export type ServerRegisterRecord = {
  isOpen: boolean;
  openedAt: number | null;
  openedBy: string | null;
  openedByDeviceId: string | null;
  lastClosedAt: number | null;
  // Opaque — the held/parked sale(s) for this register, if any. See register-store.ts.
  // Typed `any` (not `unknown`) because createServerFn's serialization checker needs a
  // provably-JSON-serializable type here; the actual shape is validated on the client
  // (sale-tabs-store.ts's isSaleTabsState) before ever being trusted.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heldBill: any;
  // Cash/card/bank amounts declared when this session was opened (keyed by the opening
  // dialog's fields: mvr/usd/usd1/usd20/card/bank) — used to compute the Expected column
  // at close time. Cleared back to null once the register is closed.
  opening: Record<string, string> | null;
};

export type ServerRegisterState = {
  storeName: string;
  registers: Record<string, ServerRegisterRecord>;
};

// Never mutated anywhere in the app (no server function sets it) — kept as a constant
// rather than a column, matching the app's actual behavior.
const STORE_NAME = "Seven Mart";

let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("registers")
    .select("name", { count: "exact", head: true });
  if (error) throw error;
  if (count === 0) {
    const { error: insertError } = await supabase.from("registers").insert({
      name: "Counter 1",
      is_open: false,
      opened_at: null,
      opened_by: null,
      opened_by_device_id: null,
      last_closed_at: null,
      held_bill: null,
      opening: null,
    });
    if (insertError) throw insertError;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRecord(row: any): ServerRegisterRecord {
  return {
    isOpen: row.is_open,
    openedAt: row.opened_at,
    openedBy: row.opened_by,
    openedByDeviceId: row.opened_by_device_id,
    lastClosedAt: row.last_closed_at,
    heldBill: row.held_bill,
    opening: row.opening,
  };
}

export async function getServerRegisterState(): Promise<ServerRegisterState> {
  await ensureSeeded();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("registers").select("*");
  if (error) throw error;
  const registers: Record<string, ServerRegisterRecord> = {};
  for (const row of data) registers[row.name] = rowToRecord(row);
  return { storeName: STORE_NAME, registers };
}

export async function mutateServerRegisterState(
  mutator: (s: ServerRegisterState) => ServerRegisterState,
): Promise<ServerRegisterState> {
  const current = await getServerRegisterState();
  const next = mutator(current);
  const supabase = getSupabase();

  const nextEntries = Object.entries(next.registers);
  if (nextEntries.length > 0) {
    const { error } = await supabase
      .from("registers")
      .upsert(
        nextEntries.map(([name, r]) => ({
          name,
          is_open: r.isOpen,
          opened_at: r.openedAt,
          opened_by: r.openedBy,
          opened_by_device_id: r.openedByDeviceId,
          last_closed_at: r.lastClosedAt,
          held_bill: r.heldBill,
          opening: r.opening,
        })),
        { onConflict: "name" },
      );
    if (error) throw error;
  }
  const currentNames = new Set(Object.keys(current.registers));
  const nextNames = new Set(Object.keys(next.registers));
  const removedNames = [...currentNames].filter((n) => !nextNames.has(n));
  if (removedNames.length > 0) {
    const { error } = await supabase.from("registers").delete().in("name", removedNames);
    if (error) throw error;
  }
  return next;
}
