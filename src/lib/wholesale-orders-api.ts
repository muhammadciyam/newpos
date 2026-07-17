import { createServerFn } from "@tanstack/react-start";
import {
  getServerWholesaleOrders,
  mutateServerWholesaleOrders,
} from "@/lib/wholesale-orders-server-store";
import type { CartItem } from "@/lib/cart-store";
import type { WholesaleOrder } from "@/lib/wholesale-orders-store";

export const fetchWholesaleOrders = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesaleOrders();
});

export const createWholesaleOrderOnServer = createServerFn({ method: "POST" })
  .validator((data: { items: CartItem[]; total: number; placedBy: string }) => data)
  .handler(async ({ data }) => {
    const order: WholesaleOrder = {
      id: `worder-${Date.now()}`,
      items: data.items,
      total: data.total,
      placedBy: data.placedBy,
      createdAt: new Date().toISOString(),
    };
    await mutateServerWholesaleOrders((orders) => [order, ...orders]);
    return { ok: true as const, order };
  });
