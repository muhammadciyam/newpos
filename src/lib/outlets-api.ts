import { createServerFn } from "@tanstack/react-start";
import { getServerOutlets, mutateServerOutlets } from "@/lib/outlets-server-store";
import type { Outlet } from "@/lib/outlets-store";

export const fetchOutlets = createServerFn({ method: "GET" }).handler(async () => {
  return getServerOutlets();
});

export const createOutletOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Outlet, "id" | "createdAt">) => data)
  .handler(async ({ data }) => {
    const outlet: Outlet = {
      ...data,
      id: `outlet-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerOutlets((os) => [outlet, ...os]);
    return { ok: true as const, outlet };
  });

export const updateOutletOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Omit<Outlet, "id" | "createdAt">> }) => data)
  .handler(async ({ data }) => {
    if (!(await getServerOutlets()).some((o) => o.id === data.id)) {
      return { error: "Outlet not found" };
    }
    await mutateServerOutlets((os) =>
      os.map((o) => (o.id === data.id ? { ...o, ...data.patch } : o)),
    );
    return { ok: true as const };
  });

export const removeOutletOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerOutlets((os) => os.filter((o) => o.id !== data.id));
    return { ok: true as const };
  });
