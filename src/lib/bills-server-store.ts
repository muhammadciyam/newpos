import { getSupabase } from "@/lib/supabase-client";
import type { Bill } from "@/lib/pos-data";

// Server-only. Only bills-api.ts (the createServerFn boundary) should import this.
// Backed by Supabase — see supabase/migrations/0001_init.sql.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Same "DD-Mon-YY, HH:MM" format the app already uses everywhere else (register sessions,
// bills) — kept here since bill timestamps are always stamped server-side.
export function formatBillTimestamp(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

// Bill numbers look like "1/23" — the table has no separate ordering column, so newest-first
// is recovered by parsing the sequence number rather than relying on select() row order.
function billSeq(number: string): number {
  const seq = parseInt(number.split("/")[1] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}

export async function getServerBills(): Promise<Bill[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("bills").select("data");
  if (error) throw error;
  return data.map((row) => row.data as Bill).sort((a, b) => billSeq(b.number) - billSeq(a.number));
}

export async function mutateServerBills(mutator: (bills: Bill[]) => Bill[]): Promise<Bill[]> {
  const current = await getServerBills();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase
      .from("bills")
      .upsert(
        next.map((b) => ({ number: b.number, data: b })),
        { onConflict: "number" },
      );
    if (error) throw error;
  }
  const currentNumbers = new Set(current.map((b) => b.number));
  const nextNumbers = new Set(next.map((b) => b.number));
  const removedNumbers = [...currentNumbers].filter((n) => !nextNumbers.has(n));
  if (removedNumbers.length > 0) {
    const { error } = await supabase.from("bills").delete().in("number", removedNumbers);
    if (error) throw error;
  }
  return next;
}
