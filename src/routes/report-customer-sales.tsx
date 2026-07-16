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

export const Route = createFileRoute("/report-customer-sales")({
  head: () => ({ meta: [{ title: "Customer Sales Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: CustomerSalesPage,
});

function CustomerSalesPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const nonVoid = useMemo(
    () =>
      bills.filter((b) => {
        const d = toIsoDate(b.created);
        return b.status !== "Void" && d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  const byCustomer = new Map<string, { name: string; bills: number; total: number }>();
  for (const b of nonVoid) {
    const name = b.customer.trim() || "Walk-in Customer";
    const existing = byCustomer.get(name) ?? { name, bills: 0, total: 0 };
    existing.bills += 1;
    existing.total += b.total;
    byCustomer.set(name, existing);
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const totalRevenue = rows.reduce((s, r) => s + r.total, 0);

  return (
    <ReportPageShell
      title="Customer Sales Report"
      description="Sales totals grouped by customer for the selected period."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Customers" value={String(rows.length)} />
        <StatCard label="Bills" value={String(nonVoid.length)} />
        <StatCard label="Revenue" value={`${currency} ${totalRevenue.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Bills</TableHead>
              <TableHead>Total Spent</TableHead>
              <TableHead>Avg. Bill</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No sales yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.bills}</TableCell>
                <TableCell>
                  {currency} {r.total.toFixed(2)}
                </TableCell>
                <TableCell>
                  {currency} {(r.total / r.bills).toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
