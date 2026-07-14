import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Server-only. Never import this from a client component or from auth-store.ts's
// client-facing exports — it must stay out of the client bundle. Only session-api.ts
// (the createServerFn boundary) should import it.

export type ServerSessionRecord = { deviceId: string; loginAt: number };

// Keyed by normalized (lowercase, trimmed) email — one entry per currently "logged in" user.
export type ServerSessionState = Record<string, ServerSessionRecord>;

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "session-state.json");

function loadFromDisk(): ServerSessionState | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as ServerSessionState;
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

let state: ServerSessionState = loadFromDisk() ?? {};

export function getServerSessionState(): ServerSessionState {
  return state;
}

export function mutateServerSessionState(
  mutator: (s: ServerSessionState) => ServerSessionState,
): ServerSessionState {
  state = mutator(state);
  persistToDisk();
  return state;
}
