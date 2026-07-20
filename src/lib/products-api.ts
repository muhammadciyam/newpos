import { createServerFn } from "@tanstack/react-start";
import { getServerProducts, mutateServerProducts, adjustStock } from "@/lib/products-server-store";
import type { Product } from "@/lib/pos-data";

export const fetchProducts = createServerFn({ method: "GET" }).handler(async () => {
  return getServerProducts();
});

export const createProductOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Product, "id" | "stock">) => data)
  .handler(async ({ data }) => {
    // New products always start at zero stock — quantity can only ever be added via an
    // approved Purchase Invoice or Stock Count, never set directly here.
    const product: Product = { ...data, id: `p-${Date.now()}`, stock: 0 };
    await mutateServerProducts((ps) => [product, ...ps]);
    return { ok: true as const, product };
  });

// Bulk variant for the Products page's CSV import — same zero-stock rule as
// createProductOnServer, just for many rows in one round trip. IDs are suffixed with the
// row index (not just Date.now()) since a loop of single-ms inserts would otherwise collide.
export const createProductsBulkOnServer = createServerFn({ method: "POST" })
  .validator((data: { items: Omit<Product, "id" | "stock">[] }) => data)
  .handler(async ({ data }) => {
    const now = Date.now();
    const created: Product[] = data.items.map((item, i) => ({
      ...item,
      id: `p-${now}-${i}`,
      stock: 0,
    }));
    await mutateServerProducts((ps) => [...created, ...ps]);
    return { ok: true as const, products: created };
  });

// Each outlet's catalog is its own — editing or deleting a product is only allowed by
// Super Admin or by an Admin whose own outlet matches the product's outlet. `role`/
// `callerOutletId` are client-supplied claims — this app has no server-verified auth (see
// the same caveat on forceCloseRegisterOnServer in register-api.ts) — a UI-level guard
// consistent with the rest of the app's all-client-trust permission model. `outletId`
// itself is never editable via patch — a product can't be moved to a different outlet.
function canManageProduct(product: Product, role: string, callerOutletId: string | null): boolean {
  if (role === "Super Admin") return true;
  return product.outletId !== null && product.outletId === callerOutletId;
}

export const updateProductOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<Omit<Product, "stock" | "outletId">>;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const product = (await getServerProducts()).find((p) => p.id === data.id);
    if (!product) return { error: "Product not found" };
    if (!canManageProduct(product, data.role, data.callerOutletId)) {
      return { error: "You can only edit products belonging to your own outlet" };
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
