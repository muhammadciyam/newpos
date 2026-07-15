import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer } from "lucide-react";
import { type Bill, type Customer } from "@/lib/pos-data";

export function CustomerSalesDialog({
  customer,
  bills,
  onPrint,
}: {
  customer: Customer;
  bills: Bill[];
  onPrint: (number: string) => void;
}) {
  const total = bills.filter((b) => b.status !== "Void").reduce((s, b) => s + b.total, 0);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Sales — {customer.name}</DialogTitle>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bill Number</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
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
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onPrint(b.number)}
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {bills.length} bill{bills.length === 1 ? "" : "s"} total
        </p>
        <p className="text-base font-semibold text-foreground">Total: {total.toFixed(2)}</p>
      </DialogFooter>
    </DialogContent>
  );
}
