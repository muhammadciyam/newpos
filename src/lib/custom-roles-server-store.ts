import { getSupabase } from "@/lib/supabase-client";
import type { CustomRole } from "@/lib/custom-roles-store";

// Server-only. Only custom-roles-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0007_custom_roles.sql) so custom roles are
// shared across every device/process, not just whichever server happened to handle a request.

export async function getServerCustomRoles(): Promise<CustomRole[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("custom_roles").select("data");
  if (error) throw error;
  return data.map((row) => row.data as CustomRole);
}

export async function mutateServerCustomRoles(
  mutator: (roles: CustomRole[]) => CustomRole[],
): Promise<CustomRole[]> {
  const current = await getServerCustomRoles();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase.from("custom_roles").upsert(
      next.map((r) => ({ id: r.id, data: r })),
      { onConflict: "id" },
    );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((r) => r.id));
  const nextIds = new Set(next.map((r) => r.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("custom_roles").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
