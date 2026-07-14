import { useCallback, useEffect, useState } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { logAudit } from "@/lib/audit-log-store";
import { getDeviceId } from "@/lib/device-id";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  claimSessionOnServer,
  releaseSessionOnServer,
  forceLogoutOnServer,
  fetchSessionsOnServer,
} from "@/lib/session-api";
import type { ServerSessionRecord } from "@/lib/session-server-store";

export type Role = "Super Admin" | "Admin" | "Manager" | "Supervisor" | "Cashier";
export type UserStatus = "Active" | "Suspended" | "Inactive";
export type RegisterName = string;
export type PayType = "Hourly" | "Monthly";
export type EmploymentStatus = "Active" | "Terminated";

export type Certificate = {
  id: string;
  name: string;
  fileName: string;
  fileUrl: string;
};

export type EmployeeProfile = {
  photo: string | null;
  phone: string;
  jobTitle: string;
  department: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  salary: number | null;
  payType: PayType;
  nationalId: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  idCardPhoto: string | null;
  certificates: Certificate[];
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  password: string;
  role: Role;
  status: UserStatus;
  authorizedRegister: RegisterName | null;
  createdAt: string;
} & EmployeeProfile;

export type LoginResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: "invalid" | "suspended" | "inactive" }
  | { ok: false; reason: "already-logged-in"; message: string };

const emptyProfile: EmployeeProfile = {
  photo: null,
  phone: "",
  jobTitle: "",
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
  ...emptyProfile,
  jobTitle: "Owner",
};

const usersStoreInternal = createPersistedStore<AppUser[]>("dhipos-users", [seedAdmin]);
const sessionStoreInternal = createPersistedStore<{ email: string | null }>("dhipos-session", {
  email: null,
});

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function actor() {
  const email = sessionStoreInternal.get().email;
  return usersStoreInternal.get().find((u) => u.email === email)?.name ?? "System";
}

function currentRole(): string {
  const email = sessionStoreInternal.get().email;
  return usersStoreInternal.get().find((u) => u.email === email)?.role ?? "";
}

