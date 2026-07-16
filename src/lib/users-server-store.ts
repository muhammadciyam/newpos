import { getSupabase } from "@/lib/supabase-client";
import type { AppUser } from "@/lib/auth-store";

// Server-only. Never import this from a client component or from auth-store.ts's
// client-facing exports — it must stay out of the client bundle. Only users-api.ts
// (the createServerFn boundary) should import it.
//
// This is the canonical account directory, backed by Supabase (see
// supabase/migrations/0001_init.sql) so an account created on one device works from any
// other device/process — the same fix already applied to registers and login sessions.

const seedAdmin: AppUser = {
  id: "seed-admin",
  name: "Owner",
  email: "siyante003@gmail.com",
  username: "siyante003",
  password: "229022#",
  role: "Super Admin",
  status: "Active",
  authorizedRegister: null,
  createdAt: new Date("2026-07-13T07:00:00").toISOString(),
  photo: null,
  phone: "",
  jobTitle: "Owner",
  department: "",
  hireDate: "",
  employmentStatus: "Active",
  salary: null,
  payType: "Monthly",
  nationalId: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  idCardPhoto: null,
  certificates: [],
};

let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  seeded = true;
  const supabase = getSupabase();
  const { count, error } = await supabase.from("users").select("id", { count: "exact", head: true });
  if (error) throw error;
  if (count === 0) {
    const { error: insertError } = await supabase.from("users").insert({
      id: seedAdmin.id,
      email: seedAdmin.email,
      username: seedAdmin.username,
      data: seedAdmin,
    });
    if (insertError) throw insertError;
  }
}

export async function getServerUsers(): Promise<AppUser[]> {
  await ensureSeeded();
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("data");
  if (error) throw error;
  return data.map((row) => row.data as AppUser);
}

export async function mutateServerUsers(
  mutator: (users: AppUser[]) => AppUser[],
): Promise<AppUser[]> {
  const current = await getServerUsers();
  const next = mutator(current);
  const supabase = getSupabase();

  if (next.length > 0) {
    const { error } = await supabase
      .from("users")
      .upsert(
        next.map((u) => ({ id: u.id, email: u.email, username: u.username, data: u })),
        { onConflict: "id" },
      );
    if (error) throw error;
  }
  const currentIds = new Set(current.map((u) => u.id));
  const nextIds = new Set(next.map((u) => u.id));
  const removedIds = [...currentIds].filter((id) => !nextIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase.from("users").delete().in("id", removedIds);
    if (error) throw error;
  }
  return next;
}
