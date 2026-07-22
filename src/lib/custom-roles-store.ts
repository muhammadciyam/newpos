import { useEffect, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchCustomRoles,
  createCustomRoleOnServer,
  updateCustomRoleOnServer,
  removeCustomRoleOnServer,
} from "@/lib/custom-roles-api";
import type { Permission } from "@/lib/permissions";

export type CustomRole = {
  id: string;
  name: string;
  permissions: Permission[];
  createdAt: string;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let customRoles: CustomRole[] = [];
const listeners = new Set<() => void>();

function setCustomRoles(next: CustomRole[]) {
  customRoles = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchCustomRoles());
  if (!("networkError" in result)) setCustomRoles(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const customRolesStore = {
  get: () => customRoles,

  async create(input: {
    name: string;
    permissions: Permission[];
  }): Promise<CustomRole | { error: string }> {
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() =>
      createCustomRoleOnServer({ data: { ...input, callerRole } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomRoles([result.role, ...customRoles]);
    logAudit(actor(), "create", `Role / ${result.role.name}`);
    return result.role;
  },

  async update(
    id: string,
    patch: Partial<Pick<CustomRole, "name" | "permissions">>,
  ): Promise<{ ok: true } | { error: string }> {
    const existing = customRoles.find((r) => r.id === id);
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() =>
      updateCustomRoleOnServer({ data: { id, patch, callerRole } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomRoles(customRoles.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    logAudit(actor(), "update", `Role / ${patch.name ?? existing?.name ?? id}`);
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = customRoles.find((r) => r.id === id);
    const callerRole = authStore.getCurrentUser()?.role ?? "";
    const result = await safeServerCall(() =>
      removeCustomRoleOnServer({ data: { id, callerRole } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomRoles(customRoles.filter((r) => r.id !== id));
    logAudit(actor(), "delete", `Role / ${existing?.name ?? id}`);
    return { ok: true };
  },
};

export function useCustomRoles(): CustomRole[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => customRoles,
    () => customRoles,
  );
}
