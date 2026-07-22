import { createServerFn } from "@tanstack/react-start";
import { getServerProducts, mutateServerProducts, adjustStock } from "@/lib/products-server-store";
import { getServerBills } from "@/lib/bills-server-store";
import type { Product } from "@/lib/pos-data";

export const fetchProducts = createServerFn({ method: "GET" }).handler(async () => {
  return getServerProducts();
});

// SKU is always auto-generated here (never client-supplied) — a zero-padded 6-digit
// sequence starting at 000001, one higher than the highest existing numeric SKU. Non-numeric
// legacy SKUs (free-typed before this existed) are ignored when finding that max rather than
// breaking the sequence. Also double-checked for collisions (see nextUniqueSku) since nothing
// here locks the table between reading `existing` and writing the new row.
function maxSkuNumber(products: Product[]): number {
  return products.reduce((max, p) => {
    const n = p.sku ? parseInt(p.sku, 10) : NaN;
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
}

// Walks past any SKU that's somehow already taken (a concurrent create landing between this
// request's read and write) rather than risking two products sharing one — cheap insurance
// on top of maxSkuNumber already making collisions rare.
function nextUniqueSku(taken: Set<string>, from: number): { sku: string; next: number } {
  let n = from;
  let sku = String(n).padStart(6, "0");
  while (taken.has(sku)) {
    n += 1;
    sku = String(n).padStart(6, "0");
  }
  return { sku, next: n };
}

// Two products count as the same one if they'd confuse a cashier scanning/searching for
// them — same name, or same barcode — within the same outlet's catalog (each outlet manages
// its own catalog independently, same scoping as canManageProduct below). `excludeId` lets an
// edit re-check without tripping over the product's own existing row.
function findDuplicateProduct(
  existing: Product[],
  candidate: { name: string; barcode?: string; outletId: string | null },
  excludeId?: string,
): Product | undefined {
  const name = candidate.name.trim().toLowerCase();
  const barcode = candidate.barcode?.trim();
  return existing.find((p) => {
    if (p.id === excludeId) return false;
    if (p.outletId !== candidate.outletId) return false;
    if (p.name.trim().toLowerCase() === name) return true;
    return !!barcode && !!p.barcode && p.barcode.trim() === barcode;
  });
}

// Widened to plain `string` (rather than letting the ternary infer a narrow template-literal
// union) — that narrow inference otherwise confuses the discriminated-union narrowing client
// stores rely on (`if ("error" in result) return result;`).
function duplicateProductError(duplicate: Product, candidateName: string): string {
  if (duplicate.name.trim().toLowerCase() === candidateName.trim().toLowerCase()) {
    return `A product named "${duplicate.name}" already exists in this outlet`;
  }
  return `A product with this barcode already exists in this outlet ("${duplicate.name}")`;
}

export const createProductOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Product, "id" | "stock" | "sku">) => data)
  .handler(async ({ data }): Promise<{ error: string } | { ok: true; product: Product }> => {
    const existing = await getServerProducts();
    const duplicate = findDuplicateProduct(existing, data);
    if (duplicate) {
      return { error: duplicateProductError(duplicate, data.name) };
    }
    const { sku } = nextUniqueSku(
      new Set(existing.map((p) => p.sku).filter((s): s is string => !!s)),
      maxSkuNumber(existing) + 1,
    );
    // New products always start at zero stock — quantity can only ever be added via an
    // approved Purchase Invoice or Stock Count, never set directly here.
    const product: Product = { ...data, id: `p-${Date.now()}`, stock: 0, sku };
    await mutateServerProducts((ps) => [product, ...ps]);
    return { ok: true as const, product };
  });

// Bulk variant for the Products page's CSV import — same zero-stock, auto-SKU and duplicate
// rules as createProductOnServer, just for many rows in one round trip, each getting the next
// number in sequence. IDs are suffixed with the row index (not just Date.now()) since a loop
// of single-ms inserts would otherwise collide. Duplicates (against the existing catalog, or
// against an earlier row in this same file) are silently skipped rather than failing the
// whole import — the name is reported back so the client can tell the user what didn't import.
export const createProductsBulkOnServer = createServerFn({ method: "POST" })
  .validator((data: { items: Omit<Product, "id" | "stock" | "sku">[] }) => data)
  .handler(async ({ data }) => {
    const now = Date.now();
    const existing = await getServerProducts();
    const taken = new Set(existing.map((p) => p.sku).filter((s): s is string => !!s));
    let nextNum = maxSkuNumber(existing);
    const created: Product[] = [];
    const skipped: string[] = [];
    const seenThisBatch: Product[] = [];
    for (const item of data.items) {
      if (findDuplicateProduct([...existing, ...seenThisBatch], item)) {
        skipped.push(item.name);
        continue;
      }
      const { sku, next } = nextUniqueSku(taken, nextNum + 1);
      nextNum = next;
      taken.add(sku);
      const product: Product = { ...item, id: `p-${now}-${created.length}`, stock: 0, sku };
      created.push(product);
      seenThisBatch.push(product);
    }
    if (created.length > 0) await mutateServerProducts((ps) => [...created, ...ps]);
    return { ok: true as const, products: created, skipped };
  });

