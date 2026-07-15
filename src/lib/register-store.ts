import { useEffect, useSyncExternalStore } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import type { RegisterSession, RegisterSessionClosing } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { getDeviceId } from "@/lib/device-id";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchRegisters,
  createRegisterOnServer,
  openRegisterOnServer,
  closeRegisterOnServer,
  forceCloseRegisterOnServer,
} from "@/lib/register-api";

export type RegisterName = string;

export type RegisterRecord = {
  isOpen: boolean;
  openedAt: number | null;
  openedBy: string | null;
  openedByDeviceId: string | null;
  lastClosedAt: number | null;
  // Opaque to this store — the held/parked sale(s) for this register, if any. Typed and
  // validated by sale-tabs-store.ts, which owns the actual shape. Kept server-side (not
  // just this device's localStorage) so a held bill survives the register moving to a
  // different device (e.g. a force-close + reopen elsewhere).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heldBill: any;
  // Cash/card/bank amounts declared when this session was opened — used to compute the
  // Expected column at close time. Null once the register is closed.
  opening: Record<string, string> | null;
};

// The public shape returned by useRegister() — `registers` is now server-authoritative
// (shared across devices), everything else is local to this browser/session.
export type RegisterState = {
  storeName: string;
  register: RegisterName | null;
  openedAt: number | null;
  openedBy: string;
  registers: Record<RegisterName, RegisterRecord>;
};

// Only the per-device "which register am I currently looking at" fields are persisted
// locally — the shared open/closed status lives on the server (see register-api.ts).
type LocalRegisterState = {
  storeName: string;
  register: RegisterName | null;
  openedAt: number | null;
  openedBy: string;
};

const initialLocalState: LocalRegisterState = {
  storeName: "Seven Mart",
  register: null,
  openedAt: null,
  openedBy: "",
};

const store = createPersistedStore<LocalRegisterState>("dhipos-register", initialLocalState);
const sessionsStore = createPersistedStore<RegisterSession[]>("dhipos-register-sessions", []);

// One-time fixup for browsers that already persisted the old default register name
// ("Main" / "Main 2") as their active-register pointer before it was renamed/removed.
// Safe to call repeatedly — a no-op once neither legacy name is the active pointer.
function migrateLegacyRegisterNames() {
  const s = store.get();
  if (s.register !== "Main" && s.register !== "Main 2") return;
  store.set((state) =>
    state.register === "Main 2"
      ? { ...state, register: null, openedAt: null }
      : { ...state, register: "Counter 1" },
  );
}

// --- Shared (server-backed) registers snapshot ---

let serverRegisters: Record<RegisterName, RegisterRecord> = {};
const serverListeners = new Set<() => void>();

function setServerRegisters(next: Record<RegisterName, RegisterRecord>) {
  serverRegisters = next;
  serverListeners.forEach((l) => l());
}

// Applies a known-good mutation to the in-memory snapshot immediately, so the local
// `register` pointer and the shared snapshot never disagree even for one render — the
// reconciliation effect in useRegister() would otherwise see a stale (pre-refetch)
// snapshot right after a successful open/close and undo it before the real fetch lands.
function patchServerRegister(name: RegisterName, patch: RegisterRecord) {
  setServerRegisters({ ...serverRegisters, [name]: patch });
}

async function refreshRegistersFromServer() {
  try {
    const result = await fetchRegisters();
    setServerRegisters(result.registers);
  } catch {
    // Network hiccup — keep the last known snapshot; individual actions surface their own errors.
  }
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshRegistersFromServer();
}

function useServerRegisters() {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      serverListeners.add(cb);
      return () => serverListeners.delete(cb);
    },
    () => serverRegisters,
    () => serverRegisters,
  );
}

// Actively refetches on mount and every `intervalMs` — call this only from the one
// screen that needs near-live cross-device visibility (the register-selection page).
export function useRegisterPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshRegistersFromServer();
    const id = setInterval(() => void refreshRegistersFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function formatSessionTimestamp(ms: number) {
  const d = new Date(ms);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

function formatShortDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.floor(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

// Closes out the matching still-open session row for `name` — shared by close() and forceClose().
function closeOutSession(name: RegisterName, now: number, closing?: RegisterSessionClosing) {
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
      closing,
    };
    return updated;
  });
}

