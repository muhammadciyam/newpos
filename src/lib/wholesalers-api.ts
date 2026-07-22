import { createServerFn } from "@tanstack/react-start";
import { getServerWholesalers, mutateServerWholesalers } from "@/lib/wholesalers-server-store";
import type { Wholesaler } from "@/lib/wholesalers-store";

// Wholesalers aren't tied to one outlet (they're the whole company's shared B2B catalog),
// so there's no outlet to check ownership against — just the built-in roles that get
// wholesale.manage by default (see permissions.ts). Doesn't account for a custom role
// separately granted the permission, same simplification the rest of this app's
// server-side checks already make (see canManageProduct in products-api.ts).
function requireWholesaleManage(callerRole: string): { error: string } | null {
  return ["Super Admin", "Admin", "Manager"].includes(callerRole)
    ? null
    : { error: "You don't have permission to manage wholesalers" };
}

export const fetchWholesalers = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesalers();
});

export const createWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Wholesaler, "id" | "createdAt"> & { callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    const { callerRole: _callerRole, ...wholesalerData } = data;
    const wholesaler: Wholesaler = {
      ...wholesalerData,
      id: `sup-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerWholesalers((ws) => [wholesaler, ...ws]);
    return { ok: true as const, wholesaler };
  });

export const updateWholesalerOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<Omit<Wholesaler, "id" | "createdAt">>;
      callerRole: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    if (!(await getServerWholesalers()).some((w) => w.id === data.id)) {
      return { error: "Wholesaler not found" };
    }
    await mutateServerWholesalers((ws) =>
      ws.map((w) => (w.id === data.id ? { ...w, ...data.patch } : w)),
    );
    return { ok: true as const };
  });

export const removeWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    await mutateServerWholesalers((ws) => ws.filter((w) => w.id !== data.id));
    return { ok: true as const };
  });

export const setWholesalerActiveOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; active: boolean; callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireWholesaleManage(data.callerRole);
    if (authError) return authError;
    await mutateServerWholesalers((ws) =>
      ws.map((w) => (w.id === data.id ? { ...w, active: data.active } : w)),
    );
    return { ok: true as const };
  });
