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
  createSuperAdminOnServer,
  setStatusOnServer,
  setRoleOnServer,
  setPasswordOnServer,
  updateProfileOnServer,
  removeUserOnServer,
} from "@/lib/users-api";

// The 5 built-in roles ship with a fixed permission set (see permissions.ts). A Super Admin
// can also define custom roles (Admin > Users > Create Role) with a hand-picked permission
// set — so `Role` accepts any string, not just these 5 literals.
export const BUILT_IN_ROLES = ["Admin", "Manager", "Supervisor", "Cashier"] as const;
export type BuiltInRole = "Super Admin" | (typeof BUILT_IN_ROLES)[number];
export type Role = string;
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
  // Which outlet this user works at — required when creating a user from Admin > Users or
  // Admin > Employees. Nullable only because users created before this field existed have
  // none set.
  outletId: string | null;
  createdAt: string;
} & EmployeeProfile;

export type LoginResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: "invalid" | "suspended" | "inactive" }
  | { ok: false; reason: "network"; message: string }
  // The outlet typed on the login form isn't this account's assigned outlet — carries
  // the assigned outlet's id so the caller can show its actual name.
  | { ok: false; reason: "outlet-mismatch"; expectedOutletId: string };

// Only this device's "which email am I logged in as" is local — the account directory
// itself lives on the server (users-server-store.ts) so a user created on one device
// can log in from any device, the same fix already applied to registers and sessions.
const sessionStoreInternal = createPersistedStore<{
  email: string | null;
  // The outlet name typed on the login form, matched against Outlet.id — must match this
  // account's own assigned outlet (see login() below), and drives which outlet's name
  // shows as storeName (header/sidebar/register/receipts). Actual data scoping
  // (registers/bills/reports) instead uses the account's own outletId — see outlet-scope.ts.
  outletId: string | null;
}>("dhipos-session", {
  email: null,
  outletId: null,
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
  } catch (err) {
    // Network hiccup — keep the last known snapshot; individual actions surface their own errors.
    console.error("refreshUsersFromServer failed:", err);
  }
}

// Shared by every caller (there are several — useServerUsers() below, and
// authStore.hydrate()) so whichever one runs first is the one everyone else actually waits
// on, rather than each just checking a boolean and assuming someone else has it handled.
// That "assume someone else is on it" version raced on a hard reload of any AppShell page
// that also calls useCurrentUser()/useUsers(): React fires child effects before parent
// effects, so the page's own useServerUsers() effect kicked off the fetch first, and
// AppShell's hydrate() call — seeing the flag already set — returned immediately without
// actually waiting for that fetch to finish, so its getCurrentUser() check ran against a
// still-empty user list and treated a genuinely logged-in session as logged out, bouncing
// through /login to "/" instead of staying on the page that was reloaded.
let initialUsersFetchPromise: Promise<void> | null = null;
function ensureInitialUsersFetch(): Promise<void> {
  if (!initialUsersFetchPromise) {
    initialUsersFetchPromise = refreshUsersFromServer();
  }
  return initialUsersFetchPromise;
}

function useServerUsers(): AppUser[] {
  useEffect(() => {
    void ensureInitialUsersFetch();
  }, []);
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
    await ensureInitialUsersFetch();
  },

  getCurrentUser(): AppUser | null {
    const email = sessionStoreInternal.get().email;
    if (!email) return null;
    return serverUsers.find((u) => u.email === email) ?? null;
  },

  // Logging in on a new device always wins — it takes over the session server-side.
  // Whichever device held it previously discovers this via isSessionStillMine() polling
  // (see app-shell.tsx) and is logged out locally, with a message explaining why.
  async login(identifier: string, password: string, outletId: string | null): Promise<LoginResult> {
    const login = await safeServerCall(() => loginOnServer({ data: { identifier, password } }));
    if ("networkError" in login) {
      return { ok: false, reason: "network", message: login.error };
    }
    if ("error" in login) {
      // loginOnServer only ever returns one of these three literals here.
      return { ok: false, reason: login.error as "invalid" | "suspended" | "inactive" };
    }
    // Reject before claiming a session — a user assigned to one outlet must not be able
    // to log in under a different outlet's name (that would silently mislabel their
    // header/sidebar/register view as the wrong outlet). Super Admin isn't tied to one
    // outlet and unassigned accounts have nothing to check against, so both skip this.
    if (
      login.user.role !== "Super Admin" &&
      login.user.outletId &&
      login.user.outletId !== outletId
    ) {
      return { ok: false, reason: "outlet-mismatch", expectedOutletId: login.user.outletId };
    }
    const claim = await safeServerCall(() =>
      claimSessionOnServer({ data: { email: login.user.email, deviceId: getDeviceId() } }),
    );
    if ("networkError" in claim) {
      return { ok: false, reason: "network", message: claim.error };
    }
    sessionStoreInternal.set({ email: login.user.email, outletId });
    void refreshUsersFromServer();
    return { ok: true, user: login.user };
  },

  async logout() {
    const email = sessionStoreInternal.get().email;
    sessionStoreInternal.set({ email: null, outletId: null });
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
    sessionStoreInternal.set({ email: null, outletId: null });
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
      outletId: string | null;
    } & Partial<EmployeeProfile>,
  ): Promise<AppUser | { error: string }> {
    const result = await safeServerCall(() => createUserOnServer({ data: input }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return { error: result.error as string };
    await refreshUsersFromServer();
    logAudit(actor(), "create", `User / ${result.user.email}`);
    return result.user;
  },

  // Mints an additional Super Admin. Gated client-side to existing Super Admins only (see
  // src/routes/admin.super-admin.tsx) — there is no server-verified auth in this app, so
  // this is a UI-level guard consistent with the rest of the app's all-client-trust model.
  async createSuperAdmin(input: {
    name: string;
    email: string;
    username: string;
    password: string;
  }): Promise<AppUser | { error: string }> {
    const result = await safeServerCall(() => createSuperAdminOnServer({ data: input }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return { error: result.error as string };
    await refreshUsersFromServer();
    logAudit(actor(), "create", `User / ${result.user.email} (Super Admin)`);
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

  // Admin-side password reset (Admin > Users) — doesn't require Resend to be configured.
  async setPassword(id: string, password: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => setPasswordOnServer({ data: { id, password } }));
    if ("error" in result) return result;
    await refreshUsersFromServer();
    logAudit(actor(), "update", `User / ${result.email} password reset by admin`);
    return { ok: true };
  },

  // Updates name, role/register, outlet, and all employee-profile fields (job info, pay,
  // ID/emergency contact, photo). Does not touch email/username/password.
  async updateProfile(
    id: string,
    patch: Partial<EmployeeProfile> & {
      name?: string;
      authorizedRegister?: RegisterName | null;
      outletId?: string | null;
    },
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

// The outlet matched against the name typed on the login form (see login.tsx) — reactive,
// so anything displaying "which outlet am I in" updates immediately after a fresh login.
export function useCurrentOutletId(): string | null {
  const session = usePersistedStore(sessionStoreInternal);
  return session.outletId;
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
