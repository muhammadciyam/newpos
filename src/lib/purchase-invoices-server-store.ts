import { getSupabase } from "@/lib/supabase-client";
import type { PurchaseInvoice } from "@/lib/purchase-invoices-store";

// Server-only. Only purchase-invoices-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0010_customers_expenses_purchase_invoices.sql)
// so purchase invoices are shared across every device/user, not just local storage.

export async function getServerPurchaseInvoices(): Promise<PurchaseInvoice[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("purchase_invoices").select("data");
  if (error) throw error;
  return data.map((row) => row.data as PurchaseInvoice);
}

export async function mutateServerPurchaseInvoices(
  mutator: (invoices: PurchaseInvoice[]) => PurchaseInvoice[],
): Promise<PurchaseInvoice[]> {
  const current = await getServerPurchaseInvoices();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("purchase_invoices").upsert(
      next.map((i) => ({ id: i.id, data: i })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((i) => i.id));
  const nextIds = new Set(next.map((i) => i.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("purchase_invoices").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
