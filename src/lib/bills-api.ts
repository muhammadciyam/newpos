import { createServerFn } from "@tanstack/react-start";
import { getServerBills, mutateServerBills, formatBillTimestamp } from "@/lib/bills-server-store";
import { adjustStock, getServerProducts } from "@/lib/products-server-store";
import { getOrCreateDefaultOutlet } from "@/lib/outlets-server-store";
import type { Bill, BillLineItem, CreditPayment } from "@/lib/pos-data";

async function stockPatchesFor(productIds: Iterable<string>) {
  const products = await getServerProducts();
  return [...productIds].map((productId) => {
    const product = products.find((p) => p.id === productId);
    return { productId, stock: product?.stock ?? 0 };
  });
}

// Mirrors canManageProduct in products-api.ts — editing/voiding/refunding/settling a bill is
// scoped to the outlet it was rung up at, same as everything else. `role`/`callerOutletId`
// are client-supplied claims — this app has no server-verified auth (see the caveat in
// session-api.ts), so this is the same trust model already used everywhere else, just
// finally applied here too instead of relying only on the client hiding the Edit/Refund/Void
// buttons.
function canManageBill(bill: Bill, role: string, callerOutletId: string | null): boolean {
  if (role === "Super Admin") return true;
  return bill.outletId !== null && bill.outletId === callerOutletId;
}

// Bills created before per-outlet inventory (or on a register with no outlet assigned)
// have no outletId — fall back to the shop's default outlet so stock still moves somewhere
// sensible instead of the adjustment silently going nowhere.
async function resolveOutletId(outletId: string | null): Promise<string> {
  if (outletId) return outletId;
  return (await getOrCreateDefaultOutlet()).id;
}

export const fetchBills = createServerFn({ method: "GET" }).handler(async () => {
  return getServerBills();
});

// Public — powers the e-bill QR code on printed receipts. Only exposes the single bill
// requested (by its unguessable-enough number), never the full bill list, since this is
// reachable without login.
export const fetchBillByNumber = createServerFn({ method: "GET" })
  .validator((data: { number: string }) => data)
  .handler(async ({ data }) => {
    const bill = (await getServerBills()).find((b) => b.number === data.number);
    if (!bill) return { error: "Bill not found" };
    return { ok: true as const, bill };
  });

