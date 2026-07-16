import { getSupabase } from "@/lib/supabase-client";

// Server-only. Never import this from a client component or from auth-store.ts's
// client-facing exports — it must stay out of the client bundle. Only session-api.ts
// (the createServerFn boundary) should import it.
//
// Backed by Supabase (see supabase/migrations/0001_init.sql) so a login session is
// visible/revocable from any device/process, not just whichever server handled the login.

export type ServerSessionRecord = { deviceId: string; loginAt: number };

// Keyed by normalized (lowercase, trimmed) email — one entry per currently "logged in" user.
export type ServerSessionState = Record<string, ServerSessionRecord>;

export async function getServerSessionState(): Promise<ServerSessionState> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("sessions").select("*");
  if (error) throw error;
  const state: ServerSessionState = {};
  for (const row of data) state[row.email] = { deviceId: row.device_id, loginAt: row.login_at };
  return state;
}

export async function mutateServerSessionState(
  mutator: (s: ServerSessionState) => ServerSessionState,
): Promise<ServerSessionState> {
  const current = await getServerSessionState();
  const next = mutator(current);
  const supabase = getSupabase();

  const nextEntries = Object.entries(next);
  if (nextEntries.length > 0) {
    const { error } = await supabase
      .from("sessions")
      .upsert(
        nextEntries.map(([email, r]) => ({ email, device_id: r.deviceId, login_at: r.loginAt })),
        { onConflict: "email" },
      );
    if (error) throw error;
  }
  const currentEmails = new Set(Object.keys(current));
  const nextEmails = new Set(Object.keys(next));
  const removedEmails = [...currentEmails].filter((e) => !nextEmails.has(e));
  if (removedEmails.length > 0) {
    const { error } = await supabase.from("sessions").delete().in("email", removedEmails);
    if (error) throw error;
  }
  return next;
}
