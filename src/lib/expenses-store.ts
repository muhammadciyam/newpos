import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
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

export const expensesStore = {
  get: () => expenses,

  async create(input: Omit<Expense, "id" | "outletId">): Promise<Expense | { error: string }> {
    const outletId = authStore.getCurrentUser()?.outletId ?? null;
    const result = await safeServerCall(() =>
      createExpenseOnServer({ data: { ...input, outletId } }),
    );
    if ("networkError" in result) return { error: result.error };
    setExpenses([result.expense, ...expenses]);
    logAudit(actor(), "create", `Expense / ${result.expense.description}`);
    return result.expense;
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
