import { createServerFn } from "@tanstack/react-start";
import { getServerExpenses, mutateServerExpenses } from "@/lib/expenses-server-store";
import type { Expense } from "@/lib/expenses-store";

export const fetchExpenses = createServerFn({ method: "GET" }).handler(async () => {
  return getServerExpenses();
});

export const createExpenseOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Expense, "id">) => data)
  .handler(async ({ data }) => {
    const expense: Expense = { ...data, id: `exp-${Date.now()}` };
    await mutateServerExpenses((es) => [expense, ...es]);
    return { ok: true as const, expense };
  });
