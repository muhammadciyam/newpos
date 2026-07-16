import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";

export type PurchaseInvoiceItem = {
  productId: string;
  productName: string;
  qty: number;
  costPrice: number;
  gstApplicable: boolean;
};

export type PurchaseInvoiceStatus = "Pending" | "Received" | "Approved" | "Rejected";

export type PurchaseInvoice = {
  id: string;
  number: string;
  supplierName: string;
  supplierGstNumber: string;
  supplierPhone: string;
  supplierAddress: string;
  items: PurchaseInvoiceItem[];
  gstPercent: number;
  gstAmountOverride: number | null;
  status: PurchaseInvoiceStatus;
  createdBy: string;
  createdAt: string;
  receivedBy: string | null;
  receivedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
};

export function invoiceTotals(
  invoice: Pick<PurchaseInvoice, "items" | "gstPercent" | "gstAmountOverride">,
) {
  const subtotal = invoice.items.reduce((s, i) => s + i.qty * i.costPrice, 0);
  const gstableSubtotal = invoice.items.reduce(
    (s, i) => s + (i.gstApplicable ? i.qty * i.costPrice : 0),
    0,
  );
  const gstAmount =
    invoice.gstAmountOverride != null
      ? invoice.gstAmountOverride
      : gstableSubtotal * (invoice.gstPercent / 100);
  const total = subtotal + gstAmount;
  return { subtotal, gstAmount, total };
}

const store = createPersistedStore<PurchaseInvoice[]>("dhipos-purchase-invoices", []);

function formatNow() {
  const d = new Date();
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

export const purchaseInvoicesStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(input: {
    supplierName: string;
    supplierGstNumber: string;
    supplierPhone: string;
    supplierAddress: string;
    items: PurchaseInvoiceItem[];
    gstPercent: number;
    gstAmountOverride: number | null;
  }) {
    const seq = store.get().length + 1;
    const invoice: PurchaseInvoice = {
      id: `pi-${Date.now()}`,
      number: `PI/${seq}`,
      supplierName: input.supplierName,
      supplierGstNumber: input.supplierGstNumber,
      supplierPhone: input.supplierPhone,
      supplierAddress: input.supplierAddress,
      items: input.items,
      gstPercent: input.gstPercent,
      gstAmountOverride: input.gstAmountOverride,
      status: "Pending",
      createdBy: actor(),
      createdAt: formatNow(),
      receivedBy: null,
      receivedAt: null,
      reviewedBy: null,
      reviewedAt: null,
    };
    store.set((invs) => [invoice, ...invs]);
    const { total } = invoiceTotals(invoice);
    logAudit(actor(), "create", `Purchase Invoice / ${invoice.number} (${total.toFixed(2)})`);
    return invoice;
  },
  // Confirms the goods physically arrived. Doesn't touch stock — that only
  // happens once an admin/manager approves.
  markReceived(id: string) {
    const invoice = store.get().find((i) => i.id === id);
    if (!invoice || invoice.status !== "Pending") return;
    store.set((invs) =>
      invs.map((i) =>
        i.id === id
          ? { ...i, status: "Received", receivedBy: actor(), receivedAt: formatNow() }
          : i,
      ),
    );
    logAudit(actor(), "update", `Purchase Invoice / ${invoice.number} marked received`);
  },
  // Only invoices that have been marked Received can be approved — an admin
  // shouldn't be approving stock nobody has confirmed showed up yet.
  async approve(id: string) {
    const invoice = store.get().find((i) => i.id === id);
    if (!invoice || invoice.status !== "Received") return;
    for (const item of invoice.items) {
      await productsStore.increaseStock(item.productId, item.qty);
      await productsStore.setCost(item.productId, item.costPrice);
    }
    store.set((invs) =>
      invs.map((i) =>
        i.id === id
          ? { ...i, status: "Approved", reviewedBy: actor(), reviewedAt: formatNow() }
          : i,
      ),
    );
    logAudit(actor(), "update", `Purchase Invoice / ${invoice.number} approved`);
  },
  reject(id: string) {
    const invoice = store.get().find((i) => i.id === id);
    if (!invoice || (invoice.status !== "Pending" && invoice.status !== "Received")) return;
    store.set((invs) =>
      invs.map((i) =>
        i.id === id
          ? { ...i, status: "Rejected", reviewedBy: actor(), reviewedAt: formatNow() }
          : i,
      ),
    );
    logAudit(actor(), "update", `Purchase Invoice / ${invoice.number} rejected`);
  },
  // Wipes every purchase invoice on this device's local storage. Does NOT reverse stock
  // already added by previously-approved invoices — this only clears the invoice records
  // themselves, since this store is local-only and has no server-side undo.
  clearAll() {
    const count = store.get().length;
    if (count === 0) return;
    store.set([]);
    logAudit(actor(), "delete", `Purchase Invoices / cleared all ${count}`);
  },
};

export function usePurchaseInvoices() {
  return usePersistedStore(store);
}
