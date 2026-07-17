import { getSupabase } from "@/lib/supabase-client";
import type { Wholesaler } from "@/lib/wholesalers-store";

// Server-only. Only wholesalers-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0002_wholesalers.sql) so the wholesaler
// directory is shared across every device/process, not just whichever server happened to
// handle a given request.

export async function getServerWholesalers(): Promise<Wholesaler[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("wholesalers").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Wholesaler);
}

export async function mutateServerWholesalers(
  mutator: (wholesalers: Wholesaler[]) => Wholesaler[],
): Promise<Wholesaler[]> {
  const current = await getServerWholesalers();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("wholesalers").upsert(
      next.map((w) => ({ id: w.id, data: w })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((w) => w.id));
  const nextIds = new Set(next.map((w) => w.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("wholesalers").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
