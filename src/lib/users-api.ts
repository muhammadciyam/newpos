import { createServerFn } from "@tanstack/react-start";
import { getServerUsers, mutateServerUsers } from "@/lib/users-server-store";
import type { AppUser, EmployeeProfile, Role, RegisterName, UserStatus } from "@/lib/auth-store";

function normalize(value: string) {
  return value.trim().toLowerCase();
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
      } & Partial<EmployeeProfile>,
    ) => data,
  )
  .handler(async ({ data }) => {
    if (data.role === "Super Admin") return { error: "Super Admin cannot be created" };
    if (!data.outletId) return { error: "Outlet is required" };
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
  .validator((data: { id: string; status: UserStatus }) => data)
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || user.role === "Super Admin") return { error: "Cannot change this user's status" };
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, status: data.status } : u)),
    );
    return { ok: true as const, email: user.email };
  });

export const setRoleOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: Role }) => data)
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || user.role === "Super Admin" || data.role === "Super Admin") {
      return { error: "Cannot change this user's role" };
    }
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, role: data.role } : u)),
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
    }) => data,
  )
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user) return { error: "User not found" };
    await mutateServerUsers((us) =>
      us.map((u) => (u.id === data.id ? { ...u, ...data.patch } : u)),
    );
    return { ok: true as const, email: user.email };
  });

export const removeUserOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const user = (await getServerUsers()).find((u) => u.id === data.id);
    if (!user || user.role === "Super Admin") return { error: "Cannot remove this user" };
    await mutateServerUsers((us) => us.filter((u) => u.id !== data.id));
    return { ok: true as const, email: user.email };
  });
