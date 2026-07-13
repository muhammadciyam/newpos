import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import type { RegisterSession } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type RegisterName = "Main" | "Main 2";

export type RegisterState = {
  storeName: string;
  register: RegisterName | null;
  openedAt: number | null;
  openedBy: string;
  registers: Record<RegisterName, { isOpen: boolean; openedAt: number | null; lastClosedAt: number | null }>;
};

const initialState: RegisterState = {
  storeName: "Seven Mart",
  register: null,
  openedAt: null,
  openedBy: "",
  registers: {
    Main: { isOpen: false, openedAt: null, lastClosedAt: null },
    "Main 2": { isOpen: false, openedAt: null, lastClosedAt: null },
  },
};

const store = createPersistedStore<RegisterState>("dhipos-register", initialState);
const sessionsStore = createPersistedStore<RegisterSession[]>("dhipos-register-sessions", []);

function formatSessionTimestamp(ms: number) {
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

export const registerStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  open(name: RegisterName, by?: string) {
    const actor = by ?? authStore.getCurrentUser()?.name ?? "Unknown";
    const now = Date.now();
    store.set((s) => ({
      ...s,
      register: name,
      openedAt: now,
      openedBy: actor,
      registers: {
        ...s.registers,
        [name]: { isOpen: true, openedAt: now, lastClosedAt: null },
      },
    }));
    const nextNo = Math.max(0, ...sessionsStore.get().map((r) => r.no)) + 1;
    sessionsStore.set((sessions) => [
      { no: nextNo, register: name, createdAt: formatSessionTimestamp(now), closedAt: null, openDuration: "Open a few seconds", by: actor },
      ...sessions,
    ]);
    logAudit(actor, "create", `Register Session / ${name}`);
  },
  // Switch the active session view to a register that is already open, without
  // resetting its opened-at time (unlike `open`, which opens a fresh session).
  view(name: RegisterName) {
    const existing = store.get().registers[name];
    if (!existing?.isOpen) return;
    store.set((s) => ({ ...s, register: name, openedAt: existing.openedAt }));
  },
  close(name: RegisterName) {
    const now = Date.now();
    const wasActive = store.get().register === name;
    store.set((s) => ({
      ...s,
      register: wasActive ? null : s.register,
      openedAt: wasActive ? null : s.openedAt,
      registers: {
        ...s.registers,
        [name]: { isOpen: false, openedAt: null, lastClosedAt: now },
      },
    }));
    sessionsStore.set((sessions) => {
      const idx = sessions.findIndex((r) => r.register === name && r.closedAt === null);
      if (idx === -1) return sessions;
      const updated = [...sessions];
      const opened = updated[idx];
      const openedMs = new Date(opened.createdAt.replace(/-(\w{3})-/, " $1 ")).getTime();
      const durationMs = Number.isFinite(openedMs) ? now - openedMs : 0;
      updated[idx] = {
        ...opened,
        closedAt: formatSessionTimestamp(now),
        openDuration: formatShortDuration(durationMs),
      };
      return updated;
    });
    logAudit(authStore.getCurrentUser()?.name ?? "Unknown", "update", `Register Session / ${name}`);
  },
};

function formatShortDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function useRegister() {
  return usePersistedStore(store);
}

export function useRegisterSessions() {
  return usePersistedStore(sessionsStore);
}

export function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "a few seconds ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatOpenSince(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