export const authStore = {
  usersSubscribe: usersStoreInternal.subscribe,
  getUsers: usersStoreInternal.get,
  sessionSubscribe: sessionStoreInternal.subscribe,
  getSession: sessionStoreInternal.get,

  hydrate() {
    usersStoreInternal.hydrate();
    sessionStoreInternal.hydrate();
  },

  getCurrentUser(): AppUser | null {
    const email = sessionStoreInternal.get().email;
    if (!email) return null;
    return usersStoreInternal.get().find((u) => u.email === email) ?? null;
  },

  // Only one device may be logged in as a given user at a time — claimed server-side
  // so it holds across devices, not just this browser's localStorage.
  async login(identifier: string, password: string): Promise<LoginResult> {
    const id = normalize(identifier);
    const match = usersStoreInternal
      .get()
      .find((u) => (u.email === id || u.username.toLowerCase() === id) && u.password === password);
    if (!match) return { ok: false, reason: "invalid" };
    if (match.status !== "Active") {
      return { ok: false, reason: match.status.toLowerCase() as "suspended" | "inactive" };
    }
    const claim = await claimSessionOnServer({
      data: { email: match.email, deviceId: getDeviceId() },
    });
    if ("error" in claim && claim.error) {
      return { ok: false, reason: "already-logged-in", message: claim.error };
    }
    sessionStoreInternal.set({ email: match.email });
    return { ok: true, user: match };
  },

  async logout() {
    const email = sessionStoreInternal.get().email;
    sessionStoreInternal.set({ email: null });
    if (email) {
      try {
        await releaseSessionOnServer({ data: { email } });
      } catch {
        // Best-effort — the local session is already cleared either way.
      }
    }
  },

  // Admin-only escape hatch for a session stuck claimed by an unreachable device
  // (e.g. the browser crashed without logging out). `role` is a client-supplied claim —
  // see the caveat in session-api.ts: this app has no server-verified auth, so it's a
  // UI-level guard consistent with the rest of the app's all-client-trust permission model.
  async forceLogout(email: string): Promise<{ ok: true } | { error: string }> {
    const result = await forceLogoutOnServer({ data: { email, role: currentRole() } });
    if ("error" in result) return result;
    logAudit(actor(), "update", `User / ${email} force-logged-out`);
    return { ok: true };
  },

  // Only an admin can add users — created directly and starts Active immediately.
  // Super Admin is a singleton seeded account and can never be created here.
  createUser(
    input: {
      name: string;
      email: string;
      username: string;
      password: string;
      role: Role;
    } & Partial<EmployeeProfile>,
  ): AppUser | { error: string } {
    if (input.role === "Super Admin") return { error: "Super Admin cannot be created" };
    const email = normalize(input.email);
    const username = normalize(input.username);
    const users = usersStoreInternal.get();
    if (users.some((u) => u.email === email))
      return { error: "A user with that email already exists" };
    if (users.some((u) => u.username.toLowerCase() === username))
      return { error: "That username is taken" };

    const user: AppUser = {
      id: `user-${Date.now()}`,
      name: input.name,
      email,
      username: input.username.trim(),
      password: input.password,
      role: input.role,
      status: "Active",
      authorizedRegister: null,
      createdAt: new Date().toISOString(),
      ...emptyProfile,
      photo: input.photo ?? null,
      phone: input.phone ?? "",
      jobTitle: input.jobTitle ?? "",
      department: input.department ?? "",
      hireDate: input.hireDate ?? "",
      employmentStatus: input.employmentStatus ?? "Active",
      salary: input.salary ?? null,
      payType: input.payType ?? "Monthly",
      nationalId: input.nationalId ?? "",
      address: input.address ?? "",
      emergencyContactName: input.emergencyContactName ?? "",
      emergencyContactPhone: input.emergencyContactPhone ?? "",
      idCardPhoto: input.idCardPhoto ?? null,
      certificates: input.certificates ?? [],
    };
    usersStoreInternal.set((us) => [...us, user]);
    logAudit(actor(), "create", `User / ${user.email}`);
    return user;
  },

  setStatus(id: string, status: UserStatus) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user || user.role === "Super Admin") return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, status } : u)));
    logAudit(actor(), "update", `User / ${user.email} set to ${status}`);
  },

  // Super Admin can't be assigned to anyone, and the Super Admin's own role can't be changed.
  setRole(id: string, role: Role) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user || user.role === "Super Admin" || role === "Super Admin") return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));
    logAudit(actor(), "update", `User / ${user.email} role changed to ${role}`);
  },

  // Updates name, role/register, and all employee-profile fields (job info, pay,
  // ID/emergency contact, photo). Does not touch email/username/password.
  updateProfile(
    id: string,
    patch: Partial<EmployeeProfile> & { name?: string; authorizedRegister?: RegisterName | null },
  ) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user) return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    logAudit(actor(), "update", `User / ${user.email} profile updated`);
  },

  removeUser(id: string) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user || user.role === "Super Admin") return;
    usersStoreInternal.set((us) => us.filter((u) => u.id !== id));
    logAudit(actor(), "delete", `User / ${user.email}`);
  },
};

export function useCurrentUser(): AppUser | null {
  const session = usePersistedStore(sessionStoreInternal);
  const users = usePersistedStore(usersStoreInternal);
  if (!session.email) return null;
  return users.find((u) => u.email === session.email) ?? null;
}

export function useUsers() {
  return usePersistedStore(usersStoreInternal);
}

// Which user emails currently hold a claimed login session (for the Admin Users page's
// "Logged In" indicator + Force Logout action). Fetches on mount; call `refresh()` again
// after a force-logout so the list reflects it immediately.
export function useActiveSessions() {
  const [sessions, setSessions] = useState<Record<string, ServerSessionRecord>>({});

  const refresh = useCallback(() => {
    fetchSessionsOnServer()
      .then(setSessions)
      .catch(() => {
        // Network hiccup — keep the last known snapshot.
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, refresh };
}
