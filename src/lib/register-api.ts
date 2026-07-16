import { createServerFn } from "@tanstack/react-start";
import { getServerRegisterState, mutateServerRegisterState } from "@/lib/register-server-store";

export const fetchRegisters = createServerFn({ method: "GET" }).handler(async () => {
  return getServerRegisterState();
});

export const createRegisterOnServer = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const name = data.name.trim();
    if (!name) return { error: "Register name is required" };
    if ((await getServerRegisterState()).registers[name]) {
      return { error: "A register with that name already exists" };
    }
    await mutateServerRegisterState((s) => ({
      ...s,
      registers: {
        ...s.registers,
        [name]: {
          isOpen: false,
          openedAt: null,
          openedBy: null,
          openedByDeviceId: null,
          lastClosedAt: null,
          heldBill: null,
          opening: null,
        },
      },
    }));
    return { ok: true as const };
  });

export const openRegisterOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { name: string; by: string; deviceId: string; opening: Record<string, string> }) => data,
  )
  .handler(async ({ data }) => {
    const state = await getServerRegisterState();
    const existing = state.registers[data.name];
    if (existing?.isOpen) {
      const since = existing.openedAt
        ? new Date(existing.openedAt).toLocaleString()
        : "an earlier time";
      return {
        error: `Already open on another device — opened by ${existing.openedBy ?? "someone"} since ${since}`,
      };
    }
    // Same device (shared across its browser tabs via a stable device id, unlike the
    // per-tab in-memory register pointer) already has a different register open.
    const heldElsewhere = Object.entries(state.registers).find(
      ([name, r]) => name !== data.name && r.isOpen && r.openedByDeviceId === data.deviceId,
    );
    if (heldElsewhere) {
      return {
        error: `This device already has "${heldElsewhere[0]}" open — close it before opening another register.`,
      };
    }
    const now = Date.now();
    await mutateServerRegisterState((s) => ({
      ...s,
      registers: {
        ...s.registers,
        [data.name]: {
          isOpen: true,
          openedAt: now,
          openedBy: data.by,
          openedByDeviceId: data.deviceId,
          lastClosedAt: existing?.lastClosedAt ?? null,
          heldBill: existing?.heldBill ?? null,
          opening: data.opening,
        },
      },
    }));
    return { ok: true as const, openedAt: now };
  });

export const closeRegisterOnServer = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    const existing = (await getServerRegisterState()).registers[data.name];
    if (!existing) return { error: "Register not found" };
    const now = Date.now();
    await mutateServerRegisterState((s) => ({
      ...s,
      registers: {
        ...s.registers,
        [data.name]: {
          isOpen: false,
          openedAt: null,
          openedBy: null,
          openedByDeviceId: null,
          lastClosedAt: now,
          heldBill: existing.heldBill,
          opening: null,
        },
      },
    }));
    return { ok: true as const, closedAt: now };
  });

export const forceCloseRegisterOnServer = createServerFn({ method: "POST" })
  .validator((data: { name: string; role: string }) => data)
  .handler(async ({ data }) => {
    // `role` is a client-supplied claim — this app has no server-verified auth/session
    // anywhere (src/lib/auth-store.ts checks passwords entirely in the browser). This is
    // a UI-level guard consistent with the app's existing all-client-trust permission
    // model (src/lib/permissions.ts), not a real security boundary against a malicious client.
    if (data.role !== "Admin" && data.role !== "Super Admin") {
      return { error: "Only an Admin can force-close a register" };
    }
    const existing = (await getServerRegisterState()).registers[data.name];
    if (!existing) return { error: "Register not found" };
    const now = Date.now();
    await mutateServerRegisterState((s) => ({
      ...s,
      registers: {
        ...s.registers,
        [data.name]: {
          isOpen: false,
          openedAt: null,
          openedBy: null,
          openedByDeviceId: null,
          lastClosedAt: now,
          heldBill: existing.heldBill,
          opening: null,
        },
      },
    }));
    return { ok: true as const, closedAt: now };
  });

// Saves the held/parked sale(s) for a register — called (debounced) by sale-tabs-store.ts
// whenever the cart changes while this register is open, so it's recoverable even if the
// register later changes to a different device (force-close + reopen elsewhere).
export const saveHeldBillOnServer = createServerFn({ method: "POST" })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .validator((data: { name: string; heldBill: any }) => data)
  .handler(async ({ data }) => {
    if (!(await getServerRegisterState()).registers[data.name]) return { error: "Register not found" };
    await mutateServerRegisterState((s) => ({
      ...s,
      registers: {
        ...s.registers,
        [data.name]: { ...s.registers[data.name], heldBill: data.heldBill },
      },
    }));
    return { ok: true as const };
  });
