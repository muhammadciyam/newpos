import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/report-outstanding-bills")({
  head: () => ({ meta: [{ title: "Outstanding Bills Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: OutstandingBillsPage,
});

function OutstandingBillsPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const outstanding = useMemo(
    () =>
      bills.filter((b) => {
        const d = toIsoDate(b.created);
        return (
          b.paymentStatus === "Pending" &&
          b.status !== "Void" &&
          d !== null &&
          d >= range.from &&
          d <= range.to
        );
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  const totalOutstanding = outstanding.reduce((s, b) => s + b.total, 0);

  return (
    <ReportPageShell
      title="Outstanding Bills Report"
      description="Unsettled sales bills (Credit Sales, Layaway Bills) created in the selected period."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Outstanding Bills" value={String(outstanding.length)} />
        <StatCard label="Total Owed" value={`${currency} ${totalOutstanding.toFixed(2)}`} />
        <StatCard
          label="Avg. Owed"
          value={`${currency} ${outstanding.length ? (totalOutstanding / outstanding.length).toFixed(2) : "0.00"}`}
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Register</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outstanding.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No outstanding bills.
                </TableCell>
              </TableRow>
            )}
            {outstanding.map((b) => (
              <TableRow key={b.number}>
                <TableCell className="font-medium">{b.number}</TableCell>
                <TableCell>{b.customer || "Walk-in Customer"}</TableCell>
                <TableCell className="text-muted-foreground">{b.register}</TableCell>
                <TableCell className="text-muted-foreground">{b.created}</TableCell>
                <TableCell>
                  {currency} {b.total.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-amber-100 text-amber-700">
                    Pending
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
