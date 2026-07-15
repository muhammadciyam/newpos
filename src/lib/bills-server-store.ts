import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bill } from "@/lib/pos-data";

// Server-only. Only bills-api.ts (the createServerFn boundary) should import this.

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "bills-state.json");

function loadFromDisk(): Bill[] | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as Bill[];
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

let state: Bill[] = loadFromDisk() ?? [];

export function getServerBills(): Bill[] {
  return state;
}

export function mutateServerBills(mutator: (bills: Bill[]) => Bill[]): Bill[] {
  state = mutator(state);
  persistToDisk();
  return state;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same "DD-Mon-YY, HH:MM" format the app already uses everywhere else (register sessions,
// bills) — kept here since bill timestamps are now always stamped server-side.
export function formatBillTimestamp(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}