export const registerStore = {
  async createRegister(name: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => createRegisterOnServer({ data: { name } }));
    if (!("error" in result)) await refreshRegistersFromServer();
    return result;
  },

  async open(
    name: RegisterName,
    by?: string,
    opening?: Record<string, string>,
  ): Promise<{ ok: true } | { error: string }> {
    const actor = by ?? authStore.getCurrentUser()?.name ?? "Unknown";
    const result = await safeServerCall(() =>
      openRegisterOnServer({
        data: { name, by: actor, deviceId: getDeviceId(), opening: opening ?? {} },
      }),
    );
    if ("error" in result) return result;
    const now = result.openedAt;
    patchServerRegister(name, {
      isOpen: true,
      openedAt: now,
      openedBy: actor,
      openedByDeviceId: getDeviceId(),
      lastClosedAt: serverRegisters[name]?.lastClosedAt ?? null,
      heldBill: serverRegisters[name]?.heldBill ?? null,
      opening: opening ?? {},
    });
    store.set((s) => ({ ...s, register: name, openedAt: now, openedBy: actor }));
    const nextNo = Math.max(0, ...sessionsStore.get().map((r) => r.no)) + 1;
    sessionsStore.set((sessions) => [
      {
        no: nextNo,
        register: name,
        createdAt: formatSessionTimestamp(now),
        closedAt: null,
        openDuration: "Open a few seconds",
        by: actor,
      },
      ...sessions,
    ]);
    logAudit(actor, "create", `Register Session / ${name}`);
    await refreshRegistersFromServer();
    return { ok: true };
  },

  // Switch the active session view to a register that is already open, without
  // resetting its opened-at time (unlike `open`, which opens a fresh session).
  // Only the device that opened it may view/use it — another device seeing it's open
  // gets "View Register" hidden entirely in the UI (see pos.register.tsx), and this is
  // a defense-in-depth guard against reaching it any other way.
  view(name: RegisterName): { ok: true } | { error: string } {
    const existing = serverRegisters[name];
    if (!existing?.isOpen) return { error: "Register is not open" };
    if (existing.openedByDeviceId !== getDeviceId()) {
      return {
        error: `In use on ${existing.openedBy ?? "another device"}'s device — ask them to close it first, or ask an Admin to force-close it.`,
      };
    }
    store.set((s) => ({ ...s, register: name, openedAt: existing.openedAt }));
    return { ok: true };
  },

  async close(
    name: RegisterName,
    closing?: RegisterSessionClosing,
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => closeRegisterOnServer({ data: { name } }));
    if ("error" in result) return result;
    patchServerRegister(name, {
      isOpen: false,
      openedAt: null,
      openedBy: null,
      openedByDeviceId: null,
      lastClosedAt: result.closedAt,
      heldBill: serverRegisters[name]?.heldBill ?? null,
      opening: null,
    });
    if (store.get().register === name) {
      store.set((s) => ({ ...s, register: null, openedAt: null }));
    }
    closeOutSession(name, result.closedAt, closing);
    logAudit(authStore.getCurrentUser()?.name ?? "Unknown", "update", `Register Session / ${name}`);
    await refreshRegistersFromServer();
    return { ok: true };
  },

  // Admin-only escape hatch for a register left open on an unreachable device.
  // `role` is a client-supplied claim checked server-side — see the caveat comment
  // in register-api.ts: this app has no server-verified auth, so it's a UI-level
  // guard consistent with the rest of the app's all-client-trust permission model.
  async forceClose(name: RegisterName): Promise<{ ok: true } | { error: string }> {
    const role = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() => forceCloseRegisterOnServer({ data: { name, role } }));
    if ("error" in result) return result;
    patchServerRegister(name, {
      isOpen: false,
      openedAt: null,
      openedBy: null,
      openedByDeviceId: null,
      lastClosedAt: result.closedAt,
      heldBill: serverRegisters[name]?.heldBill ?? null,
      opening: null,
    });
    if (store.get().register === name) {
      store.set((s) => ({ ...s, register: null, openedAt: null }));
    }
    closeOutSession(name, result.closedAt);
    logAudit(
      authStore.getCurrentUser()?.name ?? "Unknown",
      "update",
      `Register Session / ${name} force-closed`,
    );
    await refreshRegistersFromServer();
    return { ok: true };
  },
};

export function useRegister(): RegisterState {
  const local = usePersistedStore(store);
  const registers = useServerRegisters();

  useEffect(() => {
    migrateLegacyRegisterNames();
  }, []);

  // If this device thinks it has a register open but the server says it's actually
  // closed (closed or force-closed from elsewhere), drop the local pointer so this
  // session falls back to the register-selection screen.
  useEffect(() => {
    if (local.register && registers[local.register] && !registers[local.register].isOpen) {
      store.set((s) =>
        s.register === local.register ? { ...s, register: null, openedAt: null } : s,
      );
    }
  }, [local.register, registers]);

  return {
    storeName: local.storeName,
    register: local.register,
    openedAt: local.openedAt,
    openedBy: local.openedBy,
    registers,
  };
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
