import { getSupabase } from "@/lib/supabase-client";
import type { CartItem } from "@/lib/cart-store";

// Server-only. Only cart-api.ts should import this — never a client component.
// Backed by Supabase (see supabase/migrations/0004_cart.sql).

// Each outlet has its own cart, so the row's identity has to be the (outlet, product) pair,
// not just the product — otherwise two outlets adding the same catalogue product would
// collide onto one shared row instead of each getting their own.
function rowId(item: { outletId: string | null; productId: string }): string {
  return `${item.outletId ?? "none"}:${item.productId}`;
}

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
      next.map((i) => ({ id: rowId(i), data: i })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((i) => rowId(i)));
  const nextIds = new Set(next.map((i) => rowId(i)));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  // One-time cleanup for rows saved before per-outlet carts existed — those sit under the
  // old plain-productId id instead of today's `${outletId}:${productId}` one, so they'd
  // otherwise never be addressed (or deleted) again and would linger as invisible ghosts
  // forever. Harmless no-op once every legacy row's been touched at least once.
  const legacyIds = next.map((i) => i.productId);
  if (removedIds.length > 0 || legacyIds.length > 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .in("id", [...removedIds, ...legacyIds]);
    if (error) throw error;
  }
  return next;
}
