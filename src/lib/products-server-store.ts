import { getSupabase } from "@/lib/supabase-client";
import { products as seedProducts, type Product } from "@/lib/pos-data";
import { getOrCreateDefaultOutlet } from "@/lib/outlets-server-store";

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

// Legacy products (created before per-outlet inventory existed) have no stockByOutlet
// breakdown yet — attribute their existing flat `stock` number entirely to the default
// outlet so nothing looks like it silently lost inventory. Best-effort: if the outlets
// table itself hasn't been migrated in yet, leave products as plain flat-stock for now
// rather than failing every product fetch.
async function backfillStockByOutlet(products: Product[]): Promise<Product[]> {
  const needsBackfill = products.some((p) => !p.stockByOutlet);
  if (!needsBackfill) return products;
  let defaultOutletId: string;
  try {
    defaultOutletId = (await getOrCreateDefaultOutlet()).id;
  } catch {
    return products;
  }
  return products.map((p) =>
    p.stockByOutlet ? p : { ...p, stockByOutlet: { [defaultOutletId]: p.stock } },
  );
}

export async function getServerProducts(): Promise<Product[]> {
  await ensureSeeded();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("products").select("data");
  if (error) throw error;
  return backfillStockByOutlet(data.map((row) => row.data as Product));
}

export async function mutateServerProducts(
  mutator: (products: Product[]) => Product[],
): Promise<Product[]> {
  const current = await getServerProducts();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("products").upsert(
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
// Positive delta adds stock, negative delta removes it (never below zero) — at the given
// outlet specifically; `stock` (the cross-outlet total) is recomputed alongside it so every
// aggregate-only reader (reports, analytics, product badges) keeps working unchanged.
export async function adjustStock(id: string, outletId: string, delta: number): Promise<void> {
  await mutateServerProducts((ps) =>
    ps.map((p) => {
      if (p.id !== id) return p;
      const byOutlet = { ...(p.stockByOutlet ?? {}) };
      byOutlet[outletId] = Math.max(0, (byOutlet[outletId] ?? 0) + delta);
      const stock = Object.values(byOutlet).reduce((sum, n) => sum + n, 0);
      return { ...p, stock, stockByOutlet: byOutlet };
    }),
  );
}
