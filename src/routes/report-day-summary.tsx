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
import { useRegisterSessions, useRegister, registerDisplayName } from "@/lib/register-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { toIsoDate, todayIso } from "@/lib/report-utils";
import {
  ReportPageShell,
  StatCard,
  SummaryRow,
  downloadSearchSchema,
} from "@/components/report-page-shell";
import { ReportDateRangeControl, type ReportRange } from "@/components/report-date-range";
import type { Bill } from "@/lib/pos-data";

export const Route = createFileRoute("/report-day-summary")({
  head: () => ({ meta: [{ title: "Day Summary Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: DaySummaryPage,
});

const paymentMethods: Bill["paymentMethod"][] = ["Cash", "Card", "Bank Transfer", "Credit"];

function DaySummaryPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const sessions = useRegisterSessions();
  const { registers } = useRegister();
  const settings = useSettings();
  const [range, setRange] = useState<ReportRange>(() => {
    const d = todayIso();
    return { from: d, to: d };
  });

  const dayBills = useMemo(
    () =>
      bills.filter((b) => {
        const d = toIsoDate(b.created);
        return d !== null && d >= range.from && d <= range.to;
      }),
    [bills, range],
  );
  const daySessions = useMemo(
    () =>
      sessions.filter((s) => {
        const d = toIsoDate(s.createdAt);
        return d !== null && d >= range.from && d <= range.to;
      }),
    [sessions, range],
  );

  if (!canView) return <RestrictedPage />;

  const nonVoid = dayBills.filter((b) => b.status !== "Void");
  const voided = dayBills.filter((b) => b.status === "Void");
  const grossSales = nonVoid.reduce((s, b) => s + b.total, 0);
  const refundsTotal = nonVoid.reduce(
    (s, b) => s + (b.refunds ?? []).reduce((rs, r) => rs + r.amount, 0),
    0,
  );
  const netSales = grossSales - refundsTotal;
  const gstCollected = nonVoid.reduce((s, b) => s + b.gst, 0);
  const discountGiven = nonVoid.reduce((s, b) => s + b.discount, 0);
  const focBills = nonVoid.filter((b) => b.foc);
  const pendingCredit = nonVoid.filter((b) => b.paymentStatus === "Pending");
  const pendingCreditTotal = pendingCredit.reduce((s, b) => s + b.total, 0);
  const itemsSold = nonVoid.reduce((s, b) => s + b.items.reduce((n, i) => n + i.qty, 0), 0);
  const currency = settings.general.currency;

  const byMethod = paymentMethods.map((method) => {
    const methodBills = nonVoid.filter((b) => b.paymentMethod === method);
    return {
      method,
      count: methodBills.length,
      amount: methodBills.reduce((s, b) => s + b.total, 0),
    };
  });

  return (
    <ReportPageShell
      title="Day Summary Report"
      description="Sales, payments, and register activity for the selected day(s)."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Net Sales" value={`${currency} ${netSales.toFixed(2)}`} />
        <StatCard label="Bills" value={String(nonVoid.length)} />
        <StatCard label="Items Sold" value={String(itemsSold)} />
        <StatCard label="GST Collected" value={`${currency} ${gstCollected.toFixed(2)}`} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-semibold text-foreground">Sales Breakdown</p>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 text-sm md:grid-cols-3">
          <SummaryRow label="Gross Sales" value={`${currency} ${grossSales.toFixed(2)}`} />
          <SummaryRow label="Refunds" value={`${currency} ${refundsTotal.toFixed(2)}`} />
          <SummaryRow label="Net Sales" value={`${currency} ${netSales.toFixed(2)}`} emphasize />
          <SummaryRow label="Discounts Given" value={`${currency} ${discountGiven.toFixed(2)}`} />
          <SummaryRow
            label="FOC Bills"
            value={`${focBills.length} bill${focBills.length === 1 ? "" : "s"}`}
          />
          <SummaryRow
            label="Voided Bills"
            value={`${voided.length} (${currency} ${voided.reduce((s, b) => s + b.total, 0).toFixed(2)})`}
          />
          <SummaryRow
            label="Outstanding Credit"
            value={`${pendingCredit.length} bill${pendingCredit.length === 1 ? "" : "s"}, ${currency} ${pendingCreditTotal.toFixed(2)}`}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-semibold text-foreground">Payments by Method</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Bills</TableHead>
              <TableHead>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byMethod.map((m) => (
              <TableRow key={m.method}>
                <TableCell className="font-medium">{m.method}</TableCell>
                <TableCell>{m.count}</TableCell>
                <TableCell>
                  {currency} {m.amount.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-semibold text-foreground">Register Sessions</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Register</TableHead>
              <TableHead>Opened By</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Short/Over</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daySessions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No register sessions in this period.
                </TableCell>
              </TableRow>
            )}
            {daySessions.map((s) => (
              <TableRow key={s.no}>
                <TableCell className="font-medium">
                  {registerDisplayName(registers, s.register)}
                </TableCell>
                <TableCell>{s.by}</TableCell>
                <TableCell className="text-muted-foreground">{s.createdAt}</TableCell>
                <TableCell className="text-muted-foreground">{s.closedAt ?? "—"}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={s.closedAt ? "bg-muted" : "bg-emerald-100 text-emerald-700"}
                  >
                    {s.closedAt ? "Closed" : "Open"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {s.closing ? `${currency} ${s.closing.salesAmount.toFixed(2)}` : "—"}
                </TableCell>
                <TableCell
                  className={
                    s.closing && s.closing.shortAmount !== 0
                      ? s.closing.shortAmount < 0
                        ? "text-destructive"
                        : "text-emerald-600"
                      : "text-muted-foreground"
                  }
                >
                  {s.closing ? `${currency} ${s.closing.shortAmount.toFixed(2)}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
