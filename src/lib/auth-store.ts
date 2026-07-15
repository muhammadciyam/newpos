import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { logAudit } from "@/lib/audit-log-store";
import { getDeviceId } from "@/lib/device-id";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  claimSessionOnServer,
  checkSessionOnServer,
  releaseSessionOnServer,
  forceLogoutOnServer,
  fetchSessionsOnServer,
} from "@/lib/session-api";
import type { ServerSessionRecord } from "@/lib/session-server-store";
import {
  fetchUsersOnServer,
  loginOnServer,
  createUserOnServer,
  setStatusOnServer,
  setRoleOnServer,
  updateProfileOnServer,
  removeUserOnServer,
} from "@/lib/users-api";

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
  | { ok: false; reason: "network"; message: string };

// Only this device's "which email am I logged in as" is local — the account directory
// itself lives on the server (users-server-store.ts) so a user created on one device
// can log in from any device, the same fix already applied to registers and sessions.
const sessionStoreInternal = createPersistedStore<{ email: string | null }>("dhipos-session", {
  email: null,
});

function normalize(value: string) {
  return value.trim().toLowerCase();
}

// --- Shared (server-backed) user directory cache ---

let serverUsers: AppUser[] = [];
const userListeners = new Set<() => void>();

function setServerUsers(next: AppUser[]) {
  serverUsers = next;
  userListeners.forEach((l) => l());
}

async function refreshUsersFromServer() {
  try {
    const result = await fetchUsersOnServer();
    setServerUsers(result);
  } catch {
    // Network hiccup — keep the last known snapshot; individual actions surface their own errors.
  }
}

let initialUsersFetchTriggered = false;
function ensureInitialUsersFetch() {
  if (initialUsersFetchTriggered) return;
  initialUsersFetchTriggered = true;
  void refreshUsersFromServer();
}

function useServerUsers(): AppUser[] {
  useEffect(() => ensureInitialUsersFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      userListeners.add(cb);
      return () => userListeners.delete(cb);
    },
    () => serverUsers,
    () => serverUsers,
  );
}

