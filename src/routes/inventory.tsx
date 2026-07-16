import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Database } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import {
  usePurchaseInvoices,
  purchaseInvoicesStore,
  invoiceTotals,
  type PurchaseInvoiceItem,
  type PurchaseInvoice,
} from "@/lib/purchase-invoices-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory - Dhipos" }] }),
  component: InventoryPage,
});

const statusColor: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  Received: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  Approved: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Rejected: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

function InventoryPage() {
  const canAccess = useHasPermission("inventory.access");
  const canApprove = useHasPermission("inventory.approve");
  const invoices = usePurchaseInvoices();
  const products = useProducts();
  useProductsPolling();

  const [open, setOpen] = useState(false);
  const [supplierName, setSupplierName] = useState("");
  const [supplierGstNumber, setSupplierGstNumber] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<PurchaseInvoiceItem[]>([]);
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [costPrice, setCostPrice] = useState("");
  const [lineGstApplicable, setLineGstApplicable] = useState(true);
  const [gstMode, setGstMode] = useState<"percent" | "amount">("percent");
  const [gstPercent, setGstPercent] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);

  if (!canAccess) return <RestrictedPage />;

  const detailsInvoice = invoices.find((i) => i.id === detailsId) ?? null;
  const filteredInvoices = invoices.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.supplierName.toLowerCase().includes(q) ||
      inv.number.toLowerCase().includes(q) ||
      inv.supplierPhone.toLowerCase().includes(q) ||
      inv.supplierAddress.toLowerCase().includes(q)
    );
  });

  function addLine() {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const quantity = parseInt(qty, 10) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (quantity <= 0 || cost < 0) return;
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === product.id);
      if (existing) {
        return ls.map((l) =>
          l.productId === product.id
            ? { ...l, qty: l.qty + quantity, costPrice: cost, gstApplicable: lineGstApplicable }
            : l,
        );
      }
      return [
        ...ls,
        {
          productId: product.id,
          productName: product.name,
          qty: quantity,
          costPrice: cost,
          gstApplicable: lineGstApplicable,
        },
      ];
    });
    setProductId("");
    setQty("1");
    setCostPrice("");
    setLineGstApplicable(true);
  }

  function removeLine(id: string) {
    setLines((ls) => ls.filter((l) => l.productId !== id));
  }

  function selectProduct(id: string) {
    setProductId(id);
    const product = products.find((p) => p.id === id);
    setCostPrice(product?.cost != null ? String(product.cost) : "");
    // GST is set on the product itself (Products > edit > GST switch) — a purchase invoice
    // line always follows that, never an independent choice made here.
    setLineGstApplicable(product?.gstApplicable ?? true);
  }

  const draftTotals = invoiceTotals({
    items: lines,
    gstPercent: parseFloat(gstPercent) || 0,
    gstAmountOverride: gstMode === "amount" ? parseFloat(gstAmount) || 0 : null,
  });

  function submit() {
    if (!lines.length || !supplierName.trim()) return;
    const invoice = purchaseInvoicesStore.create({
      supplierName: supplierName.trim(),
      supplierGstNumber: supplierGstNumber.trim(),
      supplierPhone: supplierPhone.trim(),
      supplierAddress: supplierAddress.trim(),
      items: lines,
      gstPercent: parseFloat(gstPercent) || 0,
      gstAmountOverride: gstMode === "amount" ? parseFloat(gstAmount) || 0 : null,
    });
    toast.success(`Purchase Invoice ${invoice.number} submitted for review`);
    setLines([]);
    setSupplierName("");
    setSupplierGstNumber("");
    setSupplierPhone("");
    setSupplierAddress("");
    setGstMode("percent");
    setGstPercent("");
    setGstAmount("");
    setOpen(false);
  }

  function markReceived(id: string, number: string) {
    purchaseInvoicesStore.markReceived(id);
    toast.success(`Purchase Invoice ${number} marked as received`);
  }

  async function approve(id: string, number: string) {
    await purchaseInvoicesStore.approve(id);
    toast.success(`Purchase Invoice ${number} approved — stock updated`);
  }

  function reject(id: string, number: string) {
    purchaseInvoicesStore.reject(id);
    toast(`Purchase Invoice ${number} rejected`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
            <p className="text-sm text-muted-foreground">
              Add stock through Purchase Invoices: submit → mark received → an admin approves before
              quantities update.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, bill number, phone, or address..."
              className="w-72"
            />
            <Button onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Purchase Invoice
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                      <Database className="h-10 w-10" />
                      <p>No purchase invoices yet.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {invoices.length > 0 && filteredInvoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No purchase invoices match your search.
                  </TableCell>
                </TableRow>
              )}
              {filteredInvoices.map((inv) => {
                const totals = invoiceTotals(inv);
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">
                      {inv.number}
                      <span className="block text-xs text-muted-foreground">
                        By {inv.createdBy}
                      </span>
                    </TableCell>
                    <TableCell>
                      {inv.supplierName || <span className="text-muted-foreground">—</span>}
                      {inv.supplierPhone && (
                        <span className="block text-xs text-muted-foreground">
                          {inv.supplierPhone}
                        </span>
                      )}
                      {inv.supplierGstNumber && (
                        <span className="block text-xs text-muted-foreground">
                          GST No. {inv.supplierGstNumber}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p>
                        {inv.items.reduce((s, i) => s + i.qty, 0)} units, {inv.items.length} product
                        {inv.items.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {inv.items.map((i) => `${i.productName} x${i.qty}`).join(", ")}
                      </p>
                    </TableCell>
                    <TableCell className="font-semibold">{totals.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={statusColor[inv.status]} variant="outline">
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDetailsId(inv.id)}>
                          Details
                        </Button>
                        {inv.status === "Pending" && (
                          <Button size="sm" onClick={() => markReceived(inv.id, inv.number)}>
                            Mark Received
                          </Button>
                        )}
                        {inv.status === "Received" && canApprove && (
                          <Button size="sm" onClick={() => approve(inv.id, inv.number)}>
                            Approve
                          </Button>
                        )}
                        {(inv.status === "Pending" || inv.status === "Received") && canApprove && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => reject(inv.id, inv.number)}
                          >
                            Reject
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Supplier / Company Name
                </Label>
                <Input
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="e.g. Maldives Trading Co."
                />
              </div>
              <div className="space-y-1.5">
                <Label>GST / TIN Number (if any)</Label>
                <Input
                  value={supplierGstNumber}
                  onChange={(e) => setSupplierGstNumber(e.target.value)}
                  placeholder="e.g. 1234567-GST"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input
                  value={supplierPhone}
                  onChange={(e) => setSupplierPhone(e.target.value)}
                  placeholder="e.g. 7712345"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                  placeholder="e.g. Male', Maldives"
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_70px_90px_auto_auto] items-end gap-2">
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Product</label>
                <Select value={productId} onValueChange={selectProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Qty</label>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm text-foreground">Cost/unit</label>
                <Input
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <label
                className="flex items-center gap-1.5 whitespace-nowrap pb-2 text-sm text-muted-foreground"
                title="Set on the product itself (Products > edit > GST) — not editable here."
              >
                <Checkbox checked={lineGstApplicable} disabled />
                GST
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={addLine}
                disabled={!productId || !costPrice}
              >
                Add
              </Button>
            </div>

            {lines.length > 0 && (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Cost/unit</TableHead>
                      <TableHead>GST</TableHead>
                      <TableHead>Line Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.productId}>
                        <TableCell>{l.productName}</TableCell>
                        <TableCell>{l.qty}</TableCell>
                        <TableCell>{l.costPrice.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              l.gstApplicable
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {l.gstApplicable ? "Yes" : "Exempt"}
                          </Badge>
                        </TableCell>
                        <TableCell>{(l.qty * l.costPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeLine(l.productId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setGstMode("percent")}
                    className={`rounded px-2 py-1 text-xs font-medium ${gstMode === "percent" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    GST %
                  </button>
                  <button
                    type="button"
                    onClick={() => setGstMode("amount")}
                    className={`rounded px-2 py-1 text-xs font-medium ${gstMode === "amount" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    GST Amount
                  </button>
                </div>
                {gstMode === "percent" ? (
                  <Input
                    value={gstPercent}
                    onChange={(e) => setGstPercent(e.target.value)}
                    placeholder="e.g. 8"
                    className="w-20"
                  />
                ) : (
                  <Input
                    value={gstAmount}
                    onChange={(e) => setGstAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-24"
                  />
                )}
              </div>
              <div className="space-y-0.5 text-right text-sm">
                <p className="text-muted-foreground">
                  Subtotal:{" "}
                  <span className="font-medium text-foreground">
                    {draftTotals.subtotal.toFixed(2)}
                  </span>
                </p>
                <p className="text-muted-foreground">
                  GST Amount:{" "}
                  <span className="font-medium text-foreground">
                    {draftTotals.gstAmount.toFixed(2)}
                  </span>
                </p>
                <p className="font-semibold text-foreground">
                  Total: {draftTotals.total.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!lines.length || !supplierName.trim()} onClick={submit}>
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailsInvoice} onOpenChange={(v) => !v && setDetailsId(null)}>
        {detailsInvoice && <InvoiceDetails invoice={detailsInvoice} />}
      </Dialog>
    </AppShell>
  );
}

function InvoiceDetails({ invoice }: { invoice: PurchaseInvoice }) {
  const totals = invoiceTotals(invoice);
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Purchase Invoice {invoice.number}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 text-sm">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Supplier / Company</p>
            <p className="font-medium text-foreground">{invoice.supplierName || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">GST / TIN Number</p>
            <p className="font-medium text-foreground">{invoice.supplierGstNumber || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Phone Number</p>
            <p className="font-medium text-foreground">{invoice.supplierPhone || "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Address</p>
            <p className="font-medium text-foreground">{invoice.supplierAddress || "—"}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Cost/unit</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((i) => (
                <TableRow key={i.productId}>
                  <TableCell>{i.productName}</TableCell>
                  <TableCell>{i.qty}</TableCell>
                  <TableCell>{i.costPrice.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        i.gstApplicable
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {i.gstApplicable ? "Yes" : "Exempt"}
                    </Badge>
                  </TableCell>
                  <TableCell>{(i.qty * i.costPrice).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="space-y-0.5 text-right text-sm">
          <p className="text-muted-foreground">
            Subtotal:{" "}
            <span className="font-medium text-foreground">{totals.subtotal.toFixed(2)}</span>
          </p>
          <p className="text-muted-foreground">
            GST {invoice.gstAmountOverride != null ? "(fixed amount)" : `(${invoice.gstPercent}%)`}:{" "}
            <span className="font-medium text-foreground">{totals.gstAmount.toFixed(2)}</span>
          </p>
          <p className="text-base font-bold text-foreground">Total: {totals.total.toFixed(2)}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Made By</p>
            <p className="font-medium text-foreground">{invoice.createdBy}</p>
            <p className="text-xs text-muted-foreground">{invoice.createdAt}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Received By</p>
            <p className="font-medium text-foreground">{invoice.receivedBy ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{invoice.receivedAt ?? ""}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Reviewed By</p>
            <p className="font-medium text-foreground">{invoice.reviewedBy ?? "—"}</p>
            <p className="text-xs text-muted-foreground">{invoice.reviewedAt ?? ""}</p>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}
