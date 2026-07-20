import { createServerFn } from "@tanstack/react-start";
import { getServerUsers, mutateServerUsers } from "@/lib/users-server-store";
import type { AppUser, EmployeeProfile, Role, RegisterName, UserStatus } from "@/lib/auth-store";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

// Mirrors canManageProduct in products-api.ts — an outlet's staff directory is that
// outlet's own, same as its product catalog. Super Admin manages everyone; anyone else only
// their own outlet's non-Super-Admin accounts.
function canManageUser(target: AppUser, role: string, callerOutletId: string | null): boolean {
  if (role === "Super Admin") return true;
  if (target.role === "Super Admin") return false;
  return target.outletId !== null && target.outletId === callerOutletId;
}

// Never send the password back to any client beyond what's needed to authenticate —
// the directory listing (Admin > Users, Admin > Employees) never displays or edits it.
function scrub(user: AppUser): AppUser {
  return { ...user, password: "" };
}

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

export const fetchUsersOnServer = createServerFn({ method: "GET" }).handler(async () => {
  return (await getServerUsers()).map(scrub);
});

export const loginOnServer = createServerFn({ method: "POST" })
  .validator((data: { identifier: string; password: string }) => data)
  .handler(async ({ data }) => {
    const id = normalize(data.identifier);
    const match = (await getServerUsers()).find(
      (u) => (u.email === id || u.username.toLowerCase() === id) && u.password === data.password,
    );
    if (!match) return { error: "invalid" as const };
    if (match.status !== "Active") {
      return { error: match.status.toLowerCase() as "suspended" | "inactive" };
    }
    return { ok: true as const, user: scrub(match) };
  });

export const createUserOnServer = createServerFn({ method: "POST" })
  .validator(
    (
      data: {
        name: string;
        email: string;
        username: string;
        password: string;
        role: Role;
        outletId: string | null;
        callerRole: string;
        callerOutletId: string | null;
      } & Partial<EmployeeProfile>,
    ) => data,
  )
  .handler(async ({ data }) => {
    if (data.role === "Super Admin") return { error: "Super Admin cannot be created" };
    if (!data.outletId) return { error: "Outlet is required" };
    // A non-Super-Admin can only staff their own outlet — mirrors product creation, where
    // Super Admin picks any outlet and everyone else is locked to their own.
    if (data.callerRole !== "Super Admin" && data.outletId !== data.callerOutletId) {
      return { error: "You can only add users to your own outlet" };
    }
    const email = normalize(data.email);
    const username = normalize(data.username);
    const users = await getServerUsers();
    if (users.some((u) => u.email === email)) {
      return { error: "A user with that email already exists" };
    }
    if (users.some((u) => u.username.toLowerCase() === username)) {
      return { error: "That username is taken" };
    }

    const user: AppUser = {
      id: `user-${Date.now()}`,
      name: data.name,
      email,
      username: data.username.trim(),
      password: data.password,
      role: data.role,
      status: "Active",
      authorizedRegister: null,
      outletId: data.outletId,
      createdAt: new Date().toISOString(),
      ...emptyProfile,
      photo: data.photo ?? null,
      phone: data.phone ?? "",
      jobTitle: data.jobTitle ?? "",
      department: data.department ?? "",
      hireDate: data.hireDate ?? "",
      employmentStatus: data.employmentStatus ?? "Active",
      salary: data.salary ?? null,
      payType: data.payType ?? "Monthly",
      nationalId: data.nationalId ?? "",
      address: data.address ?? "",
      emergencyContactName: data.emergencyContactName ?? "",
      emergencyContactPhone: data.emergencyContactPhone ?? "",
      idCardPhoto: data.idCardPhoto ?? null,
      certificates: data.certificates ?? [],
    };
    await mutateServerUsers((us) => [...us, user]);
    return { ok: true as const, user: scrub(user) };
  });

// Deliberately separate from createUserOnServer (which refuses role "Super Admin" outright)
// — this is the one path allowed to mint additional Super Admins, gated client-side to
// existing Super Admins only (see src/routes/admin.super-admin.tsx).
export const createSuperAdminOnServer = createServerFn({ method: "POST" })
  .validator((data: { name: string; email: string; username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const email = normalize(data.email);
    const username = normalize(data.username);
    const users = await getServerUsers();
    if (users.some((u) => u.email === email)) {
      return { error: "A user with that email already exists" };
    }
    if (users.some((u) => u.username.toLowerCase() === username)) {
      return { error: "That username is taken" };
    }

    const user: AppUser = {
      id: `user-${Date.now()}`,
      name: data.name,
      email,
      username: data.username.trim(),
      password: data.password,
      role: "Super Admin",
      status: "Active",
      authorizedRegister: null,
      // Super Admin isn't scoped to one outlet — full access everywhere.
      outletId: null,
      createdAt: new Date().toISOString(),
      ...emptyProfile,
    };
    await mutateServerUsers((us) => [...us, user]);
    return { ok: true as const, user: scrub(user) };
  });

export const setStatusOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; status: UserStatus; role: string; callerOutletId: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || !canManageUser(user, data.role, data.callerOutletId)) {
      return { error: "Cannot change this user's status" };
    }
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, status: data.status } : u)),
    );
    return { ok: true as const, email: user.email };
  });

export const setRoleOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; role: Role; callerRole: string; callerOutletId: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (
      !user ||
      !canManageUser(user, data.callerRole, data.callerOutletId) ||
      data.role === "Super Admin"
    ) {
      return { error: "Cannot change this user's role" };
    }
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, role: data.role } : u)),
    );
    return { ok: true as const, email: user.email };
  });

// Admin-side "Reset Password" action (Admin > Users) — the working-today fallback for
// getting a user back into their account while email-based reset (password-reset-api.ts)
// isn't configured yet, or simply preferred over waiting on an email.
export const setPasswordOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; password: string; role: string; callerOutletId: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || !canManageUser(user, data.role, data.callerOutletId)) {
      return { error: "Cannot change this user's password" };
    }
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, password: data.password } : u)),
    );
    return { ok: true as const, email: user.email };
  });

export const updateProfileOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<EmployeeProfile> & {
        name?: string;
        authorizedRegister?: RegisterName | null;
        outletId?: string | null;
      };
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || !canManageUser(user, data.role, data.callerOutletId)) {
      return { error: "User not found" };
    }
    // Only Super Admin can move a user to a different outlet — an outlet-scoped Admin
    // reassigning their own staff elsewhere would just be moving them out from under
    // themselves (and out of their own visibility) by surprise. Destructure it out rather
    // than setting it to undefined, which would spread over and wipe the existing value.
    const { outletId: _ignoredOutletId, ...restPatch } = data.patch;
    const patch = data.role === "Super Admin" ? data.patch : restPatch;
    await mutateServerUsers((us) => us.map((u) => (u.id === data.id ? { ...u, ...patch } : u)));
    return { ok: true as const, email: user.email };
  });

export const removeUserOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: string; callerOutletId: string | null }) => data)
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || !canManageUser(user, data.role, data.callerOutletId)) {
      return { error: "Cannot remove this user" };
    }
    await mutateServerUsers((us) => us.filter((u) => u.id !== data.id));
    return { ok: true as const, email: user.email };
  });
