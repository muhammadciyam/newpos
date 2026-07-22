import { createServerFn } from "@tanstack/react-start";
import { getServerOutlets, mutateServerOutlets } from "@/lib/outlets-server-store";
import type { Outlet } from "@/lib/outlets-store";

// Outlets are the structural boundary everything else (products, staff, bills) is scoped
// by — only Super Admin may create/edit/remove one, regardless of what the client UI hides.
function requireSuperAdmin(callerRole: string): { error: string } | null {
  return callerRole === "Super Admin" ? null : { error: "Only Super Admin can manage outlets" };
}

export const fetchOutlets = createServerFn({ method: "GET" }).handler(async () => {
  return getServerOutlets();
});

export const createOutletOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Outlet, "id" | "createdAt"> & { callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireSuperAdmin(data.callerRole);
    if (authError) return authError;
    const { callerRole: _callerRole, ...outletData } = data;
    const outlet: Outlet = {
      ...outletData,
      id: `outlet-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerOutlets((os) => [outlet, ...os]);
    return { ok: true as const, outlet };
  });

export const updateOutletOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; patch: Partial<Omit<Outlet, "id" | "createdAt">>; callerRole: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const authError = requireSuperAdmin(data.callerRole);
    if (authError) return authError;
    if (!(await getServerOutlets()).some((o) => o.id === data.id)) {
      return { error: "Outlet not found" };
    }
    await mutateServerOutlets((os) =>
      os.map((o) => (o.id === data.id ? { ...o, ...data.patch } : o)),
    );
    return { ok: true as const };
  });

export const removeOutletOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; callerRole: string }) => data)
  .handler(async ({ data }) => {
    const authError = requireSuperAdmin(data.callerRole);
    if (authError) return authError;
    await mutateServerOutlets((os) => os.filter((o) => o.id !== data.id));
    return { ok: true as const };
  });
