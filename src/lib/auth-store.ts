import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { logAudit } from "@/lib/audit-log-store";

export type Role = "Admin" | "Manager" | "Supervisor" | "Cashier";
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
  | { ok: false; reason: "invalid" | "suspended" | "inactive" };

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
  name: "Mohamed Siyam",
  email: "siyam69@gmail.com",
  username: "siyam69",
  password: "229022#",
  role: "Admin",
  status: "Active",
  authorizedRegister: null,
  createdAt: new Date("2026-07-13T07:00:00").toISOString(),
  ...emptyProfile,
  jobTitle: "Owner / Administrator",
};

const usersStoreInternal = createPersistedStore<AppUser[]>("dhipos-users", [seedAdmin]);
const sessionStoreInternal = createPersistedStore<{ email: string | null }>("dhipos-session", { email: null });

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function actor() {
  const email = sessionStoreInternal.get().email;
  return usersStoreInternal.get().find((u) => u.email === email)?.name ?? "System";
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

  login(identifier: string, password: string): LoginResult {
    const id = normalize(identifier);
    const match = usersStoreInternal
      .get()
      .find((u) => (u.email === id || u.username.toLowerCase() === id) && u.password === password);
    if (!match) return { ok: false, reason: "invalid" };
    if (match.status !== "Active") {
      return { ok: false, reason: match.status.toLowerCase() as "suspended" | "inactive" };
    }
    sessionStoreInternal.set({ email: match.email });
    return { ok: true, user: match };
  },

  logout() {
    sessionStoreInternal.set({ email: null });
  },

  // Only an admin can add users — created directly and starts Active immediately.
  createUser(
    input: { name: string; email: string; username: string; password: string; role: Role } & Partial<EmployeeProfile>,
  ): AppUser | { error: string } {
    const email = normalize(input.email);
    const username = normalize(input.username);
    const users = usersStoreInternal.get();
    if (users.some((u) => u.email === email)) return { error: "A user with that email already exists" };
    if (users.some((u) => u.username.toLowerCase() === username)) return { error: "That username is taken" };

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
    if (!user) return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, status } : u)));
    logAudit(actor(), "update", `User / ${user.email} set to ${status}`);
  },

  setRole(id: string, role: Role) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user) return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));
    logAudit(actor(), "update", `User / ${user.email} role changed to ${role}`);
  },

  // Updates name, role/register, and all employee-profile fields (job info, pay,
  // ID/emergency contact, photo). Does not touch email/username/password.
  updateProfile(id: string, patch: Partial<EmployeeProfile> & { name?: string; authorizedRegister?: RegisterName | null }) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    if (!user) return;
    usersStoreInternal.set((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    logAudit(actor(), "update", `User / ${user.email} profile updated`);
  },

  removeUser(id: string) {
    const user = usersStoreInternal.get().find((u) => u.id === id);
    usersStoreInternal.set((us) => us.filter((u) => u.id !== id));
    logAudit(actor(), "delete", `User / ${user?.email ?? id}`);
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
