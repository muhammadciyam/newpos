import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import type { CartItem } from "@/lib/cart-store";
import { fetchWholesaleOrders, createWholesaleOrderOnServer } from "@/lib/wholesale-orders-api";

// A snapshot of the Cart's contents at the moment "Make Order" was clicked — read-only
// history from then on. Backed by its own Supabase table
// (supabase/migrations/0005_wholesale_orders.sql).
export type WholesaleOrder = {
  id: string;
  items: CartItem[];
  total: number;
  placedBy: string;
  createdAt: string;
  // Which outlet placed this order — null for a user with no outlet assigned (only Super
  // Admin sees those). Same convention as Bill.outletId/Customer.outletId.
  outletId: string | null;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let orders: WholesaleOrder[] = [];
const listeners = new Set<() => void>();

function setOrders(next: WholesaleOrder[]) {
  orders = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchWholesaleOrders());
  if (!("networkError" in result)) setOrders(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const wholesaleOrdersStore = {
  get: () => orders,

  async create(items: CartItem[]): Promise<WholesaleOrder | { error: string }> {
    const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const outletId = authStore.getCurrentUser()?.outletId ?? null;
    const result = await safeServerCall(() =>
      createWholesaleOrderOnServer({ data: { items, total, placedBy: actor(), outletId } }),
    );
    if ("networkError" in result) return { error: result.error };
    setOrders([result.order, ...orders]);
    logAudit(actor(), "create", `Wholesale Order / ${items.length} item(s), ${total.toFixed(2)}`);
    return result.order;
  },
};

export function useWholesaleOrders(): WholesaleOrder[] {
  useEffect(() => ensureInitialFetch(), []);
  const allOrders = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => orders,
    () => orders,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's orders
  // combined, unrestricted. Matches useBills()/useCustomers()/useProducts().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allOrders.filter((o) => o.outletId === scopeOutletId) : allOrders),
    [allOrders, scopeOutletId],
  );
}
