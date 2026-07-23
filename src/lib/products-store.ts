import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Product } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import {
  fetchProducts,
  createProductOnServer,
  createProductsBulkOnServer,
  updateProductOnServer,
  removeProductOnServer,
  setProductCountableOnServer,
  setProductImageOnServer,
  setProductCostOnServer,
  setProductSupplierOnServer,
  increaseStockOnServer,
  setStockCountOnServer,
} from "@/lib/products-api";

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let products: Product[] = [];
const listeners = new Set<() => void>();

function setProducts(next: Product[]) {
  products = next;
  listeners.forEach((l) => l());
}

function patchProduct(id: string, patch: Partial<Product>) {
  setProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchProducts());
  if (!("networkError" in result)) setProducts(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// Actively refetches on mount and every `intervalMs` — call this from screens where stale
// stock could cause real problems (Sell, Products, Inventory), not from read-only reports.
export function useProductsPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshFromServer();
    const id = setInterval(() => void refreshFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// Applies the stock number returned by a bill mutation (create/edit/void/refund)
// immediately, so the local product cache doesn't show stale (pre-sale) stock until the
// next poll tick.
function applyStockPatches(patches: { productId: string; stock: number }[]) {
  if (patches.length === 0) return;
  const byId = new Map(patches.map((p) => [p.productId, p]));
  setProducts(
    products.map((p) => {
      const patch = byId.get(p.id);
      return patch ? { ...p, stock: patch.stock } : p;
    }),
  );
}

function callerContext() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
}

export const productsStore = {
  get: () => products,
  applyStockPatches,

  // `outletId` is part of `input` (not auto-injected here) because Super Admin has no
  // outlet of their own and must explicitly choose one — see products.tsx's Add Product
  // form, which pre-fills it from the current user for everyone else.
  async create(input: Omit<Product, "id" | "stock" | "sku">): Promise<Product | { error: string }> {
    const result = await safeServerCall(() => createProductOnServer({ data: input }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setProducts([result.product, ...products]);
    logAudit(actor(), "create", `Product / ${result.product.name}`);
    return result.product;
  },

  // Used by the Products page's CSV import. `skipped` names rows that were dropped as
  // duplicates (of the existing catalog, or of an earlier row in the same file) rather than
  // failing the whole import — see createProductsBulkOnServer.
  async createBulk(
    inputs: Omit<Product, "id" | "stock" | "sku">[],
  ): Promise<{ products: Product[]; skipped: string[] } | { error: string }> {
    const result = await safeServerCall(() =>
      createProductsBulkOnServer({ data: { items: inputs } }),
    );
    if ("networkError" in result) return { error: result.error };
    setProducts([...result.products, ...products]);
    logAudit(actor(), "create", `${result.products.length} products imported from CSV`);
    return { products: result.products, skipped: result.skipped };
  },

  // Restricted server-side to Super Admin, or an Admin whose own outlet owns this product —
  // see updateProductOnServer.
  async update(
    id: string,
    patch: Partial<Omit<Product, "stock" | "outletId" | "sku">>,
  ): Promise<{ ok: true } | { error: string }> {
    const { role, callerOutletId } = callerContext();
    const result = await safeServerCall(() =>
      updateProductOnServer({ data: { id, patch, role, callerOutletId } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    patchProduct(id, patch);
    logAudit(actor(), "update", `Product / ${patch.name ?? id}`);
    return { ok: true };
  },

  // Restricted server-side to Super Admin, or an Admin whose own outlet owns this product —
  // see removeProductOnServer.
  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const product = products.find((p) => p.id === id);
    const { role, callerOutletId } = callerContext();
    const result = await safeServerCall(() =>
      removeProductOnServer({ data: { id, role, callerOutletId } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setProducts(products.filter((p) => p.id !== id));
    logAudit(actor(), "delete", `Product / ${product?.name ?? id}`);
    return { ok: true };
  },

  // Toggles whether a product shows on the Stock Count page — an inventory-workflow flag,
  // not a catalog-identity edit, so unlike update()/remove() this stays open to any outlet's
  // staff with inventory.access (see stock-count.tsx).
  async setCountable(id: string, countable: boolean): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      setProductCountableOnServer({ data: { id, countable } }),
    );
    if ("networkError" in result) return { error: result.error };
    patchProduct(id, { countable });
    return { ok: true };
  },

  // Silent — called right after `create` once the async image search resolves, and
  // doesn't warrant its own audit entry.
  async setImage(id: string, image: string): Promise<void> {
    const result = await safeServerCall(() => setProductImageOnServer({ data: { id, image } }));
    if (!("networkError" in result)) patchProduct(id, { image });
  },

  // The only way stock is ever added client-side — called when a Purchase Invoice is
  // approved. Sales instead go through billsStore.create, which adjusts stock atomically
  // on the server as part of creating the bill.
  async increaseStock(id: string, qty: number): Promise<void> {
    const result = await safeServerCall(() => increaseStockOnServer({ data: { id, qty } }));
    if (!("networkError" in result)) patchProduct(id, { stock: result.stock });
  },

  // Silent — keeps the product's "last known cost" in sync when a Purchase Invoice for it
  // is approved, so the next invoice pre-fills a sensible price.
  async setCost(id: string, cost: number): Promise<void> {
    const result = await safeServerCall(() => setProductCostOnServer({ data: { id, cost } }));
    if (!("networkError" in result)) patchProduct(id, { cost });
  },

  // Silent — keeps the product's "last known supplier" in sync alongside setCost, when a
  // Purchase Invoice for it is approved.
  async setSupplier(id: string, supplier: string): Promise<void> {
    const result = await safeServerCall(() =>
      setProductSupplierOnServer({ data: { id, supplier } }),
    );
    if (!("networkError" in result)) patchProduct(id, { supplier });
  },

  // Stock Count — sets a product's stock to a manually counted quantity, up or down, with
  // a reason for the audit trail (Settings > Inventory > Stock Adjustment Types).
  async setStockCount(
    id: string,
    newQty: number,
    reason: string,
  ): Promise<{ ok: true } | { error: string }> {
    const product = products.find((p) => p.id === id);
    const result = await safeServerCall(() =>
      setStockCountOnServer({ data: { id, newQty, reason } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    patchProduct(id, { stock: result.stock });
    const sign = result.delta > 0 ? "+" : "";
    logAudit(
      actor(),
      "update",
      `Stock Count / ${product?.name ?? id} ${sign}${result.delta} (${reason})`,
    );
    return { ok: true };
  },
};

export function useProducts(): Product[] {
  useEffect(() => ensureInitialFetch(), []);
  const allProducts = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => products,
    () => products,
  );
  // Each outlet's catalog is its own — filter to the current user's outlet, same as
  // useCustomers()/usePurchaseInvoices(). Super Admin (scopeOutletId === null) sees every
  // outlet's products combined.
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allProducts.filter((p) => p.outletId === scopeOutletId) : allProducts),
    [allProducts, scopeOutletId],
  );
}
