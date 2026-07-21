import { createServerFn } from "@tanstack/react-start";
import { getServerCustomers, mutateServerCustomers } from "@/lib/customers-server-store";
import type { Customer } from "@/lib/pos-data";

export const fetchCustomers = createServerFn({ method: "GET" }).handler(async () => {
  return getServerCustomers();
});

function normalizeForMatch(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export const createCustomerOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: Omit<Customer, "id" | "outstanding" | "spent" | "loyalty"> & { id?: string }) => data,
  )
  .handler(async ({ data }): Promise<{ error: string } | { ok: true; customer: Customer }> => {
    const mobile = normalizeForMatch(data.mobile);
    const address = normalizeForMatch(data.address);
    // Only flags a duplicate once there's enough identifying detail (name AND phone AND
    // address) to be confident it's really the same person — matching on name alone, or
    // against a blank phone/address, is too common to safely block, especially for walk-in
    // customers with minimal info on file. Scoped to the same outlet, same as every other
    // customer lookup/list in the app.
    if (mobile && address) {
      const name = normalizeForMatch(data.name);
      const existing = await getServerCustomers();
      const duplicate = existing.some(
        (c) =>
          c.outletId === data.outletId &&
          normalizeForMatch(c.name) === name &&
          normalizeForMatch(c.mobile) === mobile &&
          normalizeForMatch(c.address) === address,
      );
      if (duplicate) {
        return { error: "A customer with this name, phone number and address already exists" };
      }
    }
    const customer: Customer = {
      ...data,
      id: data.id ?? `${data.mobile || data.name}-${Date.now()}`,
      outstanding: 0,
      spent: 0,
      loyalty: 0,
    };
    await mutateServerCustomers((cs) => [customer, ...cs]);
    return { ok: true as const, customer };
  });

export const updateCustomerOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      patch: Partial<Omit<Customer, "id" | "outstanding" | "spent" | "loyalty">>;
    }) => data,
  )
  .handler(async ({ data }) => {
    if (!(await getServerCustomers()).some((c) => c.id === data.id)) {
      return { error: "Customer not found" };
    }
    await mutateServerCustomers((cs) =>
      cs.map((c) => (c.id === data.id ? { ...c, ...data.patch } : c)),
    );
    return { ok: true as const };
  });

export const removeCustomerOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerCustomers((cs) => cs.filter((c) => c.id !== data.id));
    return { ok: true as const };
  });

export const addCustomerSpendOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; amount: number }) => data)
  .handler(async ({ data }) => {
    await mutateServerCustomers((cs) =>
      cs.map((c) => (c.id === data.id ? { ...c, spent: c.spent + data.amount } : c)),
    );
    return { ok: true as const };
  });
