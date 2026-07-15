import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Server-only. Never import this from a client component or from register-store.ts's
// client-facing exports — it must stay out of the client bundle. Only register-api.ts
// (the createServerFn boundary) should import it.

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

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "register-state.json");

const initialState: ServerRegisterState = {
  storeName: "Seven Mart",
  registers: {
    "Counter 1": {
      isOpen: false,
      openedAt: null,
      openedBy: null,
      openedByDeviceId: null,
      lastClosedAt: null,
      heldBill: null,
      opening: null,
    },
  },
};

function loadFromDisk(): ServerRegisterState | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as ServerRegisterState;
  } catch {
    return null;
  }
}

function persistToDisk() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(state), "utf-8");
  } catch {
    // Best-effort — in-memory state is still correct even if the write fails.
  }
}

let state: ServerRegisterState = loadFromDisk() ?? initialState;

export function getServerRegisterState(): ServerRegisterState {
  return state;
}

export function mutateServerRegisterState(
  mutator: (s: ServerRegisterState) => ServerRegisterState,
): ServerRegisterState {
  state = mutator(state);
  persistToDisk();
  return state;
}
