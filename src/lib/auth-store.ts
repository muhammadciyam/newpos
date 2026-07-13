import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";

export type Role = "Admin" | "Staff";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  createdAt: string;
};

const seedAdmin: AppUser = {
  id: "seed-admin",
  name: "Mohamed Siyam",
  email: "siyam69@gmail.com",
  password: "229022#",
  role: "Admin",
  createdAt: new Date("2026-07-13T07:00:00").toISOString(),
};

const usersStoreInternal = createPersistedStore<AppUser[]>("dhipos-users", [seedAdmin]);
const sessionStoreInternal = createPersistedStore<{ email: string | null }>("dhipos-session", { email: null });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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

  login(email: string, password: string): AppUser | null {
    const match = usersStoreInternal
      .get()
      .find((u) => u.email === normalizeEmail(email) && u.password === password);
    if (!match) return null;
    sessionStoreInternal.set({ email: match.email });
    return match;
  },

  logout() {
    sessionStoreInternal.set({ email: null });
  },

  createUser(input: { name: string; email: string; password: string; role: Role }): AppUser | { error: string } {
    const email = normalizeEmail(input.email);
    if (usersStoreInternal.get().some((u) => u.email === email)) {
      return { error: "A user with that email already exists" };
    }
    const user: AppUser = {
      id: `user-${Date.now()}`,
      name: input.name,
      email,
      password: input.password,
      role: input.role,
      createdAt: new Date().toISOString(),
    };
    usersStoreInternal.set((us) => [...us, user]);
    return user;
  },

  removeUser(id: string) {
    usersStoreInternal.set((us) => us.filter((u) => u.id !== id));
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
