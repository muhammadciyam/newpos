import { createServerFn } from "@tanstack/react-start";
import { getServerWholesalers, mutateServerWholesalers } from "@/lib/wholesalers-server-store";
import type { Wholesaler } from "@/lib/wholesalers-store";

export const fetchWholesalers = createServerFn({ method: "GET" }).handler(async () => {
  return getServerWholesalers();
});

export const createWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: Omit<Wholesaler, "id" | "createdAt">) => data)
  .handler(async ({ data }) => {
    const wholesaler: Wholesaler = {
      ...data,
      id: `sup-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await mutateServerWholesalers((ws) => [wholesaler, ...ws]);
    return { ok: true as const, wholesaler };
  });

export const updateWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; patch: Partial<Omit<Wholesaler, "id" | "createdAt">> }) => data)
  .handler(async ({ data }) => {
    if (!(await getServerWholesalers()).some((w) => w.id === data.id)) {
      return { error: "Wholesaler not found" };
    }
    await mutateServerWholesalers((ws) =>
      ws.map((w) => (w.id === data.id ? { ...w, ...data.patch } : w)),
    );
    return { ok: true as const };
  });

export const removeWholesalerOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerWholesalers((ws) => ws.filter((w) => w.id !== data.id));
    return { ok: true as const };
  });

export const setWholesalerActiveOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; active: boolean }) => data)
  .handler(async ({ data }) => {
    await mutateServerWholesalers((ws) =>
      ws.map((w) => (w.id === data.id ? { ...w, active: data.active } : w)),
    );
    return { ok: true as const };
  });
