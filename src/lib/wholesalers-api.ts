import { createServerFn } from "@tanstack/react-start";
import { getServerWholesalers, mutateServerWholesalers } from "@/lib/wholesalers-server-store";
import type { Wholesaler } from "@/lib/wholesalers-store";

// Wholesalers aren't tied to one outlet (they're the whole company's shared B2B catalog).
// Every action on them — create, edit (including catalogue/product changes, which share
// updateWholesalerOnServer), delete, and enable/disable — is Super Admin only.
function requireSuperAdmin(callerRole: string, action: string): { error: string } | null {
  return callerRole === "Super Admin" ? null : { error: `Only Super Admin can ${action}` };
}

export const fetchWholesalers = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesalers();
});

export const createWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Wholesaler, "id" | "createdAt"> & { callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireSuperAdmin(data.callerRole, "add a wholesaler");
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
    const authError = requireSuperAdmin(data.callerRole, "edit a wholesaler");
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
    const authError = requireSuperAdmin(data.callerRole, "delete a wholesaler");
    if (authError) return authError;
    await mutateServerWholesalers((ws) => ws.filter((w) => w.id !== data.id));
    return { ok: true as const };
  });

export const setWholesalerActiveOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; active: boolean; callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireSuperAdmin(data.callerRole, "enable or disable a wholesaler");
    if (authError) return authError;
    await mutateServerWholesalers((ws) =>
      ws.map((w) => (w.id === data.id ? { ...w, active: data.active } : w)),
    );
    return { ok: true as const };
  });
