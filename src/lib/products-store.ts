import { useEffect, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { Product } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { createOutboxStore, createSyncScheduler } from "@/lib/offline-store";
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

function callerContext() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
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

// ---------------------------------------------------------------------------
// Local-first add/edit/delete: every create/update/remove below applies to this
// device's own copy of the catalog immediately (so the UI never waits on a round trip) and
// queues the change to sync to Supabase in the background — same "save on device first"
// model bills already use for Save Bill, extended here to the catalog. See offline-store.ts.
// ---------------------------------------------------------------------------

type ProductInput = Omit<Product, "id" | "stock" | "sku">;

const outbox = createOutboxStore<ProductInput>("dhipos-products-outbox");

// Once a locally-created product's real, server-assigned id lands, this remembers
// "local-xxx now means p-1234" — so anything still holding onto the temporary id (e.g. the
// Products page's image-search callback, which resolves well after Save closes the dialog)
// keeps targeting the same product instead of a temp id nothing recognizes anymore.
const productIdRedirects = new Map<string, string>();

export function resolveProductId(id: string): string {
  let current = id;
  while (productIdRedirects.has(current)) current = productIdRedirects.get(current)!;
  return current;
}

// Mirrors findDuplicateProduct in products-api.ts — checked here too (against this device's
// already-loaded catalog, which includes any of its own still-unsynced local creates) purely
// so a duplicate is caught instantly instead of only after a failed background sync. The
// server re-checks authoritatively regardless — this is a convenience, not the real guard.
function localDuplicate(
  candidate: { name: string; barcode?: string; outletId: string | null },
  excludeId?: string,
): Product | undefined {
  const name = candidate.name.trim().toLowerCase();
  const barcode = candidate.barcode?.trim();
  return products.find((p) => {
    if (p.id === excludeId) return false;
    if (p.outletId !== candidate.outletId) return false;
    if (p.name.trim().toLowerCase() === name) return true;
    return !!barcode && !!p.barcode && p.barcode.trim() === barcode;
  });
}

function duplicateErrorMessage(duplicate: Product, candidateName: string): string {
  if (duplicate.name.trim().toLowerCase() === candidateName.trim().toLowerCase()) {
    return `A product named "${duplicate.name}" already exists in this outlet`;
  }
  return `A product with this barcode already exists in this outlet ("${duplicate.name}")`;
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
      const result = await safeServerCall(() => createProductOnServer({ data: entry.payload }));
      if ("networkError" in result) {
        outbox.markFailed(id, result.error);
        return "failed-network";
      }
      if ("error" in result) {
        // Rejected for a real reason (e.g. another device synced a matching product first) —
        // the placeholder never really existed anywhere but here, so just drop it.
        setProducts(products.filter((p) => p.id !== id));
        outbox.resolve(id);
        toast.error(`"${entry.payload.name}" couldn't be saved: ${result.error}`);
        return "rejected";
      }
      productIdRedirects.set(id, result.product.id);
      setProducts([result.product, ...products.filter((p) => p.id !== id)]);
      outbox.resolve(id);
      logAudit(actor(), "create", `Product / ${result.product.name} (synced)`);
      return "synced";
    }

    if (entry.op === "update") {
      const { role, callerOutletId } = callerContext();
      const result = await safeServerCall(() =>
        updateProductOnServer({ data: { id, patch: entry.patch, role, callerOutletId } }),
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
    const { role, callerOutletId } = callerContext();
    const result = await safeServerCall(() =>
      removeProductOnServer({ data: { id, role, callerOutletId } }),
    );
    if ("networkError" in result) {
      outbox.markFailed(id, result.error);
      return "failed-network";
    }
    outbox.resolve(id);
    if ("error" in result) {
      toast.error(`Couldn't delete this product: ${result.error}`);
      await refreshFromServer(); // bring the still-existing product back
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

// Mounted once via AppShell, alongside usePendingBills — drives automatic background retry
// for the catalog's own queue.
export const useProductsSync = scheduler.usePendingSync;
export const syncPendingProducts = scheduler.run;

// For the header's combined "pending sync" indicator (see AppShell) — how many products are
// still only saved on this device.
export function usePendingProductsCount(): number {
  return Object.keys(outbox.useOutbox()).length;
}

export const productsStore = {
  get: () => products,
  applyStockPatches,

  // `outletId` is part of `input` (not auto-injected here) because Super Admin has no
  // outlet of their own and must explicitly choose one — see products.tsx's Add Product
  // form, which pre-fills it from the current user for everyone else.
  async create(input: ProductInput): Promise<Product | { error: string }> {
    const duplicate = localDuplicate(input);
    if (duplicate) return { error: duplicateErrorMessage(duplicate, input.name) };
    const id = `local-${crypto.randomUUID().slice(0, 8)}`;
    const product: Product = { ...input, id, stock: 0 };
    setProducts([product, ...products]);
    outbox.queueCreate(id, input);
    logAudit(actor(), "create", `Product / ${product.name} (saved on device)`);
    void scheduler.run();
    return product;
  },

  // Used by the Products page's CSV import — a deliberate, occasional bulk admin action, so
  // (unlike create/update/remove above) this stays an immediate, online-only call: it needs
  // one atomic duplicate check across the whole batch, which only the server can do.
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
  // see updateProductOnServer. Applied to this device immediately; synced in the background.
  async update(
    id: string,
    patch: Partial<Omit<Product, "stock" | "outletId" | "sku">>,
  ): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveProductId(id);
    const current = products.find((p) => p.id === targetId);
    if (!current) return { error: "Product not found" };
    if (patch.name !== undefined || patch.barcode !== undefined) {
      const duplicate = localDuplicate(
        {
          name: patch.name ?? current.name,
          barcode: patch.barcode ?? current.barcode,
          outletId: current.outletId,
        },
        targetId,
      );
      if (duplicate) return { error: duplicateErrorMessage(duplicate, patch.name ?? current.name) };
    }
    patchProduct(targetId, patch);
    outbox.queueUpdate(targetId, patch);
    logAudit(actor(), "update", `Product / ${patch.name ?? current.name}`);
    void scheduler.run();
    return { ok: true };
  },

  // Restricted server-side to Super Admin, or an Admin whose own outlet owns this product —
  // see removeProductOnServer. Applied to this device immediately; synced in the background.
  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveProductId(id);
    const product = products.find((p) => p.id === targetId);
    if (!product) return { error: "Product not found" };
    setProducts(products.filter((p) => p.id !== targetId));
    outbox.queueRemove(targetId);
    logAudit(actor(), "delete", `Product / ${product.name}`);
    void scheduler.run();
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

  // Silent — called right after `create` once the async image search resolves, and doesn't
  // warrant its own audit entry. Goes through the same local-first queue as update() (rather
  // than calling the server directly) so it still works if the just-created product's own
  // `create` hasn't synced yet — queueUpdate folds it straight into that pending payload.
  async setImage(id: string, image: string): Promise<void> {
    const targetId = resolveProductId(id);
    patchProduct(targetId, { image });
    outbox.queueUpdate(targetId, { image });
    void scheduler.run();
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
