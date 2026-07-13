import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type Expense = { description: string; category: string; amount: number; date: string };

const store = createPersistedStore<Expense[]>("dhipos-expenses", []);

export const expensesStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(expense: Expense) {
    store.set((es) => [expense, ...es]);
    logAudit(authStore.getCurrentUser()?.name ?? "System", "create", `Expense / ${expense.description}`);
  },
};

export function useExpenses() {
  return usePersistedStore(store);
}
