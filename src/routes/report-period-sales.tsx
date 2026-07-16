import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBills, useBillsPolling } from "@/lib/bills-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { toIsoDate, todayIso, daysAgoIso } from "@/lib/report-utils";
import { ReportPageShell, StatCard, SummaryRow, downloadSearchSchema } from "@/components/report-page-shell";
import { ReportDateRangeControl, type ReportRange } from "@/components/report-date-range";

export const Route = createFileRoute("/report-period-sales")({
  head: () => ({ meta: [{ title: "Period Sales Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: PeriodSalesPage,
});

function PeriodSalesPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(7), to: todayIso() });

  const rangeBills = useMemo(
    () =>
      bills.filter((b) => {
        const d = toIsoDate(b.created);
        return d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  const nonVoid = rangeBills.filter((b) => b.status !== "Void");
  const grossSales = nonVoid.reduce((s, b) => s + b.total, 0);
  const gstCollected = nonVoid.reduce((s, b) => s + b.gst, 0);
  const itemsSold = nonVoid.reduce((s, b) => s + b.items.reduce((n, i) => n + i.qty, 0), 0);

  // Group by day within the range, newest first.
  const byDay = new Map<string, { count: number; total: number }>();
  for (const b of nonVoid) {
    const d = toIsoDate(b.created);
    if (!d) continue;
    const existing = byDay.get(d) ?? { count: 0, total: 0 };
    existing.count += 1;
    existing.total += b.total;
    byDay.set(d, existing);
  }
  const dayRows = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <ReportPageShell
      title="Period Sales Report"
      description="Sales totals across a date range, broken down by day."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Gross Sales" value={`${currency} ${grossSales.toFixed(2)}`} />
        <StatCard label="Bills" value={String(nonVoid.length)} />
        <StatCard label="Items Sold" value={String(itemsSold)} />
        <StatCard label="GST Collected" value={`${currency} ${gstCollected.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-semibold text-foreground">Daily Breakdown</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bills</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dayRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No sales in this period.
                </TableCell>
              </TableRow>
            )}
            {dayRows.map(([day, r]) => (
              <TableRow key={day}>
                <TableCell className="font-medium">{day}</TableCell>
                <TableCell>{r.count}</TableCell>
                <TableCell>
                  {currency} {r.total.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-semibold text-foreground">Summary</p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-3">
          <SummaryRow label="Date Range" value={`${range.from} to ${range.to}`} />
          <SummaryRow label="Total Bills" value={String(nonVoid.length)} />
          <SummaryRow label="Gross Sales" value={`${currency} ${grossSales.toFixed(2)}`} emphasize />
        </div>
      </Card>
    </ReportPageShell>
  );
}
