import { getSupabase } from "@/lib/supabase-client";
import type { Customer } from "@/lib/pos-data";

// Server-only. Only customers-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0010_customers_expenses_purchase_invoices.sql)
// so the customer directory is shared across every device/user, not just local storage.

export async function getServerCustomers(): Promise<Customer[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("customers").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Customer);
}

export async function mutateServerCustomers(
  mutator: (customers: Customer[]) => Customer[],
): Promise<Customer[]> {
  const current = await getServerCustomers();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("customers").upsert(
      next.map((c) => ({ id: c.id, data: c })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((c) => c.id));
  const nextIds = new Set(next.map((c) => c.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("customers").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