// Each outlet's catalog is its own — editing or deleting a product is only allowed by
// Super Admin or by an Admin whose own outlet matches the product's outlet. `role`/
// `callerOutletId` are client-supplied claims — this app has no server-verified auth (see
// the same caveat on forceCloseRegisterOnServer in register-api.ts) — a UI-level guard
// consistent with the rest of the app's all-client-trust permission model. `outletId` itself
// is never editable via patch — a product can't be moved to a different outlet — and neither
// is `sku`, which is only ever assigned once, at creation (see maxSkuNumber above).
function canManageProduct(product: Product, role: string, callerOutletId: string | null): boolean {
  if (role === "Super Admin") return true;
  return product.outletId !== null && product.outletId === callerOutletId;
}

export const updateProductOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<Omit<Product, "stock" | "outletId" | "sku">>;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const existing = await getServerProducts();
    const product = existing.find((p) => p.id === data.id);
    if (!product) return { error: "Product not found" };
    if (!canManageProduct(product, data.role, data.callerOutletId)) {
      return { error: "You can only edit products belonging to your own outlet" };
    }
    if (data.patch.name !== undefined || data.patch.barcode !== undefined) {
      const duplicate = findDuplicateProduct(
        existing,
        {
          name: data.patch.name ?? product.name,
          barcode: data.patch.barcode ?? product.barcode,
          outletId: product.outletId,
        },
        product.id,
      );
      if (duplicate) {
        return { error: duplicateProductError(duplicate, data.patch.name ?? product.name) };
      }
    }
    await mutateServerProducts((ps) =>
      ps.map((p) => (p.id === data.id ? { ...p, ...data.patch } : p)),
    );
    return { ok: true as const };
  });

export const removeProductOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; role: string; callerOutletId: string | null }) => data)
  .handler(async ({ data }) => {
    const product = (await getServerProducts()).find((p) => p.id === data.id);
    if (!product) return { error: "Product not found" };
    if (!canManageProduct(product, data.role, data.callerOutletId)) {
      return { error: "You can only delete products belonging to your own outlet" };
    }
    const hasSales = (await getServerBills()).some((b) =>
      b.items.some((i) => i.productId === data.id),
    );
    if (hasSales) {
      return { error: "This product has sales on record and can't be deleted." };
    }
    await mutateServerProducts((ps) => ps.filter((p) => p.id !== data.id));
    return { ok: true as const };
  });

// Toggling whether a product shows on the Stock Count page is an inventory-workflow flag,
// not a catalog-identity edit — kept open to anyone with inventory.access (checked
// client-side in stock-count.tsx), unlike updateProductOnServer above.
export const setProductCountableOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; countable: boolean }) => data)
  .handler(async ({ data }) => {
    await mutateServerProducts((ps) =>
      ps.map((p) => (p.id === data.id ? { ...p, countable: data.countable } : p)),
    );
    return { ok: true as const };
  });

// Silent — called right after createProductOnServer once the async image search
// resolves, and doesn't warrant its own audit entry.
export const setProductImageOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; image: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerProducts((ps) =>
      ps.map((p) => (p.id === data.id ? { ...p, image: data.image } : p)),
    );
    return { ok: true as const };
  });

// Silent — keeps the product's "last known cost" in sync when a Purchase Invoice for it
// is approved, so the next invoice pre-fills a sensible price.
export const setProductCostOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; cost: number }) => data)
  .handler(async ({ data }) => {
    await mutateServerProducts((ps) =>
      ps.map((p) => (p.id === data.id ? { ...p, cost: data.cost } : p)),
    );
    return { ok: true as const };
  });

// The only client-callable way stock is ever added — called when a Purchase Invoice is
// approved. Sales instead decrement stock atomically inside bills-api.ts's handlers.
export const increaseStockOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; qty: number }) => data)
  .handler(async ({ data }) => {
    await adjustStock(data.id, data.qty);
    const product = (await getServerProducts()).find((p) => p.id === data.id);
    return { ok: true as const, stock: product?.stock ?? 0 };
  });

// Stock Count — sets a product's stock to a manually counted quantity (can move it up or
// down, unlike increaseStockOnServer). `reason` is caller-supplied for the audit trail
// only; validation of allowed reasons happens client-side against Settings > Inventory.
export const setStockCountOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; newQty: number; reason: string }) => data)
  .handler(async ({ data }) => {
    const product = (await getServerProducts()).find((p) => p.id === data.id);
    if (!product) return { error: "Product not found" };
    const delta = data.newQty - product.stock;
    await adjustStock(data.id, delta);
    const updated = (await getServerProducts()).find((p) => p.id === data.id);
    return { ok: true as const, stock: updated?.stock ?? 0, delta };
  });
