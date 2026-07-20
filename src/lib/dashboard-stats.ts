import { useMemo } from "react";
import { useBills } from "@/lib/bills-store";
import { toIsoDate, dateToIso, isoToDate, daysAgoIso, todayIso } from "@/lib/report-utils";
import type { ReportRange } from "@/components/report-date-range";
import type { Bill, SalesPoint, TopSellingProduct } from "@/lib/pos-data";

// The Home dashboard (src/routes/index.tsx) used to import dashboardStats/netSalesSeries/
// salesCountSeries/topSellingProducts as hardcoded, always-empty placeholders from
// pos-data.ts — so nothing on the Home page ever reflected a real sale. This computes all
// of it live from the same outlet-scoped useBills() every other page already uses, so
// ringing up a sale on the Sell page updates the dashboard the same way it updates Bill
// History or the reports.

export type DashboardStats = {
  todayTotalSales: number;
  todayTotalSalesChange: number;
  todayNetSales: number;
  todayNetSalesChange: number;
  todayCreditSales: number;
  yesterdayNetSales: number;
  yesterdayNetSalesChange: number;
  monthNetSales: number;
  monthNetSalesChange: number;
  customersThisMonth: number;
  customersThisMonthChange: number;
  productsSoldThisMonth: number;
  productsSoldThisMonthChange: number;
  refundsThisMonth: number;
  refundsThisMonthChange: number;
  voidsThisMonth: number;
  voidsThisMonthChange: number;
};

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

function billDateIso(b: Bill): string | null {
  return toIsoDate(b.created);
}

function inRange(iso: string | null, from: string, to: string): boolean {
  return iso !== null && iso >= from && iso <= to;
}

// Gross = every non-void bill's total; net = gross minus whatever's been refunded off
// those bills — same definition report-day-summary.tsx already uses for the same labels.
function grossAndNet(bills: Bill[], from: string, to: string) {
  const inWindow = bills.filter((b) => b.status !== "Void" && inRange(billDateIso(b), from, to));
  const gross = inWindow.reduce((s, b) => s + b.total, 0);
  const refunds = inWindow.reduce(
    (s, b) => s + (b.refunds ?? []).reduce((rs, r) => rs + r.amount, 0),
    0,
  );
  return { gross, net: gross - refunds, bills: inWindow };
}

function distinctCustomerCount(bills: Bill[]): number {
  const ids = new Set<string>();
  for (const b of bills) {
    const id = b.customerId ?? (b.customer.trim() ? `name:${b.customer.trim()}` : null);
    if (id) ids.add(id);
  }
  return ids.size;
}

function itemsSoldCount(bills: Bill[]): number {
  return bills.reduce(
    (s, b) => s + b.items.reduce((n, i) => n + Math.max(0, i.qty - (i.refundedQty ?? 0)), 0),
    0,
  );
}

// Same-day-of-month cutoff so "this month" and "last month" cover an equal number of days
// (comparing the 1st-20th of this month against the full 31 days of last month would make
// last month look artificially bigger). Clamped to the target month's actual last day —
// e.g. on the 31st, "last month" must not roll over into the following month just because
// February only has 28/29 days.
function monthToDateRange(monthsAgo: number, dayOfMonth: number): { from: string; to: string } {
  const now = new Date();
  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() - monthsAgo;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, lastDayOfTargetMonth);
  const from = dateToIso(new Date(targetYear, targetMonth, 1));
  const to = dateToIso(new Date(targetYear, targetMonth, clampedDay));
  return { from, to };
}

// Every field the "Details" view for a Top Selling Product needs — which bills (within the
// selected range) actually contributed to its sold/revenue totals.
export type ProductSaleDetail = {
  billNumber: string;
  created: string;
  qty: number;
  price: number;
  lineTotal: number;
};

