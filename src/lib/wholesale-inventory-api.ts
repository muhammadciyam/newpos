import { createServerFn } from "@tanstack/react-start";
import {
  getServerWholesaleInventory,
  mutateServerWholesaleInventory,
} from "@/lib/wholesale-inventory-server-store";
import type { WholesaleInventoryItem } from "@/lib/wholesale-inventory-store";

export const fetchWholesaleInventory = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesaleInventory();
});

export const createWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<WholesaleInventoryItem, "id" | "createdAt">) => data)
  .handler(async ({ data }) => {
    const item: WholesaleInventoryItem = {
      ...data,
      id: `winv-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerWholesaleInventory((items) => [item, ...items]);
    return { ok: true as const, item };
  });

export const updateWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; patch: Partial<Omit<WholesaleInventoryItem, "id" | "createdAt">> }) =>
      data,
  )
  .handler(async ({ data }) => {
    if (!(await getServerWholesaleInventory()).some((i) => i.id === data.id)) {
      return { error: "Item not found" };
    }
    await mutateServerWholesaleInventory((items) =>
      items.map((i) => (i.id === data.id ? { ...i, ...data.patch } : i)),
    );
    return { ok: true as const };
  });

export const removeWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerWholesaleInventory((items) => items.filter((i) => i.id !== data.id));
    return { ok: true as const };
  });
