import type { Bill } from "@/lib/pos-data";

// Bills store their timestamp as a formatted string ("15-Jul-26, 14:32"), same format as
// register sessions — reuses the same parse trick as closeOutSession in register-store.ts.
function parseBillTimestamp(created: string): number {
  const t = new Date(created.replace(/-(\w{3})-/, " $1 ")).getTime();
  return Number.isFinite(t) ? t : 0;
}

// Bill timestamps only have minute precision, but `sinceMs` (the register's openedAt) is
// exact — floor it to the minute too, or a sale rung up seconds after opening (same
// minute) would be wrongly excluded for being "before" the open time down to the second.
function floorToMinute(ms: number): number {
  return Math.floor(ms / 60000) * 60000;
}

export type SessionSalesStats = {
  salesAmount: number;
  cashSales: number;
  cardSales: number;
  bankSales: number;
  creditAmount: number;
  // Sales via a custom payment method configured in Settings > Payments (anything other
  // than the 4 built-ins) — kept as its own bucket so salesAmount always reconciles to
  // cashSales + cardSales + bankSales + creditAmount + otherSales.
  otherSales: number;
  billCount: number;
  cashBillCount: number;
  cardBillCount: number;
  bankBillCount: number;
  creditBillCount: number;
  otherBillCount: number;
  itemsSold: number;
  refundAmount: number;
  voidCount: number;
};

export function emptySessionSalesStats(): SessionSalesStats {
  return {
    salesAmount: 0,
    cashSales: 0,
    cardSales: 0,
    bankSales: 0,
    creditAmount: 0,
    otherSales: 0,
    billCount: 0,
    cashBillCount: 0,
    cardBillCount: 0,
    bankBillCount: 0,
    creditBillCount: 0,
    otherBillCount: 0,
    itemsSold: 0,
    refundAmount: 0,
    voidCount: 0,
  };
}

// Sums up what was rung up on `registerName` since `sinceMs` (the register's current open
// time) — voided bills don't count toward sales since nothing was actually kept, but are
// still reported (voidCount) so the closing report accounts for them.
export function computeSessionSales(
  bills: Bill[],
  registerName: string,
  sinceMs: number | null,
): SessionSalesStats {
  const stats = emptySessionSalesStats();
  if (!sinceMs) return stats;
  const flooredSince = floorToMinute(sinceMs);
  for (const bill of bills) {
    if (bill.register !== registerName) continue;
    if (parseBillTimestamp(bill.created) < flooredSince) continue;
    if (bill.status === "Void") {
      stats.voidCount += 1;
      continue;
    }
    stats.salesAmount += bill.total;
    stats.billCount += 1;
    stats.itemsSold += bill.items.reduce((n, i) => n + i.qty, 0);
    for (const r of bill.refunds ?? []) stats.refundAmount += r.amount;
    if (bill.paymentMethod === "Cash") {
      stats.cashSales += bill.total;
      stats.cashBillCount += 1;
    } else if (bill.paymentMethod === "Card") {
      stats.cardSales += bill.total;
      stats.cardBillCount += 1;
    } else if (bill.paymentMethod === "Bank Transfer") {
      stats.bankSales += bill.total;
      stats.bankBillCount += 1;
    } else if (bill.paymentMethod === "Credit") {
      stats.creditAmount += bill.total;
      stats.creditBillCount += 1;
    } else {
      stats.otherSales += bill.total;
      stats.otherBillCount += 1;
    }
  }
  return stats;
}
