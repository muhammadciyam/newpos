import { getSupabase } from "@/lib/supabase-client";
import type { CartItem } from "@/lib/cart-store";

// Server-only. Only cart-api.ts should import this — never a client component.
// Backed by Supabase (see supabase/migrations/0004_cart.sql).

export async function getServerCart(): Promise<CartItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("cart_items").select("data");
  if (error) throw error;
  return data.map((row) => row.data as CartItem);
}

export async function mutateServerCart(
  mutator: (items: CartItem[]) => CartItem[],
): Promise<CartItem[]> {
  const current = await getServerCart();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("cart_items").upsert(
      next.map((i) => ({ id: i.productId, data: i })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((i) => i.productId));
  const nextIds = new Set(next.map((i) => i.productId));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("cart_items").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
