import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { type Customer } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { createOutboxStore, createSyncScheduler } from "@/lib/offline-store";
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

function patchCustomer(id: string, patch: Partial<Customer>) {
  setCustomers(customers.map((c) => (c.id === id ? { ...c, ...patch } : c)));
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

// ---------------------------------------------------------------------------
// Local-first add/edit/delete: every create/update/remove below applies to this device's
// own copy of the customer list immediately and queues the change to sync to Supabase in the
// background — same "save on device first" model bills already use for Save Bill. See
// offline-store.ts and the identical setup in products-store.ts.
// ---------------------------------------------------------------------------

type CustomerInput = Omit<Customer, "id" | "outstanding" | "spent" | "loyalty">;

const outbox = createOutboxStore<CustomerInput>("dhipos-customers-outbox");

// Once a locally-created customer's real, server-assigned id lands, this remembers
// "local-xxx now means <mobile>-172..." — see resolveProductId's identical reasoning.
const customerIdRedirects = new Map<string, string>();

export function resolveCustomerId(id: string): string {
  let current = id;
  while (customerIdRedirects.has(current)) current = customerIdRedirects.get(current)!;
  return current;
}

function normalizeForMatch(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// Mirrors createCustomerOnServer's dedup rule in customers-api.ts — only flags a duplicate
// once there's enough identifying detail (name AND phone AND address) to be confident it's
// really the same person, scoped to the same outlet. Checked here too (against this device's
// already-loaded list, including its own still-unsynced local creates) just for instant
// feedback — the server re-checks authoritatively regardless.
function localDuplicate(candidate: CustomerInput): Customer | undefined {
  const mobile = normalizeForMatch(candidate.mobile);
  const address = normalizeForMatch(candidate.address);
  if (!mobile || !address) return undefined;
  const name = normalizeForMatch(candidate.name);
  return customers.find(
    (c) =>
      c.outletId === candidate.outletId &&
      normalizeForMatch(c.name) === name &&
      normalizeForMatch(c.mobile) === mobile &&
      normalizeForMatch(c.address) === address,
  );
}

const inFlight = new Set<string>();

async function trySyncEntry(
  id: string,
): Promise<"synced" | "failed-network" | "rejected" | "skipped"> {
  if (inFlight.has(id)) return "skipped";
  const entry = outbox.get()[id];
  if (!entry) return "skipped";
  inFlight.add(id);
  try {
    if (entry.op === "create") {
      const result = await safeServerCall(() => createCustomerOnServer({ data: entry.payload }));
      if ("networkError" in result) {
        outbox.markFailed(id, result.error);
        return "failed-network";
      }
      if ("error" in result) {
        // The placeholder never really existed anywhere but here — just drop it.
        setCustomers(customers.filter((c) => c.id !== id));
        outbox.resolve(id);
        toast.error(`"${entry.payload.name}" couldn't be saved: ${result.error}`);
        return "rejected";
      }
      customerIdRedirects.set(id, result.customer.id);
      setCustomers([result.customer, ...customers.filter((c) => c.id !== id)]);
      outbox.resolve(id);
      logAudit(actor(), "create", `Customer / ${result.customer.name} (synced)`);
      return "synced";
    }

    if (entry.op === "update") {
      const result = await safeServerCall(() =>
        updateCustomerOnServer({ data: { id, patch: entry.patch, ...caller() } }),
      );
      if ("networkError" in result) {
        outbox.markFailed(id, result.error);
        return "failed-network";
      }
      outbox.resolve(id);
      if ("error" in result) {
        toast.error(`A change couldn't be saved: ${result.error}`);
        await refreshFromServer(); // this device's optimistic patch is now known-wrong
        return "rejected";
      }
      return "synced";
    }

    // remove
    const result = await safeServerCall(() =>
      removeCustomerOnServer({ data: { id, ...caller() } }),
    );
    if ("networkError" in result) {
      outbox.markFailed(id, result.error);
      return "failed-network";
    }
    outbox.resolve(id);
    if ("error" in result) {
      toast.error(`Couldn't delete this customer: ${result.error}`);
      await refreshFromServer(); // bring the still-existing customer back
      return "rejected";
    }
    return "synced";
  } finally {
    inFlight.delete(id);
  }
}

const scheduler = createSyncScheduler(async () => {
  for (const id of Object.keys(outbox.get())) {
    const outcome = await trySyncEntry(id);
    if (outcome === "failed-network") break;
  }
});

// Mounted once via AppShell, alongside usePendingBills/useProductsSync.
export const useCustomersSync = scheduler.usePendingSync;
export const syncPendingCustomers = scheduler.run;

// For the header's combined "pending sync" indicator (see AppShell).
export function usePendingCustomersCount(): number {
  return Object.keys(outbox.useOutbox()).length;
}

export const customersStore = {
  get: () => customers,

  async create(
    input: Omit<Customer, "id" | "outstanding" | "spent" | "loyalty" | "outletId">,
  ): Promise<Customer | { error: string }> {
    const outletId = authStore.getCurrentUser()?.outletId ?? null;
    const fullInput: CustomerInput = { ...input, outletId };
    const duplicate = localDuplicate(fullInput);
    if (duplicate) {
      return { error: "A customer with this name, phone number and address already exists" };
    }
    const id = `local-${crypto.randomUUID().slice(0, 8)}`;
    const customer: Customer = { ...fullInput, id, outstanding: 0, spent: 0, loyalty: 0 };
    setCustomers([customer, ...customers]);
    outbox.queueCreate(id, fullInput);
    logAudit(actor(), "create", `Customer / ${customer.name} (saved on device)`);
    void scheduler.run();
    return customer;
  },

  async update(
    id: string,
    patch: Partial<Omit<Customer, "id" | "outstanding" | "spent" | "loyalty" | "outletId">>,
  ): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveCustomerId(id);
    const current = customers.find((c) => c.id === targetId);
    if (!current) return { error: "Customer not found" };
    patchCustomer(targetId, patch);
    outbox.queueUpdate(targetId, patch);
    logAudit(actor(), "update", `Customer / ${patch.name ?? current.name}`);
    void scheduler.run();
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveCustomerId(id);
    const existing = customers.find((c) => c.id === targetId);
    if (!existing) return { error: "Customer not found" };
    setCustomers(customers.filter((c) => c.id !== targetId));
    outbox.queueRemove(targetId);
    logAudit(actor(), "delete", `Customer / ${existing.name}`);
    void scheduler.run();
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
