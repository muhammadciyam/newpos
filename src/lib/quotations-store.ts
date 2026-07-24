import { useEffect, useMemo, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { productsStore } from "@/lib/products-store";
import { queueQuotationImport } from "@/lib/sale-tabs-store";
import type { BillLineItem } from "@/lib/pos-data";
import { fetchQuotations, createQuotationOnServer, updateQuotationStatusOnServer } from "@/lib/quotations-api";

export type Quotation = {
  number: string;
  // Which outlet this quotation was raised at — null for a user with no outlet assigned
  // (only Super Admin sees those). Same convention as Bill.outletId/Customer.outletId.
  outletId: string | null;
  location: string;
  customerId: string | null;
  customer: string;
  items: BillLineItem[];
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  // Pending -> Accepted/Declined by whoever's chasing the customer's decision. Accepted ->
  // Converted once its items have been loaded into a Sell page cart for checkout.
  status: "Pending" | "Accepted" | "Declined" | "Converted";
  created: string;
  by: string;
  note?: string;
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

function caller() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
}

let quotations: Quotation[] = [];
const listeners = new Set<() => void>();

function setQuotations(next: Quotation[]) {
  quotations = next;
  listeners.forEach((l) => l());
}

function formatNow() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchQuotations());
  if (!("networkError" in result)) setQuotations(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export type CreateQuotationInput = {
  outletId: string | null;
  location: string;
  customerId: string | null;
  customer: string;
  items: BillLineItem[];
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  note?: string;
};

export const quotationsStore = {
  get: () => quotations,

  async create(input: CreateQuotationInput): Promise<Quotation | { error: string }> {
    const result = await safeServerCall(() =>
      createQuotationOnServer({
        data: { ...input, by: actor(), created: formatNow() },
      }),
    );
    if ("networkError" in result) return { error: result.error };
    setQuotations([result.quotation, ...quotations]);
    logAudit(actor(), "create", `Quotation / ${result.quotation.number}`);
    return result.quotation;
  },

  async updateStatus(
    number: string,
    status: Quotation["status"],
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      updateQuotationStatusOnServer({ data: { number, status, ...caller() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setQuotations(quotations.map((q) => (q.number === number ? result.quotation : q)));
    logAudit(actor(), "update", `Quotation / ${number} marked ${status}`);
    return { ok: true };
  },

  // Loads an Accepted quotation's items into a fresh Sell page cart tab so the cashier can
  // take payment and check out normally, then marks the quotation Converted. Any item whose
  // product has since been deleted is skipped rather than blocking the whole conversion.
  convertToSale(number: string): { ok: true; skipped: string[] } | { error: string } {
    const quotation = quotations.find((q) => q.number === number);
    if (!quotation) return { error: "Quotation not found" };
    if (quotation.status !== "Accepted") {
      return { error: "Only an accepted quotation can be converted to a sale" };
    }
    const liveProducts = productsStore.get();
    const skipped: string[] = [];
    const lines = quotation.items
      .map((item) => {
        const product = liveProducts.find((p) => p.id === item.productId);
        if (!product) {
          skipped.push(item.name);
          return null;
        }
        return {
          product,
          qty: item.qty,
          priceOverride: item.price !== product.price ? item.price : undefined,
        };
      })
      .filter((l): l is { product: (typeof liveProducts)[number]; qty: number; priceOverride: number | undefined } => l !== null);
    if (lines.length === 0) {
      return { error: "None of this quotation's items are available anymore" };
    }
    queueQuotationImport(lines, quotation.customerId);
    void this.updateStatus(number, "Converted");
    return { ok: true, skipped };
  },
};

export function useQuotations(): Quotation[] {
  useEffect(() => ensureInitialFetch(), []);
  const all = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => quotations,
    () => quotations,
  );
  // Restricted to the current user's own outlet — Super Admin sees every outlet's
  // quotations combined, unrestricted. Matches useBills()/useCustomers()/useProducts().
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? all.filter((q) => q.outletId === scopeOutletId) : all),
    [all, scopeOutletId],
  );
}
