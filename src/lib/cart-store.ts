import { useEffect, useSyncExternalStore } from "react";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchCart,
  setCartItemOnServer,
  removeCartItemOnServer,
  clearCartOnServer,
} from "@/lib/cart-api";

// Shared across devices — a running list built while browsing wholesaler catalogues.
// Backed by Supabase (see supabase/migrations/0004_cart.sql). One row per product; qty
// adjustments upsert the same row rather than creating duplicates.
export type CartItem = {
  wholesalerId: string;
  wholesalerName: string;
  productId: string;
  productName: string;
  price: number;
  qty: number;
};

let items: CartItem[] = [];
const listeners = new Set<() => void>();

function setItems(next: CartItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchCart());
  if (!("networkError" in result)) setItems(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const cartStore = {
  get: () => items,

  // Adds one unit of `product` from `wholesaler` — increments qty if it's already in the
  // cart rather than creating a duplicate row.
  async addToCart(
    wholesaler: { id: string; name: string },
    product: { id: string; name: string; price: number },
  ): Promise<{ ok: true } | { error: string }> {
    const existing = items.find((i) => i.productId === product.id);
    const item: CartItem = {
      wholesalerId: wholesaler.id,
      wholesalerName: wholesaler.name,
      productId: product.id,
      productName: product.name,
      price: product.price,
      qty: (existing?.qty ?? 0) + 1,
    };
    const result = await safeServerCall(() => setCartItemOnServer({ data: item }));
    if ("networkError" in result) return { error: result.error };
    setItems(
      existing ? items.map((i) => (i.productId === item.productId ? item : i)) : [...items, item],
    );
    return { ok: true };
  },

  async setQty(productId: string, qty: number): Promise<{ ok: true } | { error: string }> {
    if (qty <= 0) return cartStore.remove(productId);
    const existing = items.find((i) => i.productId === productId);
    if (!existing) return { ok: true };
    const item = { ...existing, qty };
    const result = await safeServerCall(() => setCartItemOnServer({ data: item }));
    if ("networkError" in result) return { error: result.error };
    setItems(items.map((i) => (i.productId === productId ? item : i)));
    return { ok: true };
  },

  async remove(productId: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => removeCartItemOnServer({ data: { productId } }));
    if ("networkError" in result) return { error: result.error };
    setItems(items.filter((i) => i.productId !== productId));
    return { ok: true };
  },

  async clear(): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() => clearCartOnServer());
    if ("networkError" in result) return { error: result.error };
    setItems([]);
    return { ok: true };
  },
};

export function useCart(): CartItem[] {
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
