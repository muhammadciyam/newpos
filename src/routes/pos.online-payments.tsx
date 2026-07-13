import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlidersHorizontal, Landmark } from "lucide-react";
import { toast } from "sonner";
import { onlinePayments } from "@/lib/pos-data";

export const Route = createFileRoute("/pos/online-payments")({
  head: () => ({
    meta: [{ title: "Online Payments — Dhipos" }],
  }),
  component: OnlinePaymentsPage,
});

function OnlinePaymentsPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Online Payments</h1>
            <p className="text-sm text-muted-foreground">Details of all your received online payments</p>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Number" className="w-40" />
            <Button variant="outline" size="icon" onClick={() => toast("Filter online payments")}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {onlinePayments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No online payments received yet.
                  </TableCell>
                </TableRow>
              )}
              {onlinePayments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium text-foreground">Bank Transfer</p>
                    <p className="text-xs text-muted-foreground">Uploaded for Bill {p.billNumber}</p>
                    <p className="text-xs text-muted-foreground">{p.reference}</p>
                  </TableCell>
                  <TableCell className="font-medium">{p.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => toast(`Viewing receipt for ${p.reference}`)}
                      className="flex h-10 w-10 items-center justify-center rounded border border-border bg-muted hover:bg-accent"
                    >
                      <Landmark className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link to="/pos/bill-history" className="text-primary hover:underline">
                      {p.billNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {p.created}
                    <span className="block text-xs text-muted-foreground">By {p.by}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppShell>
  );
}
