import { createServerFn } from "@tanstack/react-start";
import { getServerCart, mutateServerCart } from "@/lib/cart-server-store";
import type { CartItem } from "@/lib/cart-store";

export const fetchCart = createServerFn({ method: "GET" }).handler(async () => {
  return getServerCart();
});

// Upserts one row — used both for adding a new product and adjusting an existing one's qty.
export const setCartItemOnServer = createServerFn({ method: "POST" })
  .validator((data: CartItem) => data)
  .handler(async ({ data }) => {
    await mutateServerCart((items) => [
      data,
      ...items.filter((i) => i.productId !== data.productId),
    ]);
    return { ok: true as const };
  });

export const removeCartItemOnServer = createServerFn({ method: "POST" })
  .validator((data: { productId: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerCart((items) => items.filter((i) => i.productId !== data.productId));
    return { ok: true as const };
  });

export const clearCartOnServer = createServerFn({ method: "POST" }).handler(async () => {
  await mutateServerCart(() => []);
  return { ok: true as const };
});
