import { useRef, useState } from "react";
import { DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CircleDollarSign, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";
import { billsStore } from "@/lib/bills-store";
import { onlinePaymentsStore } from "@/lib/online-payments-store";
import { useCurrentUser } from "@/lib/auth-store";
import { type Bill, type Customer } from "@/lib/pos-data";

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer"] as const;

// Sum of what's actually still owed on a bill — `total` stays the original sale amount even
// after one or more partial payments (see CreditPayment), so this is what a payment's amount
// is actually validated/capped against.
function remainingOf(b: Bill): number {
  const paid = (b.payments ?? []).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, b.total - paid);
}

// Same sequence-number parsing bills-api.ts uses server-side for ordering — used here only
// to decide which selected bill a payment gets applied to first (oldest debt first), not as
// an authoritative sort anywhere else.
function billSeq(number: string): number {
  const seq = parseInt(number.split("/")[1] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}

// Applies `amount` to `bills` oldest-first, fully paying off each in turn until it runs out —
// the last bill it reaches may only get a partial share. Bills beyond that get nothing.
function allocate(amount: number, bills: Bill[]): Map<string, number> {
  let left = amount;
  const result = new Map<string, number>();
  for (const b of bills) {
    const pay = Math.min(remainingOf(b), Math.max(0, left));
    if (pay > 0.005) result.set(b.number, pay);
    left -= pay;
  }
  return result;
}

export function CustomerSalesDialog({ customer, bills }: { customer: Customer; bills: Bill[] }) {
  const currentUser = useCurrentUser();
  const total = bills.filter((b) => b.status !== "Void").reduce((s, b) => s + b.total, 0);
  const pendingBills = bills.filter((b) => b.paymentStatus === "Pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"select" | "pay">("select");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("Cash");
  const [amountInput, setAmountInput] = useState("");
  const [slipNumber, setSlipNumber] = useState("");
  const [transferSlip, setTransferSlip] = useState("");
  const [settling, setSettling] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  function readSlip(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTransferSlip(reader.result as string);
    reader.readAsDataURL(file);
  }

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

  const selectedBills = bills
    .filter((b) => selected.has(b.number))
    .sort((a, b) => billSeq(a.number) - billSeq(b.number));
  const selectedRemaining = selectedBills.reduce((s, b) => s + remainingOf(b), 0);

  function openPaymentStep() {
    if (selected.size === 0) return;
    setAmountInput(selectedRemaining.toFixed(2));
    setMethod("Cash");
    setSlipNumber("");
    setTransferSlip("");
    setStep("pay");
  }

  const amount = parseFloat(amountInput) || 0;
  const allocation = allocate(amount, selectedBills);
  const needsSlip = method === "Card" || method === "Bank Transfer";

  async function confirmPayment() {
    if (amount <= 0 || (needsSlip && !slipNumber.trim())) return;
    setSettling(true);
    let succeeded = 0;
    let failed = 0;
    for (const [number, amt] of allocation) {
      const result = await billsStore.settleCredit(
        number,
        amt,
        method,
        needsSlip ? slipNumber.trim() : undefined,
        method === "Bank Transfer" ? transferSlip || undefined : undefined,
      );
      if ("error" in result) {
        failed++;
      } else {
        succeeded++;
        if (method === "Bank Transfer") {
          onlinePaymentsStore.create({
            billNumber: number,
            amount: amt,
            reference: slipNumber.trim(),
            receiptSlip: transferSlip,
            by: currentUser?.name ?? "Unknown",
          });
        }
      }
    }
    setSettling(false);
    setSelected(new Set());
    setStep("select");
    setSlipNumber("");
    setTransferSlip("");
    if (succeeded > 0) {
      toast.success(
        `Payment of ${amount.toFixed(2)} recorded for ${succeeded} bill${succeeded === 1 ? "" : "s"}`,
      );
    }
    if (failed > 0) {
      toast.error(`${failed} payment${failed === 1 ? "" : "s"} couldn't be recorded`);
    }
  }

  if (step === "pay") {
    return (
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment — {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill Number</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedBills.map((b) => (
                  <TableRow key={b.number}>
                    <TableCell className="font-medium">{b.number}</TableCell>
                    <TableCell>{remainingOf(b).toFixed(2)}</TableCell>
                    <TableCell
                      className={
                        (allocation.get(b.number) ?? 0) > 0
                          ? "font-medium text-emerald-600"
                          : "text-muted-foreground"
                      }
                    >
                      {(allocation.get(b.number) ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-1.5">
            <Label>Payment Method</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as (typeof PAYMENT_METHODS)[number]);
                setSlipNumber("");
                setTransferSlip("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              min={0.01}
              max={selectedRemaining}
              step={0.01}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Total due for selected bills: {selectedRemaining.toFixed(2)}. Enter less than that for
              a partial payment.
            </p>
          </div>
          {method === "Bank Transfer" && (
            <div className="space-y-1.5">
              <Label>Transfer Slip</Label>
              <div className="flex items-center gap-3">
                {transferSlip ? (
                  <img
                    src={transferSlip}
                    alt="Transfer slip"
                    className="h-14 w-20 rounded border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-20 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                    No slip
                  </div>
                )}
                <input
                  ref={slipInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => readSlip(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => slipInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> {transferSlip ? "Replace" : "Upload"}
                </Button>
              </div>
            </div>
          )}
          {needsSlip && (
            <div className="space-y-1.5">
              <Label>Slip Number / Transfer ID</Label>
              <Input
                value={slipNumber}
                onChange={(e) => setSlipNumber(e.target.value)}
                placeholder="e.g. 000123 or TXN-9F2C"
              />
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" className="gap-1.5" onClick={() => setStep("select")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button
            disabled={amount <= 0 || (needsSlip && !slipNumber.trim()) || settling}
            onClick={confirmPayment}
          >
            {settling ? "Recording..." : `Confirm Payment (${amount.toFixed(2)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    );
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
                <TableCell>
                  {b.total.toFixed(2)}
                  {b.payments && b.payments.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {remainingOf(b).toFixed(2)} due
                    </span>
                  )}
                </TableCell>
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
          {selected.size > 0 && (
            <p className="text-sm text-muted-foreground">
              Selected ({selected.size}):{" "}
              <span className="font-semibold text-foreground">{selectedRemaining.toFixed(2)}</span>
            </p>
          )}
          <p className="text-base font-semibold text-foreground">Total: {total.toFixed(2)}</p>
          {pendingBills.length > 0 && (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={selected.size === 0}
              onClick={openPaymentStep}
            >
              <CircleDollarSign className="h-3.5 w-3.5" />
              {`Payment${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
          )}
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
