import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { products as seedProducts, type Product } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

const store = createPersistedStore<Product[]>("dhipos-products", seedProducts);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

export const productsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  // New products always start at zero stock — quantity can only ever be added
  // via an approved Purchase Invoice, never typed in directly here.
  create(input: Omit<Product, "id" | "stock">) {
    const product: Product = { ...input, id: `p-${Date.now()}`, stock: 0 };
    store.set((ps) => [product, ...ps]);
    logAudit(actor(), "create", `Product / ${product.name}`);
    return product;
  },
  update(id: string, patch: Partial<Omit<Product, "stock">>) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    logAudit(actor(), "update", `Product / ${patch.name ?? id}`);
  },
  remove(id: string) {
    const product = store.get().find((p) => p.id === id);
    store.set((ps) => ps.filter((p) => p.id !== id));
    logAudit(actor(), "delete", `Product / ${product?.name ?? id}`);
  },
  // Silent — called right after `create` once the async image search resolves,
  // and doesn't warrant its own audit entry.
  setImage(id: string, image: string) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, image } : p)));
  },
  // Sales only ever take stock away.
  decrementStock(id: string, qty: number) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock - qty) } : p)));
  },
  // The only way stock is ever added — called when a Purchase Invoice is approved.
  increaseStock(id: string, qty: number) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, stock: p.stock + qty } : p)));
  },
  // Silent — keeps the product's "last known cost" in sync when a Purchase
  // Invoice for it is approved, so the next invoice pre-fills a sensible price.
  setCost(id: string, cost: number) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, cost } : p)));
  },
};

export function useProducts() {
  return usePersistedStore(store);
}
