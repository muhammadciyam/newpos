import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Server-only. Only audit-log-api.ts (the createServerFn boundary) should import this.

export type ServerAuditLog = {
  user: string;
  action: "create" | "update" | "delete" | "login" | "logout";
  object: string;
  at: string;
};

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "audit-log-state.json");

function loadFromDisk(): ServerAuditLog[] | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as ServerAuditLog[];
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

let state: ServerAuditLog[] = loadFromDisk() ?? [];

export function getServerAuditLog(): ServerAuditLog[] {
  return state;
}

export function appendServerAuditLog(entry: ServerAuditLog): ServerAuditLog[] {
  state = [entry, ...state].slice(0, 500);
  persistToDisk();
  return state;
}
