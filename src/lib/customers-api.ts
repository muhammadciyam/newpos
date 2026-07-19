import { createServerFn } from "@tanstack/react-start";
import { getServerCustomers, mutateServerCustomers } from "@/lib/customers-server-store";
import type { Customer } from "@/lib/pos-data";

export const fetchCustomers = createServerFn({ method: "GET" }).handler(async () => {
  return getServerCustomers();
});

export const createCustomerOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: Omit<Customer, "id" | "outstanding" | "spent" | "loyalty"> & { id?: string }) => data,
  )
  .handler(async ({ data }) => {
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