// Actively refetches on mount and every `intervalMs` — call this from admin pages
// (Users, Employees) that want near-live visibility of accounts created elsewhere.
export function useUsersPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshUsersFromServer();
    const id = setInterval(() => void refreshUsersFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function actor() {
  const email = sessionStoreInternal.get().email;
  return serverUsers.find((u) => u.email === email)?.name ?? "System";
}

function currentRole(): string {
  const email = sessionStoreInternal.get().email;
  return serverUsers.find((u) => u.email === email)?.role ?? "";
}

export const authStore = {
  sessionSubscribe: sessionStoreInternal.subscribe,
  getSession: sessionStoreInternal.get,

  // Awaits the user directory's first fetch so getCurrentUser() doesn't spuriously
  // return null for a genuinely logged-in user before the server cache has loaded.
  async hydrate() {
    sessionStoreInternal.hydrate();
    if (!initialUsersFetchTriggered) {
      initialUsersFetchTriggered = true;
      await refreshUsersFromServer();
    }
  },

  getCurrentUser(): AppUser | null {
    const email = sessionStoreInternal.get().email;
    if (!email) return null;
    return serverUsers.find((u) => u.email === email) ?? null;
  },

  // Logging in on a new device always wins — it takes over the session server-side.
  // Whichever device held it previously discovers this via isSessionStillMine() polling
  // (see app-shell.tsx) and is logged out locally, with a message explaining why.
  async login(identifier: string, password: string): Promise<LoginResult> {
    const login = await safeServerCall(() => loginOnServer({ data: { identifier, password } }));
    if ("networkError" in login) {
      return { ok: false, reason: "network", message: login.error };
    }
    if ("error" in login) {
      // loginOnServer only ever returns one of these three literals here.
      return { ok: false, reason: login.error as "invalid" | "suspended" | "inactive" };
    }
    const claim = await safeServerCall(() =>
      claimSessionOnServer({ data: { email: login.user.email, deviceId: getDeviceId() } }),
    );
    if ("networkError" in claim) {
      return { ok: false, reason: "network", message: claim.error };
    }
    sessionStoreInternal.set({ email: login.user.email });
    void refreshUsersFromServer();
    return { ok: true, user: login.user };
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

  // Clears only this device's local session — used when this device just discovered
  // (via isSessionStillMine) that another device took over the login elsewhere. Must
  // NOT release the server-side claim, since that claim now legitimately belongs to
  // the other device; releasing it here would incorrectly kick that device out too.
  clearLocalSession() {
    sessionStoreInternal.set({ email: null });
  },

  // Polled periodically while logged in (see app-shell.tsx) to detect a takeover by
  // another device. Fails open on network errors — don't kick someone out over a
  // transient connectivity blip, only when the server explicitly says it's no longer ours.
  async isSessionStillMine(): Promise<boolean> {
    const email = sessionStoreInternal.get().email;
    if (!email) return true;
    const result = await safeServerCall(() =>
      checkSessionOnServer({ data: { email, deviceId: getDeviceId() } }),
    );
    if ("error" in result) return true;
    return result.valid;
  },

  // Admin-only escape hatch for a session stuck claimed by an unreachable device
  // (e.g. the browser crashed without logging out). `role` is a client-supplied claim —
  // see the caveat in session-api.ts: this app has no server-verified auth, so it's a
  // UI-level guard consistent with the rest of the app's all-client-trust permission model.
  async forceLogout(email: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      forceLogoutOnServer({ data: { email, role: currentRole() } }),
    );
    if ("error" in result) return result;
    logAudit(actor(), "update", `User / ${email} force-logged-out`);
    return { ok: true };
  },

  // Only an admin can add users — created directly and starts Active immediately.
  // Super Admin is a singleton seeded account and can never be created here.
  async createUser(
    input: {
      name: string;
      email: string;
      username: string;
      password: string;
      role: Role;
    } & Partial<EmployeeProfile>,
  ): Promise<AppUser | { error: string }> {
    const result = await safeServerCall(() => createUserOnServer({ data: input }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return { error: result.error as string };
    await refreshUsersFromServer();
    logAudit(actor(), "create", `User / ${result.user.email}`);
    return result.user;
  },

  async setStatus(id: string, status: UserStatus): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => setStatusOnServer({ data: { id, status } }));
    if ("error" in result) return result;
    await refreshUsersFromServer();
    logAudit(actor(), "update", `User / ${result.email} set to ${status}`);
    return { ok: true };
  },

  // Super Admin can't be assigned to anyone, and the Super Admin's own role can't be changed.
  async setRole(id: string, role: Role): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => setRoleOnServer({ data: { id, role } }));
    if ("error" in result) return result;
    await refreshUsersFromServer();
    logAudit(actor(), "update", `User / ${result.email} role changed to ${role}`);
    return { ok: true };
  },

  // Updates name, role/register, and all employee-profile fields (job info, pay,
  // ID/emergency contact, photo). Does not touch email/username/password.
  async updateProfile(
    id: string,
    patch: Partial<EmployeeProfile> & { name?: string; authorizedRegister?: RegisterName | null },
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => updateProfileOnServer({ data: { id, patch } }));
    if ("error" in result) return result;
    await refreshUsersFromServer();
    logAudit(actor(), "update", `User / ${result.email} profile updated`);
    return { ok: true };
  },

  async removeUser(id: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => removeUserOnServer({ data: { id } }));
    if ("error" in result) return result;
    await refreshUsersFromServer();
    logAudit(actor(), "delete", `User / ${result.email}`);
    return { ok: true };
  },
};

export function useCurrentUser(): AppUser | null {
  const session = usePersistedStore(sessionStoreInternal);
  const users = useServerUsers();
  if (!session.email) return null;
  return users.find((u) => u.email === session.email) ?? null;
}

export function useUsers() {
  return useServerUsers();
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
