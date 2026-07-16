import { getSupabase } from "@/lib/supabase-client";

// Server-only. Only audit-log-api.ts (the createServerFn boundary) should import this.
// Backed by Supabase (see supabase/migrations/0001_init.sql). Unlike the old node:fs
// version, older entries are never deleted — the 500-entry cap is applied at read time
// so the full audit trail is retained in the database. Ordered by the event's own `at`
// timestamp (not insertion/id order) so backfilling older history never outranks entries
// that were already written live.

export type ServerAuditLog = {
  user: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "view";
  object: string;
  at: string;
};

export async function getServerAuditLog(): Promise<ServerAuditLog[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("audit_log")
    .select("data")
    .order("at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data.map((row) => row.data as ServerAuditLog);
}

export async function appendServerAuditLog(entry: ServerAuditLog): Promise<ServerAuditLog[]> {
  const supabase = getSupabase();
  const { error } = await supabase.from("audit_log").insert({ at: entry.at, data: entry });
  if (error) throw error;
  return getServerAuditLog();
}