export const createBillOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      customer: string;
      customerId: string | null;
      location: string;
      register: string;
      outletId: string | null;
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
    }) => data,
  )
  .handler(async ({ data }) => {
    const existing = await getServerBills();
    const maxSeq = existing.reduce((max, b) => {
      const seq = parseInt(b.number.split("/")[1] ?? "0", 10);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    const outletId = await resolveOutletId(data.outletId);
    const bill: Bill = {
      number: `1/${maxSeq + 1}`,
      customer: data.customer,
      customerId: data.customerId ?? null,
      location: data.location,
      register: data.register,
      outletId,
      status: "Sale",
      items: data.items,
      subtotal: data.subtotal,
      discount: data.discount,
      gst: data.gst,
      bagQty: data.bagQty,
      bagCharge: data.bagCharge,
      total: data.total,
      created: formatBillTimestamp(),
      by: data.by,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      cashGiven: data.cashGiven,
      changeGiven: data.changeGiven,
      transferSlip: data.transferSlip,
      recipientNumber: data.recipientNumber,
      cardSlipNumber: data.cardSlipNumber,
      customReceiptNumber: data.customReceiptNumber,
      note: data.note || undefined,
      foc: data.foc || undefined,
      noDelivery: data.noDelivery || undefined,
      tags: data.tags && data.tags.length > 0 ? data.tags : undefined,
      currency: data.currency,
      currencyRate: data.currencyRate,
      currencyTotal: data.currencyTotal,
    };
    await mutateServerBills((bs) => [bill, ...bs]);
    // Stock is decremented here, atomically with bill creation, in the same server
    // process — no separate client round trip that could partially fail.
    for (const item of data.items) await adjustStock(item.productId, -item.qty);
    const updatedStock = await stockPatchesFor(new Set(data.items.map((i) => i.productId)));
    return { ok: true as const, bill, updatedStock };
  });

export const updateBillOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      number: string;
      items: BillLineItem[];
      actor: string;
      gstPercent: number;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const bill = (await getServerBills()).find((b) => b.number === data.number);
    if (!bill) return { error: "Bill not found" };
    if (!canManageBill(bill, data.role, data.callerOutletId)) {
      return { error: "Cannot edit this bill" };
    }
    if (bill.status !== "Sale") return { error: `Cannot edit a bill that is ${bill.status}` };

    const oldByProduct = new Map(bill.items.map((i) => [i.productId, i]));
    const newByProduct = new Map(data.items.map((i) => [i.productId, i]));
    const stockDeltas = new Map<string, number>();
    for (const [productId, newItem] of newByProduct) {
      const oldQty = oldByProduct.get(productId)?.qty ?? 0;
      const delta = newItem.qty - oldQty;
      if (delta !== 0) stockDeltas.set(productId, -delta);
    }
    for (const [productId, oldItem] of oldByProduct) {
      if (!newByProduct.has(productId)) {
        stockDeltas.set(productId, (stockDeltas.get(productId) ?? 0) + oldItem.qty);
      }
    }
    for (const [productId, delta] of stockDeltas) await adjustStock(productId, delta);

    const subtotal = data.items.reduce((s, i) => s + i.price * i.qty, 0);
    // Same exemption rule as at sale time (pos.sell.tsx) — only items whose gstApplicable
    // snapshot isn't explicitly false contribute to GST.
    const gstableSubtotal = data.items.reduce(
      (s, i) => s + (i.gstApplicable !== false ? i.price * i.qty : 0),
      0,
    );
    const gst = gstableSubtotal * (data.gstPercent / 100);
    // The Plastic Bag charge isn't tied to line items, so editing them doesn't change it —
    // carry the bill's existing bagCharge forward rather than silently dropping it here.
    const total = subtotal - bill.discount + gst + (bill.bagCharge ?? 0);

    await mutateServerBills((bs) =>
      bs.map((b) =>
        b.number === data.number
          ? {
              ...b,
              items: data.items,
              subtotal,
              gst,
              total,
              editedBy: data.actor,
              editedAt: formatBillTimestamp(),
              originalTotal: b.originalTotal ?? b.total,
            }
          : b,
      ),
    );
    const updatedStock = await stockPatchesFor(stockDeltas.keys());
    return { ok: true as const, updatedStock };
  });

function remainingQty(item: BillLineItem) {
  return item.qty - (item.refundedQty ?? 0);
}

export const voidBillOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      number: string;
      reason: string | undefined;
      actor: string;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const bill = (await getServerBills()).find((b) => b.number === data.number);
    if (!bill) return { error: "Bill not found" };
    if (!canManageBill(bill, data.role, data.callerOutletId)) {
      return { error: "Cannot void this bill" };
    }
    if (bill.status !== "Sale" && bill.status !== "Partially Refunded") {
      return { error: `Bill is already ${bill.status}` };
    }
    for (const item of bill.items) {
      const qty = remainingQty(item);
      if (qty > 0) await adjustStock(item.productId, qty);
    }
    await mutateServerBills((bs) =>
      bs.map((b) =>
        b.number === data.number
          ? {
              ...b,
              status: "Void",
              voidedBy: data.actor,
              voidedAt: formatBillTimestamp(),
              voidReason: data.reason,
            }
          : b,
      ),
    );
    const updatedStock = await stockPatchesFor(bill.items.map((i) => i.productId));
    return { ok: true as const, updatedStock };
  });

