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
    // approved Purchase Invoice, never set directly here.
    const product: Product = { ...data, id: `p-${Date.now()}`, stock: 0 };
    await mutateServerProducts((ps) => [product, ...ps]);
    return { ok: true as const, product };
  });

export const updateProductOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Omit<Product, "stock">> }) => data)
  .handler(async ({ data }) => {
    if (!(await getServerProducts()).some((p) => p.id === data.id)) {
      return { error: "Product not found" };
    }
    await mutateServerProducts((ps) => ps.map((p) => (p.id === data.id ? { ...p, ...data.patch } : p)));
    return { ok: true as const };
  });

export const removeProductOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerProducts((ps) => ps.filter((p) => p.id !== data.id));
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
    const stock = (await getServerProducts()).find((p) => p.id === data.id)?.stock ?? 0;
    return { ok: true as const, stock };
  });

// Stock Count — sets a product's stock to a manually counted quantity (can move stock up
// or down, unlike increaseStockOnServer). `reason` is caller-supplied for the audit trail
// only; validation of allowed reasons happens client-side against Settings > Inventory.
export const setStockCountOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; newQty: number; reason: string }) => data)
  .handler(async ({ data }) => {
    const product = (await getServerProducts()).find((p) => p.id === data.id);
    if (!product) return { error: "Product not found" };
    const delta = data.newQty - product.stock;
    await adjustStock(data.id, delta);
    const stock = (await getServerProducts()).find((p) => p.id === data.id)?.stock ?? 0;
    return { ok: true as const, stock, delta };
  });
