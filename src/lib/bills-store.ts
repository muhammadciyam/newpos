import { useEffect, useSyncExternalStore } from "react";
import { type Bill, type BillLineItem } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";
import { settingsStore } from "@/lib/settings-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchBills,
  createBillOnServer,
  updateBillOnServer,
  voidBillOnServer,
  refundBillOnServer,
  settleCreditOnServer,
  recordPrintOnServer,
} from "@/lib/bills-api";

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let bills: Bill[] = [];
const listeners = new Set<() => void>();

function setBills(next: Bill[]) {
  bills = next;
  listeners.forEach((l) => l());
}

function patchBill(number: string, patch: Partial<Bill>) {
  setBills(bills.map((b) => (b.number === number ? { ...b, ...patch } : b)));
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchBills());
  if (!("networkError" in result)) setBills(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// Actively refetches on mount and every `intervalMs` — call this from Bill History so
// sales rung up on other devices/registers show up without a manual refresh.
export function useBillsPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshFromServer();
    const id = setInterval(() => void refreshFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export const billsStore = {
  get: () => bills,

  async create(input: {
    customer: string;
    customerId?: string | null;
    location: string;
    register: string;
    items: BillLineItem[];
    subtotal: number;
    discount: number;
    gst: number;
    bagQty?: number;
    bagCharge?: number;
    total: number;
    by: string;
    paymentMethod: Bill["paymentMethod"];
    paymentStatus: Bill["paymentStatus"];
    cashGiven?: number;
    changeGiven?: number;
    transferSlip?: string;
    recipientNumber?: string;
    cardSlipNumber?: string;
    customReceiptNumber?: string;
    note?: string;
    foc?: boolean;
    noDelivery?: boolean;
    tags?: string[];
    currency?: string;
    currencyRate?: number;
    currencyTotal?: number;
  }): Promise<Bill | { error: string }> {
    const result = await safeServerCall(() =>
      createBillOnServer({ data: { ...input, customerId: input.customerId ?? null } }),
    );
    if ("networkError" in result) return { error: result.error };
    setBills([result.bill, ...bills]);
    productsStore.applyStockPatches(result.updatedStock);
    logAudit(actor(), "create", `Bill / ${result.bill.number}`);
    return result.bill;
  },

  // Full edit of a sale's line items. Recomputes subtotal/GST/total from the current GST
  // rate and reconciles stock by the delta between old and new quantities per product (an
  // increase sells more stock, a decrease returns it) — done atomically on the server.
  async update(number: string, items: BillLineItem[]): Promise<{ ok: true } | { error: string }> {
    const gstPercent = settingsStore.get().tax.gstPercent;
    const result = await safeServerCall(() =>
      updateBillOnServer({ data: { number, items, actor: actor(), gstPercent } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} edited`);
    return { ok: true };
  },

  // Soft-delete: keeps the row for audit purposes, restores any stock that hadn't already
  // been refunded, and marks the bill Void.
  async void(number: string, reason?: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      voidBillOnServer({ data: { number, reason, actor: actor() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} voided`);
    return { ok: true };
  },

  // Partial or full refund. `lines` specifies how much of each product to refund now;
  // stock for the refunded quantity is restored immediately.
  async refund(
    number: string,
    lines: { productId: string; qty: number }[],
    reason?: string,
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      refundBillOnServer({ data: { number, lines, reason, actor: actor() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} refunded ${result.amount.toFixed(2)}`);
    return { ok: true };
  },

  // Marks a Credit sale's outstanding balance as collected. Available to any user —
  // recording a customer's payment is routine, not a correction.
  async settleCredit(number: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      settleCreditOnServer({ data: { number, actor: actor() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} payment settled`);
    return { ok: true };
  },

  // Silent — just remembers which template a bill was last printed with.
  async recordPrint(number: string, templateId: string): Promise<void> {
    const result = await safeServerCall(() =>
      recordPrintOnServer({ data: { number, templateId } }),
    );
    if (!("networkError" in result)) patchBill(number, { printTemplateId: templateId });
  },
};

export function useBills(): Bill[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => bills,
    () => bills,
  );
}
