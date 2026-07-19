import { createServerFn } from "@tanstack/react-start";
import {
  getServerPurchaseInvoices,
  mutateServerPurchaseInvoices,
} from "@/lib/purchase-invoices-server-store";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/lib/purchase-invoices-store";

export const fetchPurchaseInvoices = createServerFn({ method: "GET" }).handler(async () => {
  return getServerPurchaseInvoices();
});

export const createPurchaseInvoiceOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      outletId: string;
      supplierName: string;
      supplierGstNumber: string;
      supplierPhone: string;
      supplierAddress: string;
      items: PurchaseInvoiceItem[];
      gstPercent: number;
      gstAmountOverride: number | null;
      createdBy: string;
      createdAt: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const seq = (await getServerPurchaseInvoices()).length + 1;
    const invoice: PurchaseInvoice = {
      id: `pi-${Date.now()}`,
      number: `PI/${seq}`,
      outletId: data.outletId,
      supplierName: data.supplierName,
      supplierGstNumber: data.supplierGstNumber,
      supplierPhone: data.supplierPhone,
      supplierAddress: data.supplierAddress,
      items: data.items,
      gstPercent: data.gstPercent,
      gstAmountOverride: data.gstAmountOverride,
      status: "Pending",
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      receivedBy: null,
      receivedAt: null,
      reviewedBy: null,
      reviewedAt: null,
    };
    await mutateServerPurchaseInvoices((invs) => [invoice, ...invs]);
    return { ok: true as const, invoice };
  });

export const markPurchaseInvoiceReceivedOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; by: string; at: string }) => data)
  .handler(async ({ data }) => {
    const invoice = (await getServerPurchaseInvoices()).find((i) => i.id === data.id);
    if (!invoice || invoice.status !== "Pending") return { error: "Invoice not found" };
    await mutateServerPurchaseInvoices((invs) =>
      invs.map((i) =>
        i.id === data.id
          ? { ...i, status: "Received", receivedBy: data.by, receivedAt: data.at }
          : i,
      ),
    );
    return { ok: true as const };
  });

// Only flips the invoice's status — the caller (purchase-invoices-store.ts) is responsible
// for calling productsStore.increaseStock/setCost for each line first, same as before this
// moved server-side.
export const approvePurchaseInvoiceOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; by: string; at: string }) => data)
  .handler(async ({ data }) => {
    const invoice = (await getServerPurchaseInvoices()).find((i) => i.id === data.id);
    if (!invoice || invoice.status !== "Received") return { error: "Invoice not found" };
    await mutateServerPurchaseInvoices((invs) =>
      invs.map((i) =>
        i.id === data.id
          ? { ...i, status: "Approved", reviewedBy: data.by, reviewedAt: data.at }
          : i,
      ),
    );
    return { ok: true as const };
  });

export const rejectPurchaseInvoiceOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string; by: string; at: string }) => data)
  .handler(async ({ data }) => {
    const invoice = (await getServerPurchaseInvoices()).find((i) => i.id === data.id);
    if (!invoice || (invoice.status !== "Pending" && invoice.status !== "Received")) {
      return { error: "Invoice not found" };
    }
    await mutateServerPurchaseInvoices((invs) =>
      invs.map((i) =>
        i.id === data.id
          ? { ...i, status: "Rejected", reviewedBy: data.by, reviewedAt: data.at }
          : i,
      ),
    );
    return { ok: true as const };
  });

// Deletes exactly the invoice ids the caller passes — inventory.tsx passes only whatever
// is currently visible to it (already outlet-scoped by usePurchaseInvoices()), so an
// outlet-scoped Admin clearing inventory only ever clears their own outlet's invoices,
// never another outlet's.
export const clearPurchaseInvoicesOnServer = createServerFn({ method: "POST" })
  .validator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    await mutateServerPurchaseInvoices((invs) => invs.filter((i) => !data.ids.includes(i.id)));
    return { ok: true as const };
  });
