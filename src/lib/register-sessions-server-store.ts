import { getSupabase } from "@/lib/supabase-client";
import type { RegisterSession } from "@/lib/pos-data";

// Server-only. Only register-sessions-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0011_register_sessions.sql) so register
// open/close history is shared across every device/user, not just local storage.

export async function getServerRegisterSessions(): Promise<RegisterSession[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("register_sessions").select("data");
  if (error) throw error;
  return data.map((row) => row.data as RegisterSession);
}

export async function mutateServerRegisterSessions(
  mutator: (sessions: RegisterSession[]) => RegisterSession[],
): Promise<RegisterSession[]> {
  const current = await getServerRegisterSessions();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("register_sessions").upsert(
      next.map((s) => ({ id: s.id, data: s })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((s) => s.id));
  const nextIds = new Set(next.map((s) => s.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("register_sessions").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
