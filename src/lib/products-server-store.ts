import { getSupabase } from "@/lib/supabase-client";
import { products as seedProducts, type Product } from "@/lib/pos-data";

// Server-only. Only products-api.ts and bills-api.ts (which adjusts stock as part of a
// bill mutation, in the same process) should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0001_init.sql) so the product catalog is
// shared across every device/process, not just whichever server happened to handle a
// given request.

let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  if (count === 0) {
    const { error: insertError } = await supabase
      .from("products")
      .insert(seedProducts.map((p) => ({ id: p.id, data: p })));
    if (insertError) throw insertError;
  }
}

export async function getServerProducts(): Promise<Product[]> {
  await ensureSeeded();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("products").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Product);
}

export async function mutateServerProducts(
  mutator: (products: Product[]) => Product[],
): Promise<Product[]> {
  const current = await getServerProducts();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase
      .from("products")
      .upsert(
        next.map((p) => ({ id: p.id, data: p })),
        { onConflict: "id" },
      );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((p) => p.id));
  const nextIds = new Set(next.map((p) => p.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("products").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}

// Plain (non-createServerFn) helper so bills-api.ts can adjust stock atomically as part of
// a bill create/edit/void/refund, in the same server process, without a second round trip.
// Positive delta adds stock, negative delta removes it (never below zero).
export async function adjustStock(id: string, delta: number): Promise<void> {
  await mutateServerProducts((ps) =>
    ps.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p)),
  );
}
