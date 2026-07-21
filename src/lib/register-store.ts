import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import type { RegisterSession, RegisterSessionClosing } from "@/lib/pos-data";
import { authStore, useCurrentOutletId } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { getTabId } from "@/lib/device-id";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useOutlets } from "@/lib/outlets-store";
import { useScopeOutletId } from "@/lib/outlet-scope";
import {
  fetchRegisters,
  createRegisterOnServer,
  setRegisterOutletOnServer,
  openRegisterOnServer,
  closeRegisterOnServer,
  forceCloseRegisterOnServer,
} from "@/lib/register-api";
import {
  fetchRegisterSessions,
  createRegisterSessionOnServer,
  closeRegisterSessionOnServer,
} from "@/lib/register-sessions-api";

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
  // Which outlet's inventory a sale on this register deducts from. Null only for registers
  // created before per-outlet inventory existed and not yet reassigned.
  outletId: string | null;
  // Human-readable label to show in the UI — the Record key this register is stored under
  // (RegisterName) is its internal identity and, for registers created after this field
  // existed, is a composite of outlet + name (see src/lib/register-key.ts) so the same
  // display name can be reused across different outlets. Always prefer this field over the
  // raw key when rendering to the screen — use registerDisplayName() below.
  displayName: string;
};

// Resolves a register's identity key (RegisterName) to its human-readable label for
// display — e.g. on receipts, bill history, and session lists, where `bill.register` /
// `session.register` store the raw key, not the label. Falls back to the key itself if
// the register was since deleted (so old bills/sessions never show a blank).
export function registerDisplayName(
  registers: Record<RegisterName, RegisterRecord>,
  key: string | null | undefined,
): string {
  if (!key) return "";
  return registers[key]?.displayName ?? key;
}

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

// Per-TAB (sessionStorage), not shared across the browser — see getTabId() in device-id.ts
// for why: this is what lets one browser run two different outlets' registers side by side
// in two tabs instead of the second tab's register clobbering the first tab's local pointer.
const store = createPersistedStore<LocalRegisterState>(
  "dhipos-register",
  initialLocalState,
  "session",
);

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

// Shared across every caller so whichever one fires first is the one everyone actually
// waits on (see the identical fix — and its reasoning — in auth-store.ts's
// ensureInitialUsersFetch). Also exported as ensureRegistersFetched() for
// sale-tabs-store.ts, which must not decide "hydrate from this register's held bill or
// reset to empty" against a snapshot that's still the pre-fetch default {}.
let initialFetchPromise: Promise<void> | null = null;
function ensureInitialFetch(): Promise<void> {
  if (!initialFetchPromise) {
    initialFetchPromise = refreshRegistersFromServer();
  }
  return initialFetchPromise;
}

export function ensureRegistersFetched(): Promise<void> {
  return ensureInitialFetch();
}

// Direct (non-reactive) read of the latest server snapshot — for callers like
// sale-tabs-store.ts that need the freshest data right after awaiting
// ensureRegistersFetched(), not whatever `registers` a component's own render closed over
// before that fetch resolved.
export function getServerRegisters(): Record<RegisterName, RegisterRecord> {
  return serverRegisters;
}

