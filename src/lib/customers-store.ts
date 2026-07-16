import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { type Customer } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

const store = createPersistedStore<Customer[]>("dhipos-customers", []);

export const customersStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(input: Omit<Customer, "id" | "outstanding" | "spent" | "loyalty">) {
    const customer: Customer = {
      ...input,
      id: `${input.mobile || input.name}-${Date.now()}`,
      outstanding: 0,
      spent: 0,
      loyalty: 0,
    };
    store.set((cs) => [customer, ...cs]);
    logAudit(authStore.getCurrentUser()?.name ?? "System", "create", `Customer / ${customer.name}`);
    return customer;
  },
  update(id: string, patch: Partial<Omit<Customer, "id" | "outstanding" | "spent" | "loyalty">>) {
    store.set((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    logAudit(authStore.getCurrentUser()?.name ?? "System", "update", `Customer / ${patch.name ?? id}`);
  },
  remove(id: string) {
    const existing = store.get().find((c) => c.id === id);
    store.set((cs) => cs.filter((c) => c.id !== id));
    logAudit(authStore.getCurrentUser()?.name ?? "System", "delete", `Customer / ${existing?.name ?? id}`);
  },
  addSpend(id: string, amount: number) {
    store.set((cs) => cs.map((c) => (c.id === id ? { ...c, spent: c.spent + amount } : c)));
  },
};

export function useCustomers() {
  return usePersistedStore(store);
}
