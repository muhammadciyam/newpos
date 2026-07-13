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
  create(input: Omit<Product, "id">) {
    const product: Product = { ...input, id: `p-${Date.now()}` };
    store.set((ps) => [product, ...ps]);
    logAudit(actor(), "create", `Product / ${product.name}`);
    return product;
  },
  update(id: string, patch: Partial<Product>) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    logAudit(actor(), "update", `Product / ${patch.name ?? id}`);
  },
  remove(id: string) {
    const product = store.get().find((p) => p.id === id);
    store.set((ps) => ps.filter((p) => p.id !== id));
    logAudit(actor(), "delete", `Product / ${product?.name ?? id}`);
  },
  decrementStock(id: string, qty: number) {
    store.set((ps) => ps.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock - qty) } : p)));
  },
};

export function useProducts() {
  return usePersistedStore(store);
}
