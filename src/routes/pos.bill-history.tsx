import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SlidersHorizontal,
  MoreHorizontal,
  Printer,
  Pencil,
  Undo2,
  Ban,
  Plus,
  Minus,
  Trash2,
  CircleDollarSign,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useBills, useBillsPolling, billsStore } from "@/lib/bills-store";
import { useRegister, registerDisplayName } from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";
import { useHasPermission } from "@/lib/permissions";
import { useProducts } from "@/lib/products-store";
import { useCustomers } from "@/lib/customers-store";
import { type Bill, type BillLineItem } from "@/lib/pos-data";
import { useSettings } from "@/lib/settings-store";
import { PrintBillDialog } from "@/components/print-bill-dialog";
import { CustomerSalesDialog } from "@/components/customer-sales-dialog";

export const Route = createFileRoute("/pos/bill-history")({
  head: () => ({
    meta: [{ title: "Bill History — Dhipos" }],
  }),
  component: BillHistoryPage,
});

const statusColor: Record<Bill["status"], string> = {
  Sale: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Void: "bg-muted text-muted-foreground hover:bg-muted",
  Refunded: "bg-destructive/10 text-destructive hover:bg-destructive/10",
  "Partially Refunded": "bg-amber-100 text-amber-700 hover:bg-amber-100",
};

