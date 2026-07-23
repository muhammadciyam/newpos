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
  // Snapshotted from the catalogue product at add-to-cart time, purely for display — if the
  // product is later edited, an already-carted line keeps showing what it looked like when
  // added. Optional since older carted rows (added before this existed) won't have them.
  imageUrl?: string;
  packingDetails?: string;
  size?: number;
  sizeUnit?: string;
};

let items: CartItem[] = [];
const listeners = new Set<() => void>();

function setItems(next: CartItem[]) {
  items = next;
  listeners.forEach((l) => l());
}

// Every mutation below reads `items` before its own await and writes it back after — without
// this, two calls fired close together (e.g. double-clicking "Add to Cart", or a qty
// stepper's "+" mashed quickly) both read the cart before either's own change has landed,
// each conclude the product "isn't in the cart yet", and both append their own row instead of
// one incrementing the other's. Chaining every call onto this queue forces them to run one at
// a time, so each one only ever sees the fully-applied result of the last.
let mutationQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn, fn);
  mutationQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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
  addToCart(
    wholesaler: { id: string; name: string },
    product: {
      id: string;
      name: string;
      price: number;
      imageUrl?: string;
      packingDetails?: string;
      size?: number;
      sizeUnit?: string;
    },
  ): Promise<{ ok: true } | { error: string }> {
    return serialize(async () => {
      const existing = items.find((i) => i.productId === product.id);
      const item: CartItem = {
        wholesalerId: wholesaler.id,
        wholesalerName: wholesaler.name,
        productId: product.id,
        productName: product.name,
        price: product.price,
        qty: (existing?.qty ?? 0) + 1,
        imageUrl: product.imageUrl,
        packingDetails: product.packingDetails,
        size: product.size,
        sizeUnit: product.sizeUnit,
      };
      const result = await safeServerCall(() => setCartItemOnServer({ data: item }));
      if ("networkError" in result) return { error: result.error };
      setItems([item, ...items.filter((i) => i.productId !== item.productId)]);
      return { ok: true };
    });
  },

  setQty(productId: string, qty: number): Promise<{ ok: true } | { error: string }> {
    if (qty <= 0) return cartStore.remove(productId);
    return serialize(async () => {
      const existing = items.find((i) => i.productId === productId);
      if (!existing) return { ok: true };
      const item = { ...existing, qty };
      const result = await safeServerCall(() => setCartItemOnServer({ data: item }));
      if ("networkError" in result) return { error: result.error };
      setItems(items.map((i) => (i.productId === productId ? item : i)));
      return { ok: true };
    });
  },

  remove(productId: string): Promise<{ ok: true } | { error: string }> {
    return serialize(async () => {
      const result = await safeServerCall(() => removeCartItemOnServer({ data: { productId } }));
      if ("networkError" in result) return { error: result.error };
      setItems(items.filter((i) => i.productId !== productId));
      return { ok: true };
    });
  },

  clear(): Promise<{ ok: true } | { error: string }> {
    return serialize(async () => {
      const result = await safeServerCall(() => clearCartOnServer());
      if ("networkError" in result) return { error: result.error };
      setItems([]);
      return { ok: true };
    });
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
