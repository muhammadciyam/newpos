import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type Wholesaler = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  whatsapp: string;
  email: string;
  companyName: string;
  billingAddress: string;
  shippingAddress: string;
  notes: string;
  active: boolean;
  createdAt: string;
};

// Local-only, per-device — matches how Customers, Purchase Invoices, and Quotations are
// already stored in this app (see customers-store.ts / purchase-invoices-store.ts).
const store = createPersistedStore<Wholesaler[]>("dhipos-wholesalers", []);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

export const wholesalersStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,

  create(input: Omit<Wholesaler, "id" | "createdAt">): Wholesaler {
    const wholesaler: Wholesaler = {
      ...input,
      id: `ws-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    store.set((ws) => [wholesaler, ...ws]);
    logAudit(actor(), "create", `Wholesaler / ${wholesaler.name}`);
    return wholesaler;
  },

  update(id: string, patch: Partial<Omit<Wholesaler, "id" | "createdAt">>) {
    const existing = store.get().find((w) => w.id === id);
    store.set((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    logAudit(actor(), "update", `Wholesaler / ${patch.name ?? existing?.name ?? id}`);
  },

  remove(id: string) {
    const existing = store.get().find((w) => w.id === id);
    store.set((ws) => ws.filter((w) => w.id !== id));
    logAudit(actor(), "delete", `Wholesaler / ${existing?.name ?? id}`);
  },

  setActive(id: string, active: boolean) {
    const existing = store.get().find((w) => w.id === id);
    store.set((ws) => ws.map((w) => (w.id === id ? { ...w, active } : w)));
    logAudit(
      actor(),
      "update",
      `Wholesaler / ${existing?.name ?? id} ${active ? "enabled" : "disabled"}`,
    );
  },
};

export function useWholesalers(): Wholesaler[] {
  return usePersistedStore(store);
}
