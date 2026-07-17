import { getSupabase } from "@/lib/supabase-client";
import type { WholesaleInventoryItem } from "@/lib/wholesale-inventory-store";

// Server-only. Only wholesale-inventory-api.ts should import this — never a client
// component. Backed by Supabase (see supabase/migrations/0003_wholesale_inventory.sql).

export async function getServerWholesaleInventory(): Promise<WholesaleInventoryItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("wholesale_inventory").select("data");
  if (error) throw error;
  return data.map((row) => row.data as WholesaleInventoryItem);
}

export async function mutateServerWholesaleInventory(
  mutator: (items: WholesaleInventoryItem[]) => WholesaleInventoryItem[],
): Promise<WholesaleInventoryItem[]> {
  const current = await getServerWholesaleInventory();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("wholesale_inventory").upsert(
      next.map((i) => ({ id: i.id, data: i })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((i) => i.id));
  const nextIds = new Set(next.map((i) => i.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("wholesale_inventory").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
