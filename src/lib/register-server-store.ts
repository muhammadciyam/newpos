import { getSupabase } from "@/lib/supabase-client";
import { getOrCreateDefaultOutlet } from "@/lib/outlets-server-store";

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
  // Which outlet's inventory a sale on this register deducts from. Null only for registers
  // created before per-outlet inventory existed and not yet reassigned.
  outletId: string | null;
  // Human-readable label shown everywhere in the UI. The `name` column (this record's key
  // in ServerRegisterState.registers) is the internal identity — for registers created
  // before this field existed, it's also the plain name; for registers created afterwards,
  // it's a composite `${outletId}::${displayName}` (see src/lib/register-key.ts) so two
  // outlets can each have their own "Counter 1" without colliding.
  displayName: string;
};

export type ServerRegisterState = {
  storeName: string;
  registers: Record<string, ServerRegisterRecord>;
};

// Never mutated anywhere in the app (no server function sets it) — kept as a constant
// rather than a column, matching the app's actual behavior.
const STORE_NAME = "Seven Mart";

let seeded = false;

// Set once an upsert/insert actually fails because a given optional column doesn't exist
// yet (the shop hasn't run the matching migration) — from then on, this process stops
// trying to write that column at all, so a pending migration never breaks a core,
// everyday operation like opening/closing a register.
const columnKnownMissing: Record<"outlet_id" | "display_name", boolean> = {
  outlet_id: false,
  display_name: false,
};

function missingColumnFromError(
  error: { message?: string } | null,
): "outlet_id" | "display_name" | null {
  const msg = error?.message?.toLowerCase() ?? "";
  if (msg.includes("outlet_id")) return "outlet_id";
  if (msg.includes("display_name")) return "display_name";
  return null;
}

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("registers")
    .select("name", { count: "exact", head: true });
  if (error) throw error;
  if (count === 0) {
    // Best-effort — if the outlets table hasn't been migrated in yet, seed with no outlet
    // rather than failing register seeding entirely; it can be assigned later.
    let outletId: string | null = null;
    try {
      outletId = (await getOrCreateDefaultOutlet()).id;
    } catch {
      // outlets table not migrated yet
    }
    const baseRow = {
      name: "Counter 1",
      is_open: false,
      opened_at: null,
      opened_by: null,
      opened_by_device_id: null,
      last_closed_at: null,
      held_bill: null,
      opening: null,
    };
    for (;;) {
      const row = {
        ...baseRow,
        ...(columnKnownMissing.outlet_id ? {} : { outlet_id: outletId }),
        ...(columnKnownMissing.display_name ? {} : { display_name: "Counter 1" }),
      };
      const { error: insertError } = await supabase.from("registers").insert(row);
      if (!insertError) break;
      const missing = missingColumnFromError(insertError);
      if (!missing || columnKnownMissing[missing]) throw insertError;
      columnKnownMissing[missing] = true;
    }
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
    outletId: row.outlet_id ?? null,
    // Rows created before display_name existed have it null — their `name` (this record's
    // key) is already the plain human name in that case, so fall back to it.
    displayName: row.display_name ?? row.name,
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
    for (;;) {
      const rows = nextEntries.map(([key, r]) => ({
        name: key,
        is_open: r.isOpen,
        opened_at: r.openedAt,
        opened_by: r.openedBy,
        opened_by_device_id: r.openedByDeviceId,
        last_closed_at: r.lastClosedAt,
        held_bill: r.heldBill,
        opening: r.opening,
        ...(columnKnownMissing.outlet_id ? {} : { outlet_id: r.outletId }),
        ...(columnKnownMissing.display_name ? {} : { display_name: r.displayName }),
      }));
      const { error: upsertError } = await supabase
        .from("registers")
        .upsert(rows, { onConflict: "name" });
      if (!upsertError) break;
      // A pending migration (0008_registers_outlet.sql or 0009_registers_display_name.sql)
      // hasn't been run yet — fall back to writing without that column rather than letting
      // this (and every future open/close/create) fail outright, and remember not to bother
      // retrying with it for this process's lifetime.
      const missing = missingColumnFromError(upsertError);
      if (!missing || columnKnownMissing[missing]) throw upsertError;
      columnKnownMissing[missing] = true;
    }
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
