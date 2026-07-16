import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type SupplierCategory = { id: string; name: string; imageUrl: string };

export type Supplier = {
  id: string;
  name: string;
  subtitle: string; // e.g. "by RED BROTHERS"
  logoUrl: string; // optional uploaded logo; falls back to an initials badge
  bannerUrl: string; // optional cover image shown at the top of the catalogue panel
  description: string;
  phone: string;
  address: string;
  openNow: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  paymentMethods: string[]; // e.g. ["Cash On Delivery", "Card On Delivery", "Pay on Pickup"]
  categories: SupplierCategory[]; // shown as tiles in the catalogue panel's Shop tab
  active: boolean;
  createdAt: string;
};

const defaults = {
  bannerUrl: "",
  openNow: true,
  deliveryAvailable: false,
  pickupAvailable: false,
  paymentMethods: [] as string[],
  categories: [] as SupplierCategory[],
};

// Local-only, per-device — the Supply directory of wholesale suppliers a store can browse
// and contact. Independent of any other module's data.
const store = createPersistedStore<Supplier[]>("dhipos-suppliers", []);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

export const suppliersStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,

  create(input: Omit<Supplier, "id" | "createdAt">): Supplier {
    const supplier: Supplier = { ...input, id: `sup-${Date.now()}`, createdAt: new Date().toISOString() };
    store.set((ss) => [supplier, ...ss]);
    logAudit(actor(), "create", `Supplier / ${supplier.name}`);
    return supplier;
  },

  update(id: string, patch: Partial<Omit<Supplier, "id" | "createdAt">>) {
    const existing = store.get().find((s) => s.id === id);
    store.set((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    logAudit(actor(), "update", `Supplier / ${patch.name ?? existing?.name ?? id}`);
  },

  remove(id: string) {
    const existing = store.get().find((s) => s.id === id);
    store.set((ss) => ss.filter((s) => s.id !== id));
    logAudit(actor(), "delete", `Supplier / ${existing?.name ?? id}`);
  },

  setActive(id: string, active: boolean) {
    const existing = store.get().find((s) => s.id === id);
    store.set((ss) => ss.map((s) => (s.id === id ? { ...s, active } : s)));
    logAudit(actor(), "update", `Supplier / ${existing?.name ?? id} ${active ? "enabled" : "disabled"}`);
  },
};

export function useSuppliers(): Supplier[] {
  const suppliers = usePersistedStore(store);
  // Backfill for records persisted before these fields existed — createPersistedStore
  // replaces state wholesale on read rather than deep-merging with defaults.
  return suppliers.map((s) => ({ ...defaults, ...s }));
}
