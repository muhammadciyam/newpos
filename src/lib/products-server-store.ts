import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { products as seedProducts, type Product } from "@/lib/pos-data";

// Server-only. Only products-api.ts and bills-api.ts (which adjusts stock as part of a
// bill mutation, in the same process) should import this — never a client component.

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "products-state.json");

function loadFromDisk(): Product[] | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as Product[];
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

let state: Product[] = loadFromDisk() ?? seedProducts;

export function getServerProducts(): Product[] {
  return state;
}

export function mutateServerProducts(mutator: (products: Product[]) => Product[]): Product[] {
  state = mutator(state);
  persistToDisk();
  return state;
}

// Plain (non-createServerFn) helper so bills-api.ts can adjust stock atomically as part of
// a bill create/edit/void/refund, in the same server process, without a second round trip.
// Positive delta adds stock, negative delta removes it (never below zero).
export function adjustStock(id: string, delta: number) {
  mutateServerProducts((ps) =>
    ps.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
  );
}
