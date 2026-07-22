import { useEffect, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchOutlets,
  createOutletOnServer,
  updateOutletOnServer,
  removeOutletOnServer,
} from "@/lib/outlets-api";

export type Outlet = {
  id: string;
  name: string;
  address: string;
  phone: string;
  active: boolean;
  createdAt: string;
  // Which timezone this outlet's header clock/date displays use — Super Admin only (see
  // admin.locations.tsx). Undefined for outlets created before this field existed.
  timezone?: string;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let outlets: Outlet[] = [];
const listeners = new Set<() => void>();

function setOutlets(next: Outlet[]) {
  outlets = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchOutlets());
  if (!("networkError" in result)) setOutlets(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const outletsStore = {
  get: () => outlets,

  async create(input: Omit<Outlet, "id" | "createdAt">): Promise<Outlet | { error: string }> {
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() =>
      createOutletOnServer({ data: { ...input, callerRole } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setOutlets([result.outlet, ...outlets]);
    logAudit(actor(), "create", `Outlet / ${result.outlet.name}`);
    return result.outlet;
  },

  async update(
    id: string,
    patch: Partial<Omit<Outlet, "id" | "createdAt">>,
  ): Promise<{ ok: true } | { error: string }> {
    const existing = outlets.find((o) => o.id === id);
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() =>
      updateOutletOnServer({ data: { id, patch, callerRole } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setOutlets(outlets.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    logAudit(actor(), "update", `Outlet / ${patch.name ?? existing?.name ?? id}`);
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = outlets.find((o) => o.id === id);
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() => removeOutletOnServer({ data: { id, callerRole } }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setOutlets(outlets.filter((o) => o.id !== id));
    logAudit(actor(), "delete", `Outlet / ${existing?.name ?? id}`);
    return { ok: true };
  },
};

export function useOutlets(): Outlet[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => outlets,
    () => outlets,
  );
}
