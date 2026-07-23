import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { createOutboxStore, createSyncScheduler } from "@/lib/offline-store";
import { fetchExpenses, createExpenseOnServer } from "@/lib/expenses-api";

export type Expense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  // Which outlet this expense was logged at — null for a user with no outlet assigned
  // (only Super Admin sees those).
  outletId: string | null;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let expenses: Expense[] = [];
const listeners = new Set<() => void>();

function setExpenses(next: Expense[]) {
  expenses = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchExpenses());
  if (!("networkError" in result)) setExpenses(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// ---------------------------------------------------------------------------
// Local-first add: an expense is saved on this device immediately and queued to sync to
// Supabase in the background — same "save on device first" model bills/products/customers
// use. There's no edit or delete for expenses anywhere in this app, so only create needs
// this — see offline-store.ts.
// ---------------------------------------------------------------------------

type ExpenseInput = Omit<Expense, "id">;

const outbox = createOutboxStore<ExpenseInput>("dhipos-expenses-outbox");
const inFlight = new Set<string>();

async function trySyncEntry(id: string): Promise<"synced" | "failed-network" | "skipped"> {
  if (inFlight.has(id)) return "skipped";
  const entry = outbox.get()[id];
  if (!entry || entry.op !== "create") return "skipped";
  inFlight.add(id);
  try {
    const result = await safeServerCall(() => createExpenseOnServer({ data: entry.payload }));
    if ("networkError" in result) {
      outbox.markFailed(id, result.error);
      return "failed-network";
    }
    setExpenses([result.expense, ...expenses.filter((e) => e.id !== id)]);
    outbox.resolve(id);
    logAudit(actor(), "create", `Expense / ${result.expense.description} (synced)`);
    return "synced";
  } finally {
    inFlight.delete(id);
  }
}

const scheduler = createSyncScheduler(async () => {
  for (const id of Object.keys(outbox.get())) {
    const outcome = await trySyncEntry(id);
    if (outcome === "failed-network") break;
  }
});

// Mounted once via AppShell, alongside usePendingBills/useProductsSync/useCustomersSync.
export const useExpensesSync = scheduler.usePendingSync;
export const syncPendingExpenses = scheduler.run;

// For the header's combined "pending sync" indicator (see AppShell).
export function usePendingExpensesCount(): number {
  return Object.keys(outbox.useOutbox()).length;
}

export const expensesStore = {
  get: () => expenses,

  async create(input: Omit<Expense, "id" | "outletId">): Promise<Expense> {
    const outletId = authStore.getCurrentUser()?.outletId ?? null;
    const fullInput: ExpenseInput = { ...input, outletId };
    const id = `local-${crypto.randomUUID().slice(0, 8)}`;
    const expense: Expense = { ...fullInput, id };
    setExpenses([expense, ...expenses]);
    outbox.queueCreate(id, fullInput);
    logAudit(actor(), "create", `Expense / ${expense.description} (saved on device)`);
    void scheduler.run();
    return expense;
  },
};

export function useExpenses(): Expense[] {
  useEffect(() => ensureInitialFetch(), []);
  const allExpenses = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => expenses,
    () => expenses,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's
  // expenses combined, unrestricted. Matches useBills()/useProducts()/useCustomers().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allExpenses.filter((e) => e.outletId === scopeOutletId) : allExpenses),
    [allExpenses, scopeOutletId],
  );
}
