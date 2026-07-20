import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import {
  fetchPurchaseInvoices,
  createPurchaseInvoiceOnServer,
  markPurchaseInvoiceReceivedOnServer,
  approvePurchaseInvoiceOnServer,
  rejectPurchaseInvoiceOnServer,
  clearPurchaseInvoicesOnServer,
} from "@/lib/purchase-invoices-api";

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
  // Which outlet this invoice's stock is received into once approved.
  outletId: string;
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

let invoices: PurchaseInvoice[] = [];
const listeners = new Set<() => void>();

function setInvoices(next: PurchaseInvoice[]) {
  invoices = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchPurchaseInvoices());
  if (!("networkError" in result)) setInvoices(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const purchaseInvoicesStore = {
  get: () => invoices,

  async create(input: {
    outletId: string;
    supplierName: string;
    supplierGstNumber: string;
    supplierPhone: string;
    supplierAddress: string;
    items: PurchaseInvoiceItem[];
    gstPercent: number;
    gstAmountOverride: number | null;
  }): Promise<PurchaseInvoice | { error: string }> {
    const result = await safeServerCall(() =>
      createPurchaseInvoiceOnServer({
        data: { ...input, createdBy: actor(), createdAt: formatNow() },
      }),
    );
    if ("networkError" in result) return { error: result.error };
    setInvoices([result.invoice, ...invoices]);
    const { total } = invoiceTotals(result.invoice);
    logAudit(
      actor(),
      "create",
      `Purchase Invoice / ${result.invoice.number} (${total.toFixed(2)})`,
    );
    return result.invoice;
  },

  // Confirms the goods physically arrived. Doesn't touch stock — that only
  // happens once an admin/manager approves.
  async markReceived(id: string): Promise<{ ok: true } | { error: string }> {
    const invoice = invoices.find((i) => i.id === id);
    const at = formatNow();
    const by = actor();
    const result = await safeServerCall(() =>
      markPurchaseInvoiceReceivedOnServer({ data: { id, by, at } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setInvoices(
      invoices.map((i) =>
        i.id === id ? { ...i, status: "Received", receivedBy: by, receivedAt: at } : i,
      ),
    );
    logAudit(by, "update", `Purchase Invoice / ${invoice?.number ?? id} marked received`);
    return { ok: true };
  },

  // Only invoices that have been marked Received can be approved — an admin
  // shouldn't be approving stock nobody has confirmed showed up yet.
  async approve(id: string): Promise<{ ok: true } | { error: string }> {
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice || invoice.status !== "Received") return { error: "Invoice not found" };
    for (const item of invoice.items) {
      await productsStore.increaseStock(item.productId, item.qty);
      await productsStore.setCost(item.productId, item.costPrice);
    }
    const at = formatNow();
    const by = actor();
    const result = await safeServerCall(() =>
      approvePurchaseInvoiceOnServer({ data: { id, by, at } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setInvoices(
      invoices.map((i) =>
        i.id === id ? { ...i, status: "Approved", reviewedBy: by, reviewedAt: at } : i,
      ),
    );
    logAudit(by, "update", `Purchase Invoice / ${invoice.number} approved`);
    return { ok: true };
  },

  async reject(id: string): Promise<{ ok: true } | { error: string }> {
    const invoice = invoices.find((i) => i.id === id);
    const at = formatNow();
    const by = actor();
    const result = await safeServerCall(() =>
      rejectPurchaseInvoiceOnServer({ data: { id, by, at } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setInvoices(
      invoices.map((i) =>
        i.id === id ? { ...i, status: "Rejected", reviewedBy: by, reviewedAt: at } : i,
      ),
    );
    logAudit(by, "update", `Purchase Invoice / ${invoice?.number ?? id} rejected`);
    return { ok: true };
  },

  // Deletes exactly the invoices in `ids` — the caller passes whatever it currently has in
  // scope (see inventory.tsx, which passes its own already outlet-scoped list), so an
  // outlet-scoped Admin clearing inventory only ever clears their own outlet's invoices.
  // Does NOT reverse stock already added by previously-approved invoices — this only
  // clears the invoice records themselves.
  async clearAll(ids: string[]): Promise<{ ok: true } | { error: string }> {
    if (ids.length === 0) return { ok: true };
    const result = await safeServerCall(() => clearPurchaseInvoicesOnServer({ data: { ids } }));
    if ("networkError" in result) return { error: result.error };
    setInvoices(invoices.filter((i) => !ids.includes(i.id)));
    logAudit(actor(), "delete", `Purchase Invoices / cleared ${ids.length}`);
    return { ok: true };
  },
};

export function usePurchaseInvoices(): PurchaseInvoice[] {
  useEffect(() => ensureInitialFetch(), []);
  const allInvoices = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => invoices,
    () => invoices,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's
  // purchase invoices combined, unrestricted. Matches useBills()/useProducts().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allInvoices.filter((i) => i.outletId === scopeOutletId) : allInvoices),
    [allInvoices, scopeOutletId],
  );
}