function useServerRegisters() {
  useEffect(() => {
    void ensureInitialFetch();
  }, []);
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

// --- Shared (server-backed) register sessions snapshot ---

let serverSessions: RegisterSession[] = [];
const sessionListeners = new Set<() => void>();

function setServerSessions(next: RegisterSession[]) {
  serverSessions = next;
  sessionListeners.forEach((l) => l());
}

async function refreshSessionsFromServer() {
  try {
    setServerSessions(await fetchRegisterSessions());
  } catch {
    // Network hiccup — keep the last known snapshot; individual actions surface their own errors.
  }
}

let initialSessionsFetchTriggered = false;
function ensureInitialSessionsFetch() {
  if (initialSessionsFetchTriggered) return;
  initialSessionsFetchTriggered = true;
  void refreshSessionsFromServer();
}

// Actively refetches on mount and every `intervalMs` — call this from the Register
// Sessions screen so sessions opened/closed on other devices show up without a refresh.
export function useRegisterSessionsPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshSessionsFromServer();
    const id = setInterval(() => void refreshSessionsFromServer(), intervalMs);
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
async function closeOutSession(name: RegisterName, now: number, closing?: RegisterSessionClosing) {
  const opened = serverSessions.find((r) => r.register === name && r.closedAt === null);
  if (!opened) return;
  const openedMs = new Date(opened.createdAt.replace(/-(\w{3})-/, " $1 ")).getTime();
  const durationMs = Number.isFinite(openedMs) ? now - openedMs : 0;
  const closedAt = formatSessionTimestamp(now);
  const openDuration = formatShortDuration(durationMs);
  setServerSessions(
    serverSessions.map((s) => (s.id === opened.id ? { ...s, closedAt, openDuration, closing } : s)),
  );
  await safeServerCall(() =>
    closeRegisterSessionOnServer({ data: { register: name, closedAt, openDuration, closing } }),
  );
}

export const registerStore = {
  async createRegister(name: string, outletId: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => createRegisterOnServer({ data: { name, outletId } }));
    if (!("error" in result)) await refreshRegistersFromServer();
    return result;
  },

  // Assigns/reassigns which outlet a register belongs to — mainly for registers created
  // before per-outlet inventory existed, which show "—" for Outlet until fixed up here.
  async setOutlet(name: RegisterName, outletId: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      setRegisterOutletOnServer({ data: { name, outletId } }),
    );
    if (!("error" in result)) {
      patchServerRegister(name, { ...serverRegisters[name], outletId });
      await refreshRegistersFromServer();
    }
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
        data: { name, by: actor, deviceId: getTabId(), opening: opening ?? {} },
      }),
    );
    if ("error" in result) return result;
    const now = result.openedAt;
    patchServerRegister(name, {
      isOpen: true,
      openedAt: now,
      openedBy: actor,
      openedByDeviceId: getTabId(),
      lastClosedAt: serverRegisters[name]?.lastClosedAt ?? null,
      heldBill: serverRegisters[name]?.heldBill ?? null,
      opening: opening ?? {},
      outletId: serverRegisters[name]?.outletId ?? null,
      displayName: serverRegisters[name]?.displayName ?? name,
    });
    store.set((s) => ({ ...s, register: name, openedAt: now, openedBy: actor }));
    const nextNo = Math.max(0, ...serverSessions.map((r) => r.no)) + 1;
    const session: RegisterSession = {
      id: `rs-${Date.now()}`,
      no: nextNo,
      register: name,
      createdAt: formatSessionTimestamp(now),
      closedAt: null,
      openDuration: "Open a few seconds",
      by: actor,
      outletId: serverRegisters[name]?.outletId ?? null,
    };
    setServerSessions([session, ...serverSessions]);
    void safeServerCall(() => createRegisterSessionOnServer({ data: session }));
    logAudit(actor, "create", `Register Session / ${name}`);
    await refreshRegistersFromServer();
    return { ok: true };
  },

  // Switch the active session view to a register that is already open, without
  // resetting its opened-at time (unlike `open`, which opens a fresh session).
  // Only the tab that opened it may view/use it — another tab seeing it's open gets
  // "View Register" hidden entirely in the UI (see pos.register.tsx), and this is a
  // defense-in-depth guard against reaching it any other way.
  view(name: RegisterName): { ok: true } | { error: string } {
    const existing = serverRegisters[name];
    if (!existing?.isOpen) return { error: "Register is not open" };
    if (existing.openedByDeviceId !== getTabId()) {
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
      outletId: serverRegisters[name]?.outletId ?? null,
      displayName: serverRegisters[name]?.displayName ?? name,
    });
    if (store.get().register === name) {
      store.set((s) => ({ ...s, register: null, openedAt: null }));
    }
    await closeOutSession(name, result.closedAt, closing);
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
      outletId: serverRegisters[name]?.outletId ?? null,
      displayName: serverRegisters[name]?.displayName ?? name,
    });
    if (store.get().register === name) {
      store.set((s) => ({ ...s, register: null, openedAt: null }));
    }
    await closeOutSession(name, result.closedAt);
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
  const currentOutletId = useCurrentOutletId();
  const outlets = useOutlets();
  // Reflects the outlet typed on the login form — falls back to the old flat constant for
  // a session logged in before per-outlet login existed, or if that outlet was since removed.
  const storeName = outlets.find((o) => o.id === currentOutletId)?.name ?? local.storeName;
  // Restricted to the current user's own outlet — the register-selection screen, and every
  // other reader of useRegister().registers, only ever sees registers that belong there.
  // Super Admin sees every outlet's registers combined, unrestricted.
  const scopeOutletId = useScopeOutletId();
  const visibleRegisters = useMemo(
    () =>
      scopeOutletId
        ? Object.fromEntries(
            Object.entries(registers).filter(([, r]) => r.outletId === scopeOutletId),
          )
        : registers,
    [registers, scopeOutletId],
  );

  useEffect(() => {
    migrateLegacyRegisterNames();
  }, []);

  // If this device thinks it has a register open but the server says it's actually
  // closed (closed or force-closed from elsewhere), drop the local pointer so this
  // session falls back to the register-selection screen. Uses the unfiltered `registers`
  // (not `visibleRegisters`) so this still works correctly regardless of outlet scope.
  useEffect(() => {
    if (local.register && registers[local.register] && !registers[local.register].isOpen) {
      store.set((s) =>
        s.register === local.register ? { ...s, register: null, openedAt: null } : s,
      );
    }
  }, [local.register, registers]);

  return {
    storeName,
    register: local.register,
    openedAt: local.openedAt,
    openedBy: local.openedBy,
    registers: visibleRegisters,
  };
}

export function useRegisterSessions(): RegisterSession[] {
  useEffect(() => ensureInitialSessionsFetch(), []);
  const allSessions = useSyncExternalStore(
    (cb) => {
      sessionListeners.add(cb);
      return () => sessionListeners.delete(cb);
    },
    () => serverSessions,
    () => serverSessions,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's
  // register sessions combined, unrestricted. Matches useBills()/useRegister().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allSessions.filter((s) => s.outletId === scopeOutletId) : allSessions),
    [allSessions, scopeOutletId],
  );
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
