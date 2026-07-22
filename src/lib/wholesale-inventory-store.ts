import { useEffect, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
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

export const wholesaleInventoryStore = {
  get: () => items,

  async create(
    input: Omit<WholesaleInventoryItem, "id" | "createdAt">,
  ): Promise<WholesaleInventoryItem | { error: string }> {
    const result = await safeServerCall(() =>
      createWholesaleInventoryItemOnServer({ data: { ...input, callerRole: callerRole() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setItems([result.item, ...items]);
    logAudit(actor(), "create", `Wholesale Inventory / ${result.item.productName}`);
    return result.item;
  },

  async update(
    id: string,
    patch: Partial<Omit<WholesaleInventoryItem, "id" | "createdAt">>,
  ): Promise<{ ok: true } | { error: string }> {
    const existing = items.find((i) => i.id === id);
    const result = await safeServerCall(() =>
      updateWholesaleInventoryItemOnServer({ data: { id, patch, callerRole: callerRole() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    logAudit(
      actor(),
      "update",
      `Wholesale Inventory / ${patch.productName ?? existing?.productName ?? id}`,
    );
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = items.find((i) => i.id === id);
    const result = await safeServerCall(() =>
      removeWholesaleInventoryItemOnServer({ data: { id, callerRole: callerRole() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setItems(items.filter((i) => i.id !== id));
    logAudit(actor(), "delete", `Wholesale Inventory / ${existing?.productName ?? id}`);
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
