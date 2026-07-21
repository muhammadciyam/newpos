import { useState } from "react";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { billsStore } from "@/lib/bills-store";
import { type Bill, type Customer } from "@/lib/pos-data";

export function CustomerSalesDialog({ customer, bills }: { customer: Customer; bills: Bill[] }) {
  const total = bills.filter((b) => b.status !== "Void").reduce((s, b) => s + b.total, 0);
  const pendingBills = bills.filter((b) => b.paymentStatus === "Pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settling, setSettling] = useState(false);

  function toggle(number: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(number);
      else next.delete(number);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(pendingBills.map((b) => b.number)) : new Set());
  }

  async function settleSelected() {
    if (selected.size === 0) return;
    setSettling(true);
    let succeeded = 0;
    let failed = 0;
    for (const number of selected) {
      const result = await billsStore.settleCredit(number);
      if ("error" in result) failed++;
      else succeeded++;
    }
    setSettling(false);
    setSelected(new Set());
    if (succeeded > 0) {
      toast.success(`${succeeded} bill${succeeded === 1 ? "" : "s"} marked as paid`);
    }
    if (failed > 0) {
      toast.error(`${failed} bill${failed === 1 ? "" : "s"} couldn't be marked as paid`);
    }
  }

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Sales — {customer.name}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {pendingBills.length > 0 && (
                  <Checkbox
                    checked={
                      selected.size > 0 && selected.size === pendingBills.length
                        ? true
                        : selected.size > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(v) => toggleAll(v === true)}
                    aria-label="Select all pending payments"
                  />
                )}
              </TableHead>
              <TableHead>Bill Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No sales for this customer yet.
                </TableCell>
              </TableRow>
            )}
            {bills.map((b) => (
              <TableRow key={b.number}>
                <TableCell>
                  {b.paymentStatus === "Pending" && (
                    <Checkbox
                      checked={selected.has(b.number)}
                      onCheckedChange={(v) => toggle(b.number, v === true)}
                      aria-label={`Select bill ${b.number}`}
                    />
                  )}
                </TableCell>
                <TableCell className="font-medium">{b.number}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      b.status === "Sale"
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : "bg-muted text-muted-foreground hover:bg-muted"
                    }
                  >
                    {b.status}
                  </Badge>
                  {b.paymentStatus === "Pending" && (
                    <Badge className="ml-1 bg-amber-100 text-amber-700 hover:bg-amber-100">
                      Payment Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{b.total.toFixed(2)}</TableCell>
                <TableCell>{b.created}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {bills.length} bill{bills.length === 1 ? "" : "s"} total
        </p>
        <div className="flex items-center gap-3">
          <p className="text-base font-semibold text-foreground">Total: {total.toFixed(2)}</p>
          {pendingBills.length > 0 && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={selected.size === 0 || settling}
              onClick={settleSelected}
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
              {settling
                ? "Marking as paid..."
                : `Payment${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
