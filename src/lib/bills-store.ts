import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { type Bill, type BillLineItem } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";
import { settingsStore } from "@/lib/settings-store";

const store = createPersistedStore<Bill[]>("dhipos-bills-v2", []);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
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

function remainingQty(item: BillLineItem) {
  return item.qty - (item.refundedQty ?? 0);
}

export const billsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,

  create(input: {
    customer: string;
    customerId?: string | null;
    location: string;
    register: string;
    items: BillLineItem[];
    subtotal: number;
    discount: number;
    gst: number;
    total: number;
    by: string;
    paymentMethod: Bill["paymentMethod"];
    paymentStatus: Bill["paymentStatus"];
    cashGiven?: number;
    changeGiven?: number;
    transferSlip?: string;
    recipientNumber?: string;
    cardSlipNumber?: string;
  }) {
    const existing = store.get();
    const maxSeq = existing.reduce((max, b) => {
      const seq = parseInt(b.number.split("/")[1] ?? "0", 10);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    const bill: Bill = {
      number: `1/${maxSeq + 1}`,
      customer: input.customer,
      customerId: input.customerId ?? null,
      location: input.location,
      register: input.register,
      status: "Sale",
      items: input.items,
      subtotal: input.subtotal,
      discount: input.discount,
      gst: input.gst,
      total: input.total,
      created: formatNow(),
      by: input.by,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      cashGiven: input.cashGiven,
      changeGiven: input.changeGiven,
      transferSlip: input.transferSlip,
      recipientNumber: input.recipientNumber,
      cardSlipNumber: input.cardSlipNumber,
    };
    store.set((bs) => [bill, ...bs]);
    logAudit(authStore.getCurrentUser()?.name ?? input.by, "create", `Bill / ${bill.number}`);
    return bill;
  },

  // Full edit of a sale's line items. Recomputes subtotal/GST/total from the
  // current GST rate and reconciles stock by the delta between old and new
  // quantities per product (an increase sells more stock, a decrease returns it).
  update(number: string, items: BillLineItem[]): { ok: true } | { error: string } {
    const bill = store.get().find((b) => b.number === number);
    if (!bill) return { error: "Bill not found" };
    if (bill.status !== "Sale") return { error: `Cannot edit a bill that is ${bill.status}` };

    const oldByProduct = new Map(bill.items.map((i) => [i.productId, i]));
    const newByProduct = new Map(items.map((i) => [i.productId, i]));

    for (const [productId, newItem] of newByProduct) {
      const oldQty = oldByProduct.get(productId)?.qty ?? 0;
      const delta = newItem.qty - oldQty;
      if (delta > 0) productsStore.decrementStock(productId, delta);
      else if (delta < 0) productsStore.increaseStock(productId, -delta);
    }
    for (const [productId, oldItem] of oldByProduct) {
      if (!newByProduct.has(productId)) productsStore.increaseStock(productId, oldItem.qty);
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const gstPercent = settingsStore.get().tax.gstPercent;
    const gst = subtotal * (gstPercent / 100);
    const total = subtotal - bill.discount + gst;

    store.set((bs) =>
      bs.map((b) =>
        b.number === number
          ? {
              ...b,
              items,
              subtotal,
              gst,
              total,
              editedBy: actor(),
              editedAt: formatNow(),
              originalTotal: b.originalTotal ?? b.total,
            }
          : b,
      ),
    );
    logAudit(actor(), "update", `Bill / ${number} edited`);
    return { ok: true };
  },

  // Soft-delete: keeps the row for audit purposes, restores any stock that
  // hadn't already been refunded, and marks the bill Void.
  void(number: string, reason?: string): { ok: true } | { error: string } {
    const bill = store.get().find((b) => b.number === number);
    if (!bill) return { error: "Bill not found" };
    if (bill.status !== "Sale" && bill.status !== "Partially Refunded") {
      return { error: `Bill is already ${bill.status}` };
    }

    for (const item of bill.items) {
      const qty = remainingQty(item);
      if (qty > 0) productsStore.increaseStock(item.productId, qty);
    }

    store.set((bs) =>
      bs.map((b) =>
        b.number === number
          ? { ...b, status: "Void", voidedBy: actor(), voidedAt: formatNow(), voidReason: reason }
          : b,
      ),
    );
    logAudit(actor(), "update", `Bill / ${number} voided`);
    return { ok: true };
  },

  // Partial or full refund. `lines` specifies how much of each product to
  // refund now; stock for the refunded quantity is restored immediately.
  refund(
    number: string,
    lines: { productId: string; qty: number }[],
    reason?: string,
  ): { ok: true } | { error: string } {
    const bill = store.get().find((b) => b.number === number);
    if (!bill) return { error: "Bill not found" };
    if (bill.status !== "Sale" && bill.status !== "Partially Refunded") {
      return { error: `Cannot refund a bill that is ${bill.status}` };
    }

    const itemsByProduct = new Map(bill.items.map((i) => [i.productId, i]));
    for (const line of lines) {
      const item = itemsByProduct.get(line.productId);
      if (!item) return { error: `Item ${line.productId} not on this bill` };
      if (line.qty <= 0) continue;
      if (line.qty > remainingQty(item))
        return { error: `Cannot refund more than the remaining quantity of ${item.name}` };
    }

    const refundItems = lines
      .filter((l) => l.qty > 0)
      .map((l) => {
        const item = itemsByProduct.get(l.productId)!;
        return { productId: item.productId, name: item.name, qty: l.qty, price: item.price };
      });
    if (refundItems.length === 0) return { error: "Nothing selected to refund" };

    const amount = refundItems.reduce((s, i) => s + i.price * i.qty, 0);
    for (const ri of refundItems) productsStore.increaseStock(ri.productId, ri.qty);

    const refund = {
      id: `refund-${Date.now()}`,
      at: formatNow(),
      by: actor(),
      items: refundItems,
      amount,
      reason,
    };

    store.set((bs) =>
      bs.map((b) => {
        if (b.number !== number) return b;
        const updatedItems = b.items.map((item) => {
          const line = refundItems.find((r) => r.productId === item.productId);
          return line ? { ...item, refundedQty: (item.refundedQty ?? 0) + line.qty } : item;
        });
        const fullyRefunded = updatedItems.every((i) => remainingQty(i) === 0);
        return {
          ...b,
          items: updatedItems,
          refunds: [...(b.refunds ?? []), refund],
          status: fullyRefunded ? "Refunded" : "Partially Refunded",
        };
      }),
    );
    logAudit(actor(), "update", `Bill / ${number} refunded ${amount.toFixed(2)}`);
    return { ok: true };
  },

  // Marks a Credit sale's outstanding balance as collected. Available to any
  // user — recording a customer's payment is routine, not a correction.
  settleCredit(number: string): { ok: true } | { error: string } {
    const bill = store.get().find((b) => b.number === number);
    if (!bill) return { error: "Bill not found" };
    if (bill.paymentStatus !== "Pending") return { error: "This bill has no pending payment" };
    store.set((bs) =>
      bs.map((b) =>
        b.number === number
          ? { ...b, paymentStatus: "Paid", settledBy: actor(), settledAt: formatNow() }
          : b,
      ),
    );
    logAudit(actor(), "update", `Bill / ${number} payment settled`);
    return { ok: true };
  },

  // Silent — just remembers which template a bill was last printed with.
  recordPrint(number: string, templateId: string) {
    store.set((bs) =>
      bs.map((b) => (b.number === number ? { ...b, printTemplateId: templateId } : b)),
    );
  },
};

export function useBills() {
  return usePersistedStore(store);
}
