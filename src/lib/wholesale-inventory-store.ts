import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { createOutboxStore, createSyncScheduler } from "@/lib/offline-store";
import { resolveWholesalerId } from "@/lib/wholesalers-store";
import {
  fetchWholesaleInventory,
  createWholesaleInventoryItemOnServer,
  updateWholesaleInventoryItemOnServer,
  removeWholesaleInventoryItemOnServer,
} from "@/lib/wholesale-inventory-api";

// Manually-tracked inventory sourced from wholesalers — separate from the main Products
// catalog (src/lib/products-store.ts) and from Purchase Invoices
// (src/lib/purchase-invoices-store.ts). Backed by its own Supabase table
// (supabase/migrations/0003_wholesale_inventory.sql).
export type WholesaleInventoryItem = {
  id: string;
  wholesalerId: string;
  wholesalerName: string;
  productName: string;
  qty: number;
  price: number;
  createdAt: string;
  // Links back to the catalogue product this entry tracks stock for (see
  // wholesalers-store.ts WholesalerProduct.stockQty) — undefined for entries not tied to
  // an existing catalogue product.
  productId?: string;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

function callerRole() {
  return authStore.getCurrentUser()?.role ?? "";
}

let items: WholesaleInventoryItem[] = [];
const listeners = new Set<() => void>();

function setItems(next: WholesaleInventoryItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchWholesaleInventory());
  if (!("networkError" in result)) setItems(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// ---------------------------------------------------------------------------
// Local-first add/edit/delete — same model as products-store.ts/customers-store.ts/
// wholesalers-store.ts. See offline-store.ts.
// ---------------------------------------------------------------------------

type ItemInput = Omit<WholesaleInventoryItem, "id" | "createdAt">;

const outbox = createOutboxStore<ItemInput>("dhipos-wholesale-inventory-outbox");
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
      // Re-resolved fresh right before syncing — the wholesaler this entry belongs to may
      // itself still have been a locally-queued, not-yet-synced record when this item was
      // created (see wholesalers-store.ts's own outbox); sending its temp id after that
      // point would reference a wholesaler the server never heard of.
      const payload = {
        ...entry.payload,
        wholesalerId: resolveWholesalerId(entry.payload.wholesalerId),
      };
      const result = await safeServerCall(() =>
        createWholesaleInventoryItemOnServer({ data: { ...payload, callerRole: callerRole() } }),
      );
      if ("networkError" in result) {
        outbox.markFailed(id, result.error);
        return "failed-network";
      }
      if ("error" in result) {
        setItems(items.filter((i) => i.id !== id));
        outbox.resolve(id);
        toast.error(`"${entry.payload.productName}" couldn't be saved: ${result.error}`);
        return "rejected";
      }
      setItems([result.item, ...items.filter((i) => i.id !== id)]);
      outbox.resolve(id);
      logAudit(actor(), "create", `Wholesale Inventory / ${result.item.productName} (synced)`);
      return "synced";
    }

    if (entry.op === "update") {
      const result = await safeServerCall(() =>
        updateWholesaleInventoryItemOnServer({
          data: { id, patch: entry.patch, callerRole: callerRole() },
        }),
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
      removeWholesaleInventoryItemOnServer({ data: { id, callerRole: callerRole() } }),
    );
    if ("networkError" in result) {
      outbox.markFailed(id, result.error);
      return "failed-network";
    }
    outbox.resolve(id);
    if ("error" in result) {
      toast.error(`Couldn't delete this item: ${result.error}`);
      await refreshFromServer(); // bring the still-existing item back
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

// Mounted once via AppShell, alongside the other stores' equivalents.
export const useWholesaleInventorySync = scheduler.usePendingSync;
export const syncPendingWholesaleInventory = scheduler.run;

// For the header's combined "pending sync" indicator (see AppShell).
export function usePendingWholesaleInventoryCount(): number {
  return Object.keys(outbox.useOutbox()).length;
}

export const wholesaleInventoryStore = {
  get: () => items,

  async create(input: ItemInput): Promise<WholesaleInventoryItem> {
    const id = `local-${crypto.randomUUID().slice(0, 8)}`;
    const item: WholesaleInventoryItem = { ...input, id, createdAt: new Date().toISOString() };
    setItems([item, ...items]);
    outbox.queueCreate(id, input);
    logAudit(actor(), "create", `Wholesale Inventory / ${item.productName} (saved on device)`);
    void scheduler.run();
    return item;
  },

  async update(
    id: string,
    patch: Partial<Omit<WholesaleInventoryItem, "id" | "createdAt">>,
  ): Promise<{ ok: true } | { error: string }> {
    const existing = items.find((i) => i.id === id);
    if (!existing) return { error: "Item not found" };
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    outbox.queueUpdate(id, patch);
    logAudit(
      actor(),
      "update",
      `Wholesale Inventory / ${patch.productName ?? existing.productName}`,
    );
    void scheduler.run();
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = items.find((i) => i.id === id);
    if (!existing) return { error: "Item not found" };
    setItems(items.filter((i) => i.id !== id));
    outbox.queueRemove(id);
    logAudit(actor(), "delete", `Wholesale Inventory / ${existing.productName}`);
    void scheduler.run();
    return { ok: true };
  },
};

export function useWholesaleInventory(): WholesaleInventoryItem[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
}
