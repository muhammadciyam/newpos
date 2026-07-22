import { createServerFn } from "@tanstack/react-start";
import {
  getServerWholesaleInventory,
  mutateServerWholesaleInventory,
} from "@/lib/wholesale-inventory-server-store";
import type { WholesaleInventoryItem } from "@/lib/wholesale-inventory-store";

// Same reasoning as wholesalers-api.ts — not outlet-scoped, just gated to the built-in
// roles that get wholesale.manage by default.
function requireWholesaleManage(callerRole: string): { error: string } | null {
  return ["Super Admin", "Admin", "Manager"].includes(callerRole)
    ? null
    : { error: "You don't have permission to manage wholesale inventory" };
}

export const fetchWholesaleInventory = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesaleInventory();
});

export const createWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: Omit<WholesaleInventoryItem, "id" | "createdAt"> & { callerRole: string }) => data,
  )
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    const { callerRole: _callerRole, ...itemData } = data;
    const item: WholesaleInventoryItem = {
      ...itemData,
      id: `winv-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerWholesaleInventory((items) => [item, ...items]);
    return { ok: true as const, item };
  });

export const updateWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<Omit<WholesaleInventoryItem, "id" | "createdAt">>;
      callerRole: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    if (!(await getServerWholesaleInventory()).some((i) => i.id === data.id)) {
      return { error: "Item not found" };
    }
    await mutateServerWholesaleInventory((items) =>
      items.map((i) => (i.id === data.id ? { ...i, ...data.patch } : i)),
    );
    return { ok: true as const };
  });

export const removeWholesaleInventoryItemOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    await mutateServerWholesaleInventory((items) => items.filter((i) => i.id !== data.id));
    return { ok: true as const };
  });
