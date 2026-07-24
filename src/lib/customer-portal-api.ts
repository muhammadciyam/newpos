import { createServerFn } from "@tanstack/react-start";
import { getServerBills } from "@/lib/bills-server-store";
import { getServerCustomers } from "@/lib/customers-server-store";

// Public — powers the "My Dhipos" customer portal linked from printed receipts / e-bills
// (see Settings > My Dhipos, and the second QR code in receipt.tsx). Only exposes one
// customer's own name/mobile/loyalty and their own bills, looked up by their
// unguessable-enough customer id — never the full customer or bill list — same trust model
// as fetchBillByNumber in bills-api.ts, since this is reachable without login.
export const fetchCustomerPortal = createServerFn({ method: "GET" })
  .validator((data: { customerId: string }) => data)
  .handler(async ({ data }) => {
    const customer = (await getServerCustomers()).find((c) => c.id === data.customerId);
    if (!customer) return { error: "Customer not found" };
    const bills = (await getServerBills()).filter((b) => b.customerId === data.customerId);
    return {
      ok: true as const,
      customer: {
        name: customer.name,
        mobile: customer.mobile,
        loyalty: customer.loyalty,
      },
      bills,
    };
  });