export function useDashboardStats(range: ReportRange): {
  stats: DashboardStats;
  netSalesSeries: SalesPoint[];
  salesCountSeries: SalesPoint[];
  topSellingProducts: TopSellingProduct[];
  productDetails: Map<string, ProductSaleDetail[]>;
} {
  const bills = useBills();

  return useMemo(() => {
    const today = todayIso();
    const yesterday = daysAgoIso(1);
    const dayBeforeYesterday = daysAgoIso(2);
    const dayOfMonth = new Date().getDate();
    const thisMonth = monthToDateRange(0, dayOfMonth);
    const lastMonth = monthToDateRange(1, dayOfMonth);

    const todayAgg = grossAndNet(bills, today, today);
    const yesterdayAgg = grossAndNet(bills, yesterday, yesterday);
    const dayBeforeAgg = grossAndNet(bills, dayBeforeYesterday, dayBeforeYesterday);
    const thisMonthAgg = grossAndNet(bills, thisMonth.from, thisMonth.to);
    const lastMonthAgg = grossAndNet(bills, lastMonth.from, lastMonth.to);

    const todayCreditSales = bills
      .filter(
        (b) =>
          b.status !== "Void" &&
          b.paymentMethod === "Credit" &&
          inRange(billDateIso(b), today, today),
      )
      .reduce((s, b) => s + b.total, 0);

    const customersThisMonth = distinctCustomerCount(thisMonthAgg.bills);
    const customersLastMonth = distinctCustomerCount(lastMonthAgg.bills);

    const productsSoldThisMonth = itemsSoldCount(thisMonthAgg.bills);
    const productsSoldLastMonth = itemsSoldCount(lastMonthAgg.bills);

    // Refunds/voids are counted by when the refund/void itself happened, not when the
    // original bill was created — a bill rung up last month can still be refunded today.
    const refundsThisMonth = bills.reduce(
      (s, b) =>
        s +
        (b.refunds ?? []).filter((r) => inRange(toIsoDate(r.at), thisMonth.from, thisMonth.to))
          .length,
      0,
    );
    const refundsLastMonth = bills.reduce(
      (s, b) =>
        s +
        (b.refunds ?? []).filter((r) => inRange(toIsoDate(r.at), lastMonth.from, lastMonth.to))
          .length,
      0,
    );
    const voidsThisMonth = bills.filter(
      (b) =>
        b.status === "Void" && inRange(toIsoDate(b.voidedAt ?? ""), thisMonth.from, thisMonth.to),
    ).length;
    const voidsLastMonth = bills.filter(
      (b) =>
        b.status === "Void" && inRange(toIsoDate(b.voidedAt ?? ""), lastMonth.from, lastMonth.to),
    ).length;

    const stats: DashboardStats = {
      todayTotalSales: todayAgg.gross,
      todayTotalSalesChange: pctChange(todayAgg.gross, yesterdayAgg.gross),
      todayNetSales: todayAgg.net,
      todayNetSalesChange: pctChange(todayAgg.net, yesterdayAgg.net),
      todayCreditSales,
      yesterdayNetSales: yesterdayAgg.net,
      yesterdayNetSalesChange: pctChange(yesterdayAgg.net, dayBeforeAgg.net),
      monthNetSales: thisMonthAgg.net,
      monthNetSalesChange: pctChange(thisMonthAgg.net, lastMonthAgg.net),
      customersThisMonth,
      customersThisMonthChange: pctChange(customersThisMonth, customersLastMonth),
      productsSoldThisMonth,
      productsSoldThisMonthChange: pctChange(productsSoldThisMonth, productsSoldLastMonth),
      refundsThisMonth,
      refundsThisMonthChange: pctChange(refundsThisMonth, refundsLastMonth),
      voidsThisMonth,
      voidsThisMonthChange: pctChange(voidsThisMonth, voidsLastMonth),
    };

    // One point per day across the selected range, oldest first, for the two line charts —
    // driven by the date picker in the page header instead of a fixed trailing window.
    const days: { iso: string; label: string }[] = [];
    const rangeStart = isoToDate(range.from);
    const rangeEnd = isoToDate(range.to);
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      const iso = dateToIso(d);
      days.push({
        iso,
        label: d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }),
      });
    }
    const netSalesSeries: SalesPoint[] = days.map(({ iso, label }) => ({
      date: iso,
      label,
      value: grossAndNet(bills, iso, iso).net,
    }));
    const salesCountSeries: SalesPoint[] = days.map(({ iso, label }) => ({
      date: iso,
      label,
      value: bills.filter((b) => b.status !== "Void" && billDateIso(b) === iso).length,
    }));

    // Best sellers within the selected range, plus which bills made up each one's totals
    // (for the "Details" view) — a fixed all-time ranking would just ossify around whatever
    // sold first and never reflect what's actually moving in the period being looked at.
    const rangeBills = bills.filter(
      (b) => b.status !== "Void" && inRange(billDateIso(b), range.from, range.to),
    );
    const byProduct = new Map<string, TopSellingProduct>();
    const productDetails = new Map<string, ProductSaleDetail[]>();
    for (const b of rangeBills) {
      for (const item of b.items) {
        const qty = Math.max(0, item.qty - (item.refundedQty ?? 0));
        if (qty === 0) continue;
        const existing = byProduct.get(item.name);
        if (existing) {
          existing.sold += qty;
          existing.revenue += qty * item.price;
        } else {
          byProduct.set(item.name, { name: item.name, sold: qty, revenue: qty * item.price });
        }
        const detailList = productDetails.get(item.name) ?? [];
        detailList.push({
          billNumber: b.number,
          created: b.created,
          qty,
          price: item.price,
          lineTotal: qty * item.price,
        });
        productDetails.set(item.name, detailList);
      }
    }
    const topSellingProducts = [...byProduct.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    return { stats, netSalesSeries, salesCountSeries, topSellingProducts, productDetails };
  }, [bills, range.from, range.to]);
}
