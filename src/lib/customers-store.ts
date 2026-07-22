import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type Customer } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import {
  fetchCustomers,
  createCustomerOnServer,
  updateCustomerOnServer,
  removeCustomerOnServer,
  addCustomerSpendOnServer,
} from "@/lib/customers-api";

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

function caller() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
}

let customers: Customer[] = [];
const listeners = new Set<() => void>();

function setCustomers(next: Customer[]) {
  customers = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchCustomers());
  if (!("networkError" in result)) setCustomers(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const customersStore = {
  get: () => customers,

  async create(
    input: Omit<Customer, "id" | "outstanding" | "spent" | "loyalty" | "outletId">,
  ): Promise<Customer | { error: string }> {
    const outletId = authStore.getCurrentUser()?.outletId ?? null;
    const result = await safeServerCall(() =>
      createCustomerOnServer({ data: { ...input, outletId } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomers([result.customer, ...customers]);
    logAudit(actor(), "create", `Customer / ${result.customer.name}`);
    return result.customer;
  },

  async update(
    id: string,
    patch: Partial<Omit<Customer, "id" | "outstanding" | "spent" | "loyalty" | "outletId">>,
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      updateCustomerOnServer({ data: { id, patch, ...caller() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomers(customers.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    logAudit(actor(), "update", `Customer / ${patch.name ?? id}`);
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = customers.find((c) => c.id === id);
    const result = await safeServerCall(() =>
      removeCustomerOnServer({ data: { id, ...caller() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setCustomers(customers.filter((c) => c.id !== id));
    logAudit(actor(), "delete", `Customer / ${existing?.name ?? id}`);
    return { ok: true };
  },

  async addSpend(id: string, amount: number): Promise<void> {
    const result = await safeServerCall(() => addCustomerSpendOnServer({ data: { id, amount } }));
    if (!("networkError" in result)) {
      setCustomers(customers.map((c) => (c.id === id ? { ...c, spent: c.spent + amount } : c)));
    }
  },
};

export function useCustomers(): Customer[] {
  useEffect(() => ensureInitialFetch(), []);
  const allCustomers = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => customers,
    () => customers,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's
  // customers combined, unrestricted. Matches useBills()/useProducts().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allCustomers.filter((c) => c.outletId === scopeOutletId) : allCustomers),
    [allCustomers, scopeOutletId],
  );
}
