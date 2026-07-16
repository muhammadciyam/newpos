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

export const Route = createFileRoute("/report-sales-void")({
  head: () => ({ meta: [{ title: "Sales Void Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: SalesVoidPage,
});

function SalesVoidPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const voided = useMemo(
    () =>
      bills.filter((b) => {
        if (b.status !== "Void") return false;
        const d = toIsoDate(b.voidedAt ?? b.created);
        return d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );

  if (!canView) return <RestrictedPage />;

  const currency = settings.general.currency;
  const totalVoided = voided.reduce((s, b) => s + b.total, 0);

  return (
    <ReportPageShell
      title="Sales Void Report"
      description="Reports of voided invoices in the selected period."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Voided Bills" value={String(voided.length)} />
        <StatCard label="Voided Amount" value={`${currency} ${totalVoided.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Voided By</TableHead>
              <TableHead>Voided At</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {voided.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No voided bills.
                </TableCell>
              </TableRow>
            )}
            {voided.map((b) => (
              <TableRow key={b.number}>
                <TableCell className="font-medium">{b.number}</TableCell>
                <TableCell>{b.customer || "Walk-in Customer"}</TableCell>
                <TableCell>
                  {currency} {b.total.toFixed(2)}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.voidedBy ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{b.voidedAt ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{b.voidReason || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
