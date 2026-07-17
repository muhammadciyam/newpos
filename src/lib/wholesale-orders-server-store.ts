import { getSupabase } from "@/lib/supabase-client";
import type { WholesaleOrder } from "@/lib/wholesale-orders-store";

// Server-only. Only wholesale-orders-api.ts should import this — never a client
// component. Backed by Supabase (see supabase/migrations/0005_wholesale_orders.sql).

export async function getServerWholesaleOrders(): Promise<WholesaleOrder[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("wholesale_orders").select("data");
  if (error) throw error;
  return data.map((row) => row.data as WholesaleOrder);
}

export async function mutateServerWholesaleOrders(
  mutator: (orders: WholesaleOrder[]) => WholesaleOrder[],
): Promise<WholesaleOrder[]> {
  const current = await getServerWholesaleOrders();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("wholesale_orders").upsert(
      next.map((o) => ({ id: o.id, data: o })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  return next;
}
