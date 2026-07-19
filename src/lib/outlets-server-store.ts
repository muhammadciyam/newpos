import { getSupabase } from "@/lib/supabase-client";
import type { Outlet } from "@/lib/outlets-store";

// Server-only. Only outlets-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0006_outlets.sql) so the outlet directory is
// shared across every device/process, not just whichever server happened to handle a given
// request.

export async function getServerOutlets(): Promise<Outlet[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("outlets").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Outlet);
}

// The default outlet existing single-store data (products' flat stock count, the seeded
// "Counter 1" register) is attributed to, so nothing breaks for a shop that hasn't
// explicitly set up multiple outlets yet. Named to match the register/store constant this
// app already shipped with (see register-server-store.ts's STORE_NAME).
const DEFAULT_OUTLET_NAME = "Seven Mart";

export async function getOrCreateDefaultOutlet(): Promise<Outlet> {
  const outlets = await getServerOutlets();
  const existing = outlets.find((o) => o.name === DEFAULT_OUTLET_NAME) ?? outlets[0];
  if (existing) return existing;
  const outlet: Outlet = {
    id: `outlet-${Date.now()}`,
    name: DEFAULT_OUTLET_NAME,
    address: "",
    phone: "",
    active: true,
    createdAt: new Date().toISOString(),
  };
  await mutateServerOutlets((os) => [outlet, ...os]);
  return outlet;
}

export async function mutateServerOutlets(
  mutator: (outlets: Outlet[]) => Outlet[],
): Promise<Outlet[]> {
  const current = await getServerOutlets();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("outlets").upsert(
      next.map((o) => ({ id: o.id, data: o })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((o) => o.id));
  const nextIds = new Set(next.map((o) => o.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("outlets").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
