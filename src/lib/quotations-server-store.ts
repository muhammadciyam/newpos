import { getSupabase } from "@/lib/supabase-client";
import type { Quotation } from "@/lib/quotations-store";

// Server-only. Only quotations-api.ts should import this — never a client
// component. Backed by Supabase (see supabase/migrations/0013_quotations.sql).

export async function getServerQuotations(): Promise<Quotation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("quotations").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Quotation);
}

export async function mutateServerQuotations(
  mutator: (quotations: Quotation[]) => Quotation[],
): Promise<Quotation[]> {
  const current = await getServerQuotations();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("quotations").upsert(
      next.map((q) => ({ number: q.number, data: q })),
      { onConflict: "number" },
    );
    if (error) throw error;
  }
  return next;
}
