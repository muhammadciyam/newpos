import { createServerFn } from "@tanstack/react-start";
import { getServerCart, mutateServerCart } from "@/lib/cart-server-store";
import type { CartItem } from "@/lib/cart-store";

// Mirrors canManageBill/canManageProduct — a cart line belongs to the outlet it was added
// from, same as every other outlet-owned resource.
function canManageCartLine(
  outletId: string | null,
  role: string,
  callerOutletId: string | null,
): boolean {
  if (role === "Super Admin") return true;
  return outletId !== null && outletId === callerOutletId;
}

export const fetchCart = createServerFn({ method: "GET" }).handler(async () => {
  return getServerCart();
});

// Upserts one row — used both for adding a new product and adjusting an existing one's qty.
export const setCartItemOnServer = createServerFn({ method: "POST" })
  .validator((data: { item: CartItem; role: string; callerOutletId: string | null }) => data)
  .handler(async ({ data }) => {
    if (!canManageCartLine(data.item.outletId, data.role, data.callerOutletId)) {
      return { error: "Cannot modify another outlet's cart" };
    }
    await mutateServerCart((items) => [
      data.item,
      ...items.filter(
        (i) => !(i.productId === data.item.productId && i.outletId === data.item.outletId),
      ),
    ]);
    return { ok: true as const };
  });

export const removeCartItemOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      productId: string;
      outletId: string | null;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (!canManageCartLine(data.outletId, data.role, data.callerOutletId)) {
      return { error: "Cannot modify another outlet's cart" };
    }
    await mutateServerCart((items) =>
      items.filter((i) => !(i.productId === data.productId && i.outletId === data.outletId)),
    );
    return { ok: true as const };
  });

// Clears only the caller's own outlet's cart lines — Super Admin (no outlet of their own)
// clears every outlet's, matching what they see combined in the Cart dialog.
export const clearCartOnServer = createServerFn({ method: "POST" })
  .validator((data: { role: string; callerOutletId: string | null }) => data)
  .handler(async ({ data }) => {
    await mutateServerCart((items) =>
      data.role === "Super Admin" ? [] : items.filter((i) => i.outletId !== data.callerOutletId),
    );
    return { ok: true as const };
  });
