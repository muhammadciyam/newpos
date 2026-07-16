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
import { ReportPageShell, StatCard, downloadSearchSchema } from "@/components/report-page-shell";
import { ReportDateRangeControl, type ReportRange } from "@/components/report-date-range";

export const Route = createFileRoute("/report-product-sales")({
  head: () => ({ meta: [{ title: "Product Sales Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: ProductSalesPage,
});

function ProductSalesPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const rangeBills = useMemo(
    () =>
      bills.filter((b) => {
        const d = toIsoDate(b.created);
        return b.status !== "Void" && d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const bill of rangeBills) {
    for (const item of bill.items) {
      const existing = byProduct.get(item.productId) ?? {
        name: item.name,
        qty: 0,
        revenue: 0,
      };
      const soldQty = item.qty - (item.refundedQty ?? 0);
      existing.qty += soldQty;
      existing.revenue += soldQty * item.price;
      byProduct.set(item.productId, existing);
    }
  }
  const rows = [...byProduct.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <ReportPageShell
      title="Product Sales Report"
      description="Sales summary by product for the selected period."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Products Sold" value={String(rows.length)} />
        <StatCard label="Units Sold" value={String(totalQty)} />
        <StatCard label="Revenue" value={`${currency} ${totalRevenue.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Units Sold</TableHead>
              <TableHead>Revenue</TableHead>
              <TableHead>% of Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No sales in this period.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.productId}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.qty}</TableCell>
                <TableCell>
                  {currency} {r.revenue.toFixed(2)}
                </TableCell>
                <TableCell>
                  {totalRevenue > 0 ? `${((r.revenue / totalRevenue) * 100).toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
