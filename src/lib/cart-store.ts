import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchCart,
  setCartItemOnServer,
  removeCartItemOnServer,
  clearCartOnServer,
} from "@/lib/cart-api";

// Shared across devices — a running list built while browsing wholesaler catalogues. Backed
// by Supabase (see supabase/migrations/0004_cart.sql). Each outlet has its own cart: one row
// per (outlet, product) pair — see cart-server-store.ts's composite row id — so two outlets
// adding the "same" catalogue product never collide into one shared row, and qty adjustments
// upsert the same row rather than creating duplicates.
export type CartItem = {
  wholesalerId: string;
  wholesalerName: string;
  productId: string;
  productName: string;
  price: number;
  qty: number;
  // Which outlet this cart line belongs to — null for a user with no outlet assigned (only
  // Super Admin sees those). Same convention as Bill.outletId/Customer.outletId.
  outletId: string | null;
  // Snapshotted from the catalogue product at add-to-cart time, purely for display — if the
  // product is later edited, an already-carted line keeps showing what it looked like when
  // added. Optional since older carted rows (added before this existed) won't have them.
  imageUrl?: string;
  packingDetails?: string;
  size?: number;
  sizeUnit?: string;
};

function caller() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
}

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

function sameLine(item: CartItem, productId: string, outletId: string | null) {
  return item.productId === productId && item.outletId === outletId;
}

export const cartStore = {
  get: () => items,

  // Adds one unit of `product` from `wholesaler` to the current user's own outlet's cart —
  // increments qty if it's already there rather than creating a duplicate row.
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
      const outletId = authStore.getCurrentUser()?.outletId ?? null;
      const existing = items.find((i) => sameLine(i, product.id, outletId));
      const item: CartItem = {
        wholesalerId: wholesaler.id,
        wholesalerName: wholesaler.name,
        productId: product.id,
        productName: product.name,
        price: product.price,
        qty: (existing?.qty ?? 0) + 1,
        outletId,
        imageUrl: product.imageUrl,
        packingDetails: product.packingDetails,
        size: product.size,
        sizeUnit: product.sizeUnit,
      };
      const result = await safeServerCall(() =>
        setCartItemOnServer({ data: { item, ...caller() } }),
      );
      if ("networkError" in result) return { error: result.error };
      if ("error" in result) return result;
      setItems([item, ...items.filter((i) => !sameLine(i, item.productId, item.outletId))]);
      return { ok: true };
    });
  },

  // `outletId` identifies which cart line — pass the value straight off the CartItem being
  // adjusted (not re-derived from the current user), so this still works correctly for a
  // Super Admin viewing every outlet's carts combined, not just their own.
  setQty(
    productId: string,
    outletId: string | null,
    qty: number,
  ): Promise<{ ok: true } | { error: string }> {
    if (qty <= 0) return cartStore.remove(productId, outletId);
    return serialize(async () => {
      const existing = items.find((i) => sameLine(i, productId, outletId));
      if (!existing) return { ok: true };
      const item = { ...existing, qty };
      const result = await safeServerCall(() =>
        setCartItemOnServer({ data: { item, ...caller() } }),
      );
      if ("networkError" in result) return { error: result.error };
      if ("error" in result) return result;
      setItems(items.map((i) => (sameLine(i, productId, outletId) ? item : i)));
      return { ok: true };
    });
  },

  remove(productId: string, outletId: string | null): Promise<{ ok: true } | { error: string }> {
    return serialize(async () => {
      const result = await safeServerCall(() =>
        removeCartItemOnServer({ data: { productId, outletId, ...caller() } }),
      );
      if ("networkError" in result) return { error: result.error };
      if ("error" in result) return result;
      setItems(items.filter((i) => !sameLine(i, productId, outletId)));
      return { ok: true };
    });
  },

  // Clears only the current user's own outlet's cart lines — Super Admin (who has no outlet
  // of their own) clears every outlet's, matching what they see combined in the Cart dialog.
  clear(): Promise<{ ok: true } | { error: string }> {
    return serialize(async () => {
      const result = await safeServerCall(() => clearCartOnServer({ data: caller() }));
      if ("networkError" in result) return { error: result.error };
      if ("error" in result) return result;
      const { role, callerOutletId } = caller();
      setItems(role === "Super Admin" ? [] : items.filter((i) => i.outletId !== callerOutletId));
      return { ok: true };
    });
  },
};

export function useCart(): CartItem[] {
  useEffect(() => ensureInitialFetch(), []);
  const allItems = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's cart
  // combined, unrestricted. Matches useBills()/useWholesaleOrders().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allItems.filter((i) => i.outletId === scopeOutletId) : allItems),
    [allItems, scopeOutletId],
  );
}
