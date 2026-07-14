import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Denomination = { name: string; value: number };

export function CountMoneyDialog({
  open,
  onOpenChange,
  title,
  denominations,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  denominations: Denomination[];
  onApply: (total: number) => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setQty({});
  }, [open]);

  const total = denominations.reduce(
    (sum, d) => sum + (parseInt(qty[d.name] || "0", 10) || 0) * d.value,
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Count Money — {title}</DialogTitle>
        </DialogHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Denomination</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {denominations.map((d) => {
              const count = parseInt(qty[d.name] || "0", 10) || 0;
              return (
                <TableRow key={d.name}>
                  <TableCell className="text-foreground">{d.name}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      className="w-20"
                      placeholder="0"
                      value={qty[d.name] ?? ""}
                      onChange={(e) => setQty((q) => ({ ...q, [d.name]: e.target.value }))}
                    />
                  </TableCell>
                  <TableCell className="text-right">{(count * d.value).toFixed(2)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold text-foreground">
          <span>Total</span>
          <span>{total.toFixed(2)}</span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(total);
              onOpenChange(false);
            }}
          >
            Use This Amount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
