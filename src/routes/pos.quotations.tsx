import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Minus, Inbox, Search, X, FileText, Check, Ban, RotateCcw, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { useQuotations, quotationsStore, type Quotation } from "@/lib/quotations-store";
import { useCustomers, customersStore } from "@/lib/customers-store";
import { useProducts } from "@/lib/products-store";
import { useOutlets } from "@/lib/outlets-store";
import { useCurrentUser } from "@/lib/auth-store";
import { useRegister } from "@/lib/register-store";
import { useSettings } from "@/lib/settings-store";
import type { Product, BillLineItem } from "@/lib/pos-data";

export const Route = createFileRoute("/pos/quotations")({
  head: () => ({
    meta: [{ title: "Quotations - Dhipos" }],
  }),
  component: QuotationsPage,
});

type DraftItem = BillLineItem;

const STATUS_STYLES: Record<Quotation["status"], string> = {
  Pending: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  Accepted: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Declined: "bg-red-100 text-red-700 hover:bg-red-100",
  Converted: "bg-blue-100 text-blue-700 hover:bg-blue-100",
};

function linePrice(i: DraftItem) {
  return i.price;
}

function QuotationsPage() {
  const navigate = useNavigate();
  const quotations = useQuotations();
  const currentUser = useCurrentUser();
  const isSuperAdmin = currentUser?.role === "Super Admin";
  const outlets = useOutlets();
  const allProducts = useProducts();
  const allCustomers = useCustomers();
  const settings = useSettings();
  const register = useRegister();

  const [builderOpen, setBuilderOpen] = useState(false);
  const [outletId, setOutletId] = useState<string | null>(currentUser?.outletId ?? null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerFocused, setCustomerFocused] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerTaxNumber, setNewCustomerTaxNumber] = useState("");
  const [newCustomerLimit, setNewCustomerLimit] = useState("0");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [note, setNote] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [saving, setSaving] = useState(false);

  const [detailsFor, setDetailsFor] = useState<Quotation | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const effectiveOutletId = isSuperAdmin ? outletId : (currentUser?.outletId ?? null);
  const effectiveOutlet = outlets.find((o) => o.id === effectiveOutletId) ?? null;

  const productsForOutlet = useMemo(
    () => (isSuperAdmin ? allProducts.filter((p) => p.outletId === effectiveOutletId) : allProducts),
    [allProducts, isSuperAdmin, effectiveOutletId],
  );
  const customersForOutlet = useMemo(
    () => (isSuperAdmin ? allCustomers.filter((c) => c.outletId === effectiveOutletId) : allCustomers),
    [allCustomers, isSuperAdmin, effectiveOutletId],
  );
  const selectedCustomer = customersForOutlet.find((c) => c.id === customerId) ?? null;

  const filteredProducts = useMemo(
    () =>
      productsForOutlet.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.barcode ?? "").includes(query) ||
          (p.sku ?? "").toLowerCase().includes(query.toLowerCase()),
      ),
    [productsForOutlet, query],
  );
  const showSuggestions = searchFocused && query.trim().length > 0 && filteredProducts.length > 0;

  const filteredCustomers = useMemo(
    () =>
      customersForOutlet.filter(
        (c) =>
          c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
          c.mobile.includes(customerQuery),
      ),
    [customersForOutlet, customerQuery],
  );
  const showCustomerSuggestions =
    customerFocused && customerQuery.trim().length > 0 && filteredCustomers.length > 0;

  const subtotal = draftItems.reduce((s, i) => s + linePrice(i) * i.qty, 0);
  const gstableSubtotal = draftItems.reduce(
    (s, i) => s + (i.gstApplicable !== false ? linePrice(i) * i.qty : 0),
    0,
  );
  const gst = gstableSubtotal * (settings.tax.gstPercent / 100);
  const rawDiscount =
    discountValue && (parseFloat(discountValue) || 0) > 0
      ? discountType === "percent"
        ? subtotal * ((parseFloat(discountValue) || 0) / 100)
        : parseFloat(discountValue) || 0
      : 0;
  const discount = Math.min(rawDiscount, subtotal + gst);
  const total = subtotal - discount + gst;

  function resetBuilder() {
    setOutletId(currentUser?.outletId ?? null);
    setCustomerId(null);
    setCustomerQuery("");
    setQuery("");
    setDraftItems([]);
    setNote("");
    setDiscountType("percent");
    setDiscountValue("");
  }

  function openBuilder() {
    resetBuilder();
    setBuilderOpen(true);
  }

  function addProduct(p: Product) {
    setDraftItems((items) =>
      items.some((i) => i.productId === p.id)
        ? items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...items, { productId: p.id, name: p.name, price: p.price, qty: 1, gstApplicable: p.gstApplicable }],
    );
    setQuery("");
  }

  function setQty(productId: string, qty: number) {
    setDraftItems((items) =>
      qty <= 0
        ? items.filter((i) => i.productId !== productId)
        : items.map((i) => (i.productId === productId ? { ...i, qty } : i)),
    );
  }

  function setPrice(productId: string, price: number) {
    if (Number.isNaN(price) || price < 0) return;
    setDraftItems((items) => items.map((i) => (i.productId === productId ? { ...i, price } : i)));
  }

  function selectCustomer(id: string, name: string) {
    setCustomerId(id);
    setCustomerQuery(name);
    setCustomerFocused(false);
  }

  function openNewCustomer() {
    setNewCustomerName(customerQuery.trim());
    setNewCustomerMobile("");
    setNewCustomerEmail("");
    setNewCustomerAddress("");
    setNewCustomerTaxNumber("");
    setNewCustomerLimit(String(settings.customer.defaultCreditLimit));
    setNewCustomerOpen(true);
  }

  async function createNewCustomer() {
    if (!newCustomerName.trim()) return;
    if (settings.customer.requireMobileOnCreate && !newCustomerMobile.trim()) {
      toast.error("Mobile number is required (Settings > Customer).");
      return;
    }
    const created = await customersStore.create({
      name: newCustomerName.trim(),
      mobile: newCustomerMobile.trim(),
      email: newCustomerEmail.trim(),
      address: newCustomerAddress.trim(),
      taxNumber: newCustomerTaxNumber.trim(),
      limit: parseFloat(newCustomerLimit) || 0,
    });
    if ("error" in created) {
      toast.error(created.error);
      return;
    }
    selectCustomer(created.id, created.name);
    toast.success(`Customer "${created.name}" created`);
    setNewCustomerName("");
    setNewCustomerMobile("");
    setNewCustomerEmail("");
    setNewCustomerAddress("");
    setNewCustomerTaxNumber("");
    setNewCustomerLimit("0");
    setNewCustomerOpen(false);
  }

  async function saveQuotation() {
    if (!effectiveOutletId) return toast.error("Select a location");
    if (draftItems.length === 0) return toast.error("Add at least one item");
    setSaving(true);
    const result = await quotationsStore.create({
      outletId: effectiveOutletId,
      location: effectiveOutlet?.name ?? "",
      customerId,
      customer: selectedCustomer?.name ?? customerQuery.trim(),
      items: draftItems,
      subtotal,
      discount,
      gst,
      total,
      note: note.trim() || undefined,
    });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Quotation ${result.number} created`);
    setBuilderOpen(false);
  }

  async function setStatus(number: string, status: Quotation["status"]) {
    setStatusUpdating(true);
    const result = await quotationsStore.updateStatus(number, status);
    setStatusUpdating(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setDetailsFor((prev) => (prev && prev.number === number ? { ...prev, status } : prev));
    toast.success(`Quotation ${number} marked ${status}`);
  }

  function convertToSale(number: string) {
    if (!register.register) {
      toast.error("Open a register on the Sell page before converting a quotation to a sale");
      return;
    }
    const result = quotationsStore.convertToSale(number);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    if (result.skipped.length > 0) {
      toast.warning(`Skipped no-longer-available item(s): ${result.skipped.join(", ")}`);
    }
    toast.success(`Quotation ${number} loaded into a new sale`);
    setDetailsFor(null);
    void navigate({ to: "/pos/sell" });
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
            <p className="text-sm text-muted-foreground">Quotations given by outlets</p>
          </div>
          <Button onClick={openBuilder} className="gap-1.5">
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                      <Inbox className="h-10 w-10" />
                      <p>No data</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((q) => (
                  <TableRow key={q.number}>
                    <TableCell className="font-medium">{q.number}</TableCell>
                    <TableCell>{q.location}</TableCell>
                    <TableCell>{q.customer || "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[q.status]}>{q.status}</Badge>
                    </TableCell>
                    <TableCell>{q.total.toFixed(2)}</TableCell>
                    <TableCell>{q.created}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setDetailsFor(q)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create Quotation — a compact version of the Sell page's cart builder */}
      <Dialog
        open={builderOpen}
        onOpenChange={(v) => {
          setBuilderOpen(v);
          if (!v) resetBuilder();
        }}
      >
        <DialogContent className="flex h-[85vh] max-w-4xl flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" /> Create Quotation
            </DialogTitle>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    <span className="text-destructive">*</span> Location
                  </Label>
                  {isSuperAdmin ? (
                    <Select value={outletId ?? undefined} onValueChange={setOutletId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                      <SelectContent>
                        {outlets.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={effectiveOutlet?.name ?? "No outlet assigned"} disabled />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Customer</Label>
                  <div className="relative">
                    <Input
                      value={selectedCustomer ? selectedCustomer.name : customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value);
                        if (customerId) setCustomerId(null);
                      }}
                      onFocus={() => setCustomerFocused(true)}
                      onBlur={() => setTimeout(() => setCustomerFocused(false), 150)}
                      placeholder="Search or enter customer name"
                      className="pr-8"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={openNewCustomer}
                      title="New Customer"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {showCustomerSuggestions && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => selectCustomer(c.id, c.name)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                          >
                            <span className="font-medium text-foreground">{c.name}</span>
                            <span className="text-muted-foreground">{c.mobile}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder={
                    effectiveOutletId ? "Enter product name, SKU, or barcode..." : "Select a location first"
                  }
                  disabled={!effectiveOutletId}
                  className="pl-8"
                />
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => addProduct(p)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="font-medium text-foreground">{p.name}</span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span>{p.stock} in stock</span>
                          <span className="font-semibold text-primary">{p.price.toFixed(2)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="flex flex-col items-center gap-1 py-8 text-muted-foreground">
                            <ShoppingCart className="h-6 w-6" />
                            <p className="text-sm">No items added yet</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      draftItems.map((i) => (
                        <TableRow key={i.productId}>
                          <TableCell className="font-medium text-foreground">{i.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-6 w-6"
                                onClick={() => setQty(i.productId, i.qty - 1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-6 text-center">{i.qty}</span>
                              <Button
                                type="button"
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
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 w-20"
                              value={i.price}
                              onChange={(e) => setPrice(i.productId, parseFloat(e.target.value))}
                            />
                          </TableCell>
                          <TableCell>{(linePrice(i) * i.qty).toFixed(2)}</TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setQty(i.productId, 0)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex h-fit flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note for this quotation"
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Discount</Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "percent" | "amount")}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">%</SelectItem>
                      <SelectItem value="amount">{settings.general.currency}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Sub Total</span>
                  <span>{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>{discount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {subtotal > 0 ? `${settings.tax.gstLabel} @ ${settings.tax.gstPercent}%` : "Tax"}
                  </span>
                  <span>{gst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-bold text-foreground">
                  <span>Total</span>
                  <span>{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || !effectiveOutletId || draftItems.length === 0}
              onClick={saveQuotation}
            >
              {saving ? "Saving..." : "Save Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Name
              </Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {settings.customer.requireMobileOnCreate && (
                  <span className="text-destructive">*</span>
                )}{" "}
                Mobile
              </Label>
              <Input
                value={newCustomerMobile}
                onChange={(e) => setNewCustomerMobile(e.target.value)}
                placeholder="Mobile number"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="Email address"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Credit Limit</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={newCustomerLimit}
                onChange={(e) => setNewCustomerLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Textarea
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                placeholder="Address"
                rows={2}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>GST / Tax Number</Label>
              <Input
                value={newCustomerTaxNumber}
                onChange={(e) => setNewCustomerTaxNumber(e.target.value)}
                placeholder="Customer GST / Tax number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!newCustomerName.trim()} onClick={createNewCustomer}>
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quotation Details */}
      <Dialog open={!!detailsFor} onOpenChange={(v) => !v && setDetailsFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {detailsFor && (() => {
            const detailsCustomer = allCustomers.find((c) => c.id === detailsFor.customerId) ?? null;
            return (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Quotation {detailsFor.number}
                  <Badge className={STATUS_STYLES[detailsFor.status]}>{detailsFor.status}</Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{detailsFor.location || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium text-foreground">{detailsFor.customer || "Walk-in"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mobile</p>
                  <p className="font-medium text-foreground">{detailsCustomer?.mobile || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">GST / Tax No.</p>
                  <p className="font-medium text-foreground">{detailsCustomer?.taxNumber || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium text-foreground">{detailsFor.created}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">By</p>
                  <p className="font-medium text-foreground">{detailsFor.by}</p>
                </div>
              </div>

              {detailsFor.note && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Note</p>
                  <p className="mt-1 text-foreground">{detailsFor.note}</p>
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead>Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailsFor.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No items
                        </TableCell>
                      </TableRow>
                    ) : (
                      detailsFor.items.map((i) => (
                        <TableRow key={i.productId}>
                          <TableCell className="font-medium text-foreground">{i.name}</TableCell>
                          <TableCell>{i.qty}</TableCell>
                          <TableCell>{i.price.toFixed(2)}</TableCell>
                          <TableCell>{(i.price * i.qty).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">
                        Sub Total
                      </TableCell>
                      <TableCell className="font-semibold">{detailsFor.subtotal.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">
                        Discount
                      </TableCell>
                      <TableCell className="font-semibold">{detailsFor.discount.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-semibold">
                        {settings.tax.gstLabel}
                      </TableCell>
                      <TableCell className="font-semibold">{detailsFor.gst.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-base font-bold">
                        Grand Total
                      </TableCell>
                      <TableCell className="text-base font-bold">{detailsFor.total.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="outline" onClick={() => setDetailsFor(null)}>
                  Close
                </Button>
                <div className="flex flex-wrap gap-2">
                  {detailsFor.status === "Pending" && (
                    <>
                      <Button
                        variant="outline"
                        className="gap-1.5 text-destructive"
                        disabled={statusUpdating}
                        onClick={() => setStatus(detailsFor.number, "Declined")}
                      >
                        <Ban className="h-4 w-4" /> Decline
                      </Button>
                      <Button
                        className="gap-1.5"
                        disabled={statusUpdating}
                        onClick={() => setStatus(detailsFor.number, "Accepted")}
                      >
                        <Check className="h-4 w-4" /> Accept
                      </Button>
                    </>
                  )}
                  {detailsFor.status === "Declined" && (
                    <Button
                      variant="outline"
                      className="gap-1.5"
                      disabled={statusUpdating}
                      onClick={() => setStatus(detailsFor.number, "Pending")}
                    >
                      <RotateCcw className="h-4 w-4" /> Reopen
                    </Button>
                  )}
                  {detailsFor.status === "Accepted" && (
                    <Button className="gap-1.5" onClick={() => convertToSale(detailsFor.number)}>
                      <ShoppingCart className="h-4 w-4" /> Convert to Sale
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
