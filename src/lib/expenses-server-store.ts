import { getSupabase } from "@/lib/supabase-client";
import type { Expense } from "@/lib/expenses-store";

// Server-only. Only expenses-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0010_customers_expenses_purchase_invoices.sql)
// so expenses are shared across every device/user, not just local storage.

export async function getServerExpenses(): Promise<Expense[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("expenses").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Expense);
}

export async function mutateServerExpenses(
  mutator: (expenses: Expense[]) => Expense[],
): Promise<Expense[]> {
  const current = await getServerExpenses();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("expenses").upsert(
      next.map((e) => ({ id: e.id, data: e })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((e) => e.id));
  const nextIds = new Set(next.map((e) => e.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("expenses").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