export const refundBillOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      number: string;
      lines: { productId: string; qty: number }[];
      reason: string | undefined;
      actor: string;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const bill = (await getServerBills()).find((b) => b.number === data.number);
    if (!bill) return { error: "Bill not found" };
    if (!canManageBill(bill, data.role, data.callerOutletId)) {
      return { error: "Cannot refund this bill" };
    }
    if (bill.status !== "Sale" && bill.status !== "Partially Refunded") {
      return { error: `Cannot refund a bill that is ${bill.status}` };
    }

    const itemsByProduct = new Map(bill.items.map((i) => [i.productId, i]));
    for (const line of data.lines) {
      const item = itemsByProduct.get(line.productId);
      if (!item) return { error: `Item ${line.productId} not on this bill` };
      if (line.qty <= 0) continue;
      if (line.qty > remainingQty(item)) {
        return { error: `Cannot refund more than the remaining quantity of ${item.name}` };
      }
    }

    const refundItems = data.lines
      .filter((l) => l.qty > 0)
      .map((l) => {
        const item = itemsByProduct.get(l.productId)!;
        return { productId: item.productId, name: item.name, qty: l.qty, price: item.price };
      });
    if (refundItems.length === 0) return { error: "Nothing selected to refund" };

    const amount = refundItems.reduce((s, i) => s + i.price * i.qty, 0);
    for (const ri of refundItems) await adjustStock(ri.productId, ri.qty);

    const refund = {
      id: `refund-${Date.now()}`,
      at: formatBillTimestamp(),
      by: data.actor,
      items: refundItems,
      amount,
      reason: data.reason,
    };

    await mutateServerBills((bs) =>
      bs.map((b) => {
        if (b.number !== data.number) return b;
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
    const updatedStock = await stockPatchesFor(refundItems.map((i) => i.productId));
    return { ok: true as const, amount, updatedStock };
  });

export const settleCreditOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      number: string;
      actor: string;
      amount: number;
      method: string;
      slipNumber?: string;
      transferSlip?: string;
      role: string;
      callerOutletId: string | null;
    }) => data,
  )
  .handler(async ({ data }) => {
    const bill = (await getServerBills()).find((b) => b.number === data.number);
    if (!bill) return { error: "Bill not found" };
    if (!canManageBill(bill, data.role, data.callerOutletId)) {
      return { error: "Cannot record a payment for this bill" };
    }
    if (bill.paymentStatus !== "Pending") return { error: "This bill has no pending payment" };
    const alreadyPaid = (bill.payments ?? []).reduce((s, p) => s + p.amount, 0);
    const remaining = bill.total - alreadyPaid;
    if (data.amount <= 0) return { error: "Enter an amount greater than 0" };
    if (data.amount > remaining + 0.005) {
      return { error: `Amount can't exceed the remaining balance of ${remaining.toFixed(2)}` };
    }
    if ((data.method === "Card" || data.method === "Bank Transfer") && !data.slipNumber?.trim()) {
      return { error: "Enter the slip number for this payment" };
    }
    const payment: CreditPayment = {
      id: `credit-payment-${Date.now()}`,
      at: formatBillTimestamp(),
      by: data.actor,
      amount: data.amount,
      method: data.method,
      slipNumber: data.slipNumber || undefined,
      transferSlip: data.method === "Bank Transfer" ? data.transferSlip : undefined,
    };
    const fullyPaid = alreadyPaid + data.amount >= bill.total - 0.005;
    await mutateServerBills((bs) =>
      bs.map((b) =>
        b.number === data.number
          ? {
              ...b,
              payments: [...(b.payments ?? []), payment],
              ...(fullyPaid
                ? {
                    paymentStatus: "Paid" as const,
                    settledBy: data.actor,
                    settledAt: formatBillTimestamp(),
                  }
                : {}),
            }
          : b,
      ),
    );
    return { ok: true as const, remaining: remaining - data.amount };
  });

// Silent — just remembers which template a bill was last printed with.
export const recordPrintOnServer = createServerFn({ method: "POST" })
  .validator((data: { number: string; templateId: string }) => data)
  .handler(async ({ data }) => {
    await mutateServerBills((bs) =>
      bs.map((b) => (b.number === data.number ? { ...b, printTemplateId: data.templateId } : b)),
    );
    return { ok: true as const };
  });
