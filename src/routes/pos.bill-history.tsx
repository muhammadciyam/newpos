import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useBills } from "@/lib/bills-store";

export const Route = createFileRoute("/pos/bill-history")({
  head: () => ({
    meta: [{ title: "Bill History — Dhipos" }],
  }),
  component: BillHistoryPage,
});

function BillHistoryPage() {
  const bills = useBills();

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills</h1>
            <p className="text-sm text-muted-foreground">Sales for Outlets</p>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Bill Number" className="w-40" />
            <Button variant="outline" size="icon" onClick={() => toast("Filter bills")}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No bills yet. Ring up a sale on the Sell page to see it here.
                  </TableCell>
                </TableRow>
              )}
              {bills.map((b) => (
                <TableRow key={b.number}>
                  <TableCell className="font-medium">{b.number}</TableCell>
                  <TableCell>{b.customer || "—"}</TableCell>
                  <TableCell>
                    {b.location}
                    <span className="block text-xs text-muted-foreground">{b.register}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{b.status}</Badge>
                  </TableCell>
                  <TableCell>{b.total.toFixed(2)}</TableCell>
                  <TableCell>
                    {b.created}
                    <span className="block text-xs text-muted-foreground">By {b.by}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => toast(`Bill ${b.number} — ${b.total.toFixed(2)}, ${b.status}`)}>
                        Details
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toast(`More actions for bill ${b.number}`)}>
                        …
                      </Button>
                    </div>
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
