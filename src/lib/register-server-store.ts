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