function BillHistoryPage() {
  const allBills = useBills();
  useBillsPolling();
  const { registers } = useRegister();
  const customers = useCustomers();
  const currentUser = useCurrentUser();
  const currency = useSettings().general.currency;
  const canViewAll = useHasPermission("sales.viewAll");
  const canManage = useHasPermission("sales.manage");
  const scopedBills = canViewAll ? allBills : allBills.filter((b) => b.by === currentUser?.name);

  const [numberFilter, setNumberFilter] = useState("");
  const bills = scopedBills.filter((b) =>
    b.number.toLowerCase().includes(numberFilter.trim().toLowerCase()),
  );

  const [detailsNumber, setDetailsNumber] = useState<string | null>(null);
  const [printNumber, setPrintNumber] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState<string | null>(null);
  const [refundNumber, setRefundNumber] = useState<string | null>(null);
  const [voidNumber, setVoidNumber] = useState<string | null>(null);
  const [salesCustomerId, setSalesCustomerId] = useState<string | null>(null);

  const detailsBill = scopedBills.find((b) => b.number === detailsNumber) ?? null;
  const printBill = scopedBills.find((b) => b.number === printNumber) ?? null;
  const editBill = scopedBills.find((b) => b.number === editNumber) ?? null;
  const refundBill = scopedBills.find((b) => b.number === refundNumber) ?? null;
  const voidBill = scopedBills.find((b) => b.number === voidNumber) ?? null;
  const salesCustomer = customers.find((c) => c.id === salesCustomerId) ?? null;

  const pendingBills = scopedBills.filter(
    (b) => b.paymentStatus === "Pending" && b.status === "Sale",
  );
  const pendingTotal = pendingBills.reduce((s, b) => s + b.total, 0);

  async function settlePayment(bill: Bill) {
    const result = await billsStore.settleCredit(bill.number);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Bill ${bill.number} marked as paid`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bills</h1>
            <p className="text-sm text-muted-foreground">
              {canViewAll ? "Sales for Outlets" : "Your sales"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={numberFilter}
              onChange={(e) => setNumberFilter(e.target.value)}
              placeholder="Bill Number"
              className="w-40"
            />
          </div>
        </div>

        {pendingBills.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">
                {pendingBills.length} bill{pendingBills.length === 1 ? "" : "s"}
              </span>{" "}
              awaiting payment — {currency} {pendingTotal.toFixed(2)} total on credit.
            </p>
          </div>
        )}

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
                  <TableCell>
                    {b.customerId ? (
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => setSalesCustomerId(b.customerId ?? null)}
                        title={`View all bills for ${b.customer}`}
                      >
                        {b.customer || "—"}
                      </button>
                    ) : (
                      b.customer || "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {b.location}
                    <span className="block text-xs text-muted-foreground">
                      {registerDisplayName(registers, b.register)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor[b.status]}>{b.status}</Badge>
                    {b.paymentStatus === "Pending" && (
                      <button
                        type="button"
                        onClick={() => setPrintNumber(b.number)}
                        title="Open the printable invoice"
                      >
                        <Badge className="ml-1 bg-amber-100 text-amber-700 hover:bg-amber-200">
                          Payment Pending
                        </Badge>
                      </button>
                    )}
                  </TableCell>
                  <TableCell>
                    {currency} {b.total.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {b.created}
                    <span className="block text-xs text-muted-foreground">By {b.by}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailsNumber(b.number)}
                      >
                        Details
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPrintNumber(b.number)}>
                            <Printer className="mr-2 h-4 w-4" /> Print / Reprint
                          </DropdownMenuItem>
                          {b.paymentStatus === "Pending" && (
                            <DropdownMenuItem onClick={() => settlePayment(b)}>
                              <CircleDollarSign className="mr-2 h-4 w-4" /> Mark as Paid
                            </DropdownMenuItem>
                          )}
                          {canManage && (
                            <>
                              <DropdownMenuItem
                                disabled={b.status !== "Sale"}
                                onClick={() => setEditNumber(b.number)}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={b.status === "Void" || b.status === "Refunded"}
                                onClick={() => setRefundNumber(b.number)}
                              >
                                <Undo2 className="mr-2 h-4 w-4" /> Refund
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={b.status === "Void" || b.status === "Refunded"}
                                onClick={() => setVoidNumber(b.number)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="mr-2 h-4 w-4" /> Void
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!detailsBill} onOpenChange={(v) => !v && setDetailsNumber(null)}>
        {detailsBill && (
          <BillDetails
            bill={detailsBill}
            onPrint={() => {
              setDetailsNumber(null);
              setPrintNumber(detailsBill.number);
            }}
          />
        )}
      </Dialog>

      <PrintBillDialog
        bill={printBill}
        open={!!printBill}
        onOpenChange={(v) => !v && setPrintNumber(null)}
      />

      <Dialog open={!!editBill} onOpenChange={(v) => !v && setEditNumber(null)}>
        {editBill && <EditBillDialog bill={editBill} onDone={() => setEditNumber(null)} />}
      </Dialog>

      <Dialog open={!!refundBill} onOpenChange={(v) => !v && setRefundNumber(null)}>
        {refundBill && <RefundBillDialog bill={refundBill} onDone={() => setRefundNumber(null)} />}
      </Dialog>

      <Dialog open={!!voidBill} onOpenChange={(v) => !v && setVoidNumber(null)}>
        {voidBill && <VoidBillDialog bill={voidBill} onDone={() => setVoidNumber(null)} />}
      </Dialog>

      <Dialog open={!!salesCustomer} onOpenChange={(v) => !v && setSalesCustomerId(null)}>
        {salesCustomer && (
          <CustomerSalesDialog
            customer={salesCustomer}
            bills={scopedBills.filter((b) => b.customerId === salesCustomer.id)}
            onPrint={setPrintNumber}
          />
        )}
      </Dialog>
    </AppShell>
  );
}

function BillDetails({ bill, onPrint }: { bill: Bill; onPrint: () => void }) {
  const settings = useSettings();
  const currency = settings.general.currency;
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Bill {bill.number}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Customer</p>
            <p className="font-medium text-foreground">{bill.customer || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Cashier</p>
            <p className="font-medium text-foreground">{bill.by}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Payment</p>
            <p className="font-medium text-foreground">
              {bill.paymentMethod}
              {bill.paymentStatus === "Pending" && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                  Pending
                </span>
              )}
            </p>
            {bill.settledAt && (
              <p className="text-xs text-muted-foreground">
                Settled by {bill.settledBy} on {bill.settledAt}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bill.items.map((i) => (
                <TableRow key={i.productId}>
                  <TableCell>
                    {i.name}
                    {i.refundedQty ? (
                      <span className="block text-xs text-muted-foreground">
                        Refunded: {i.refundedQty}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{i.qty}</TableCell>
                  <TableCell>
                    {currency} {i.price.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {currency} {(i.price * i.qty).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-0.5 text-right text-sm">
          <p className="text-muted-foreground">
            Subtotal:{" "}
            <span className="font-medium text-foreground">
              {currency} {bill.subtotal.toFixed(2)}
            </span>
          </p>
          <p className="text-muted-foreground">
            {settings.tax.gstLabel}:{" "}
            <span className="font-medium text-foreground">
              {currency} {bill.gst.toFixed(2)}
            </span>
          </p>
          {!!bill.bagCharge && (
            <p className="text-muted-foreground">
              Plastic Bag Charge ({bill.bagQty}):{" "}
              <span className="font-medium text-foreground">
                {currency} {bill.bagCharge.toFixed(2)}
              </span>
            </p>
          )}
          <p className="text-base font-bold text-foreground">
            Grand Total: {currency} {bill.total.toFixed(2)}
          </p>
        </div>
        {(bill.editedAt || bill.voidedAt || (bill.refunds && bill.refunds.length > 0)) && (
          <div className="space-y-2 border-t border-border pt-3 text-sm">
            {bill.editedAt && (
              <p className="text-muted-foreground">
                Edited by <span className="font-medium text-foreground">{bill.editedBy}</span> on{" "}
                {bill.editedAt}
                {bill.originalTotal != null &&
                  ` (original total ${currency} ${bill.originalTotal.toFixed(2)})`}
              </p>
            )}
            {bill.voidedAt && (
              <p className="text-muted-foreground">
                Voided by <span className="font-medium text-foreground">{bill.voidedBy}</span> on{" "}
                {bill.voidedAt}
                {bill.voidReason && ` — ${bill.voidReason}`}
              </p>
            )}
            {bill.refunds?.map((r) => (
              <p key={r.id} className="text-muted-foreground">
                Refunded{" "}
                <span className="font-medium text-foreground">
                  {currency} {r.amount.toFixed(2)}
                </span>{" "}
                by {r.by} on {r.at}
                {r.reason && ` — ${r.reason}`}
              </p>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onPrint} className="gap-1.5">
          <Printer className="h-4 w-4" /> Print / Reprint
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditBillDialog({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const products = useProducts();
  const currency = useSettings().general.currency;
  const [items, setItems] = useState<BillLineItem[]>(bill.items.map((i) => ({ ...i })));
  const [addProductId, setAddProductId] = useState("");

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setItems((its) => its.filter((i) => i.productId !== productId));
      return;
    }
    setItems((its) => its.map((i) => (i.productId === productId ? { ...i, qty } : i)));
  }

  function addLine() {
    const product = products.find((p) => p.id === addProductId);
    if (!product) return;
    setItems((its) =>
      its.some((i) => i.productId === product.id)
        ? its.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + 1 } : i))
        : [
            ...its,
            {
              productId: product.id,
              name: product.name,
              price: product.price,
              qty: 1,
            },
          ],
    );
    setAddProductId("");
  }

  async function save() {
    if (items.length === 0) {
      toast.error("A bill must have at least one item");
      return;
    }
    const result = await billsStore.update(bill.number, items);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Bill ${bill.number} updated`);
    onDone();
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit Bill {bill.number}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={addProductId} onValueChange={setAddProductId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Add a product…" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.stock} in stock)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!addProductId} onClick={addLine}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Total</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.productId}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6"
                        onClick={() => setQty(i.productId, i.qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center">{i.qty}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-6 w-6"
                        onClick={() => setQty(i.productId, i.qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {currency} {i.price.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {currency} {(i.price * i.qty).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setQty(i.productId, 0)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-right text-sm text-muted-foreground">
          Subtotal:{" "}
          <span className="font-medium text-foreground">
            {currency} {subtotal.toFixed(2)}
          </span>{" "}
          (total &amp; GST recompute on save)
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save}>Save Changes</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function RefundBillDialog({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const currency = useSettings().general.currency;
  const remaining = bill.items
    .map((i) => ({ ...i, remaining: i.qty - (i.refundedQty ?? 0) }))
    .filter((i) => i.remaining > 0);
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(remaining.map((i) => [i.productId, 0])),
  );
  const [reason, setReason] = useState("");

  const amount = remaining.reduce((s, i) => s + (qtys[i.productId] ?? 0) * i.price, 0);

  function refundFullBill() {
    setQtys(Object.fromEntries(remaining.map((i) => [i.productId, i.remaining])));
  }

  async function submit() {
    const lines = remaining
      .map((i) => ({ productId: i.productId, qty: qtys[i.productId] ?? 0 }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) {
      toast.error("Select a quantity to refund");
      return;
    }
    const result = await billsStore.refund(bill.number, lines, reason.trim() || undefined);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Refunded ${currency} ${amount.toFixed(2)} on bill ${bill.number}`);
    onDone();
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Refund Bill {bill.number}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Refund Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remaining.map((i) => (
                <TableRow key={i.productId}>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>{i.remaining}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={i.remaining}
                      className="w-20"
                      value={qtys[i.productId] ?? 0}
                      onChange={(e) => {
                        const value = Math.max(
                          0,
                          Math.min(i.remaining, parseInt(e.target.value, 10) || 0),
                        );
                        setQtys((q) => ({ ...q, [i.productId]: value }));
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button variant="outline" size="sm" onClick={refundFullBill}>
          Refund Full Bill
        </Button>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Reason (optional)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this being refunded?"
          />
        </div>
        <p className="text-right text-base font-bold text-foreground">
          Refund Amount: {currency} {amount.toFixed(2)}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={amount <= 0} onClick={submit}>
          Refund
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function VoidBillDialog({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const [reason, setReason] = useState("");

  async function submit() {
    const result = await billsStore.void(bill.number, reason.trim() || undefined);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Bill ${bill.number} voided`);
    onDone();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Void Bill {bill.number}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This restores stock for all unrefunded items and marks the bill as Void. The bill stays
          visible in history for audit purposes.
        </p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Reason (optional)</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this bill being voided?"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={submit}>
          Void Bill
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
