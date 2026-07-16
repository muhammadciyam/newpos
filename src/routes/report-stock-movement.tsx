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
import { usePurchaseInvoices } from "@/lib/purchase-invoices-store";
import { useAuditLogs, useAuditLogPolling } from "@/lib/audit-log-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { toIsoDate, todayIso, daysAgoIso } from "@/lib/report-utils";
import { ReportPageShell, StatCard, downloadSearchSchema } from "@/components/report-page-shell";
import { ReportDateRangeControl, type ReportRange } from "@/components/report-date-range";

export const Route = createFileRoute("/report-stock-movement")({
  head: () => ({ meta: [{ title: "Stock Movement Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: StockMovementPage,
});

// This app has no dedicated stock-movement ledger, so movements are reconstructed from
// the three places stock actually changes: approved Purchase Invoices (in), bill sales
// and their refunds (out / in), and Stock Count adjustments (logged to the audit trail
// with a parseable "+N"/"-N" delta — see productsStore.setStockCount).
const stockCountPattern = /^Stock Count \/ (.+) ([+-]\d+) \((.+)\)$/;

type Movement = {
  isoDate: string;
  when: string;
  type: "Purchase In" | "Sale Out" | "Refund In" | "Stock Count";
  product: string;
  qty: number;
  note: string;
};

function StockMovementPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const invoices = usePurchaseInvoices();
  const auditLogs = useAuditLogs();
  useAuditLogPolling();
  const [range, setRange] = useState<ReportRange>({ from: daysAgoIso(30), to: todayIso() });

  const movements = useMemo(() => {
    const rows: Movement[] = [];

    for (const inv of invoices) {
      if (inv.status !== "Approved" || !inv.reviewedAt) continue;
      const isoDate = toIsoDate(inv.reviewedAt) ?? "";
      for (const item of inv.items) {
        rows.push({
          isoDate,
          when: inv.reviewedAt,
          type: "Purchase In",
          product: item.productName,
          qty: item.qty,
          note: `PI ${inv.number} — ${inv.supplierName || "Unknown supplier"}`,
        });
      }
    }

    for (const b of bills) {
      if (b.status === "Void") continue;
      const isoDate = toIsoDate(b.created) ?? "";
      for (const item of b.items) {
        const soldQty = item.qty - (item.refundedQty ?? 0);
        if (soldQty > 0) {
          rows.push({
            isoDate,
            when: b.created,
            type: "Sale Out",
            product: item.name,
            qty: -soldQty,
            note: `Bill ${b.number}`,
          });
        }
      }
      for (const r of b.refunds ?? []) {
        const refundIso = toIsoDate(r.at) ?? isoDate;
        for (const item of r.items) {
          rows.push({
            isoDate: refundIso,
            when: r.at,
            type: "Refund In",
            product: item.name,
            qty: item.qty,
            note: `Bill ${b.number} refund`,
          });
        }
      }
    }

    for (const entry of auditLogs) {
      const m = stockCountPattern.exec(entry.object);
      if (!m) continue;
      rows.push({
        isoDate: entry.at.slice(0, 10),
        when: entry.at,
        type: "Stock Count",
        product: m[1],
        qty: parseInt(m[2], 10),
        note: `${m[3]} — by ${entry.user}`,
      });
    }

    return rows
      .filter((r) => r.isoDate >= range.from && r.isoDate <= range.to)
      .sort((a, b) => (a.isoDate < b.isoDate ? 1 : a.isoDate > b.isoDate ? -1 : 0));
  }, [bills, invoices, auditLogs, range]);

  if (!canView) return <RestrictedPage />;

  const totalIn = movements.filter((m) => m.qty > 0).reduce((s, m) => s + m.qty, 0);
  const totalOut = movements.filter((m) => m.qty < 0).reduce((s, m) => s + -m.qty, 0);

  const typeColor: Record<Movement["type"], string> = {
    "Purchase In": "bg-emerald-100 text-emerald-700",
    "Sale Out": "bg-sky-100 text-sky-700",
    "Refund In": "bg-violet-100 text-violet-700",
    "Stock Count": "bg-amber-100 text-amber-700",
  };

  return (
    <ReportPageShell
      title="Stock Movement Report"
      description="Stock in/out movement history for the selected period, reconstructed from purchases, sales, refunds, and stock counts."
      download={download}
      extraHeader={<ReportDateRangeControl value={range} onChange={setRange} />}
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Movements" value={String(movements.length)} />
        <StatCard label="Units In" value={`+${totalIn}`} />
        <StatCard label="Units Out" value={`-${totalOut}`} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No stock movements yet.
                </TableCell>
              </TableRow>
            )}
            {movements.slice(0, 200).map((m, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-muted-foreground">{m.when}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={typeColor[m.type]}>
                    {m.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{m.product}</TableCell>
                <TableCell className={m.qty > 0 ? "text-emerald-600" : "text-destructive"}>
                  {m.qty > 0 ? `+${m.qty}` : m.qty}
                </TableCell>
                <TableCell className="text-muted-foreground">{m.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
