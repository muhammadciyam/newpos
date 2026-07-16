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

export const Route = createFileRoute("/report-foc-bills")({
  head: () => ({ meta: [{ title: "FOC Bills Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: FocBillsPage,
});

function FocBillsPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const focBills = useMemo(
    () =>
      bills.filter((b) => {
        if (!b.foc) return false;
        const d = toIsoDate(b.created);
        return d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  // What these would have been worth had they not been marked FOC (subtotal + gst).
  const totalWaived = focBills.reduce((s, b) => s + b.subtotal + b.gst, 0);
  const itemsGiven = focBills.reduce((s, b) => s + b.items.reduce((n, i) => n + i.qty, 0), 0);

  return (
    <ReportPageShell
      title="FOC Bills Report"
      description="Details of Free of Charge bills in the selected period."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="FOC Bills" value={String(focBills.length)} />
        <StatCard label="Items Given Away" value={String(itemsGiven)} />
        <StatCard label="Value Waived" value={`${currency} ${totalWaived.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Value Waived</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {focBills.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No FOC bills.
                </TableCell>
              </TableRow>
            )}
            {focBills.map((b) => (
              <TableRow key={b.number}>
                <TableCell className="font-medium">{b.number}</TableCell>
                <TableCell>{b.customer || "Walk-in Customer"}</TableCell>
                <TableCell>
                  {b.items.reduce((n, i) => n + i.qty, 0)} unit
                  {b.items.reduce((n, i) => n + i.qty, 0) === 1 ? "" : "s"}
                </TableCell>
                <TableCell>
                  {currency} {(b.subtotal + b.gst).toFixed(2)}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.by}</TableCell>
                <TableCell className="text-muted-foreground">{b.created}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
