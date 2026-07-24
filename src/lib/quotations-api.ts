import { createServerFn } from "@tanstack/react-start";
import { getServerQuotations, mutateServerQuotations } from "@/lib/quotations-server-store";
import type { Quotation } from "@/lib/quotations-store";
import type { BillLineItem } from "@/lib/pos-data";

export const fetchQuotations = createServerFn({ method: "GET" }).handler(async () => {
  return getServerQuotations();
});

// A quotation belongs to the outlet it was created at, same convention as every other
// outlet-owned resource (Bill.outletId, Customer.outletId, Product.outletId).
function canManageQuotation(
  quotation: Quotation,
  role: string,
  callerOutletId: string | null,
): boolean {
  if (role === "Super Admin") return true;
  return quotation.outletId !== null && quotation.outletId === callerOutletId;
}

export const createQuotationOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      outletId: string | null;
      location: string;
      customerId: string | null;
      customer: string;
      items: BillLineItem[];
      subtotal: number;
      discount: number;
      gst: number;
      total: number;
      by: string;
      note?: string;
      created: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const existing = await getServerQuotations();
    const maxSeq = existing.reduce((max, q) => {
      const seq = parseInt(q.number.split("/")[1] ?? "0", 10);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    const quotation: Quotation = {
      number: `QT/${maxSeq + 1}`,
      outletId: data.outletId,
      location: data.location,
      customerId: data.customerId,
      customer: data.customer,
      items: data.items,
      subtotal: data.subtotal,
      discount: data.discount,
      gst: data.gst,
      total: data.total,
      status: "Pending",
      created: data.created,
      by: data.by,
      note: data.note,
    };
    await mutateServerQuotations((qs) => [quotation, ...qs]);
    return { ok: true as const, quotation };
  });

export const updateQuotationStatusOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      number: string;
      status: Quotation["status"];
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }): Promise<{ error: string } | { ok: true; quotation: Quotation }> => {
    const quotation = (await getServerQuotations()).find((q) => q.number === data.number);
    if (!quotation) return { error: "Quotation not found" };
    if (!canManageQuotation(quotation, data.role, data.callerOutletId)) {
      return { error: "Cannot update this quotation" };
    }
    const updated: Quotation = { ...quotation, status: data.status };
    await mutateServerQuotations((qs) => qs.map((q) => (q.number === data.number ? updated : q)));
    return { ok: true as const, quotation: updated };
  });
