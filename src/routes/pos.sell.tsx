import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import {
  Plus,
  Search,
  UserPlus,
  StickyNote,
  Globe,
  Smile,
  PackageX,
  Tag,
  Minus,
  Store,
  Upload,
  X,
} from "lucide-react";
import { categories, type Product, type Bill } from "@/lib/pos-data";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { billsStore } from "@/lib/bills-store";
import { onlinePaymentsStore } from "@/lib/online-payments-store";
import { useCustomers, customersStore } from "@/lib/customers-store";
import { useRegister } from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";
import { useSettings, settingsStore } from "@/lib/settings-store";
import { pendingSaleStore } from "@/lib/pending-sale-store";
import { PrintBillDialog } from "@/components/print-bill-dialog";
import {
  type CartLine,
  type SaleTab,
  emptySaleTab,
  saleTabsStore,
  useSaleTabs,
} from "@/lib/sale-tabs-store";

export const Route = createFileRoute("/pos/sell")({
  head: () => ({
    meta: [
      { title: "Sell - Dhipos" },
      { name: "description", content: "Ring up sales and check out with Dhipos." },
    ],
  }),
  component: SellPage,
});

function linePrice(i: CartLine) {
  return i.priceOverride ?? i.product.price;
}

function SellPage() {
  const products = useProducts();
  useProductsPolling();
  const customers = useCustomers();
  const register = useRegister();
  const currentUser = useCurrentUser();
  const settings = useSettings();
  const saleTabsState = useSaleTabs();
  const tabs = saleTabsState.tabs;
  const activeTab = saleTabsState.activeTab;
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerFocused, setCustomerFocused] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [savedBill, setSavedBill] = useState<Bill | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const slipInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pendingSaleStore.set(tabs.some((t) => t.items.length > 0));
  }, [tabs]);

  useEffect(() => () => pendingSaleStore.set(false), []);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (tabs.some((t) => t.items.length > 0)) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [tabs]);

  const tab = tabs.find((t) => t.id === activeTab)!;
  const selectedCustomer = customers.find((c) => c.id === tab.customerId) ?? null;

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "all" || p.category === category) &&
          (p.name.toLowerCase().includes(query.toLowerCase()) || (p.barcode ?? "").includes(query)),
      ),
    [products, category, query],
  );
  const showSuggestions = searchFocused && query.trim().length > 0 && filtered.length > 0;

  const filteredCustomers = useMemo(
    () =>
      customers.filter(
        (c) =>
          c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
          c.mobile.includes(customerQuery),
      ),
    [customers, customerQuery],
  );
  const showCustomerSuggestions =
    customerFocused && customerQuery.trim().length > 0 && filteredCustomers.length > 0;

  const subtotal = tab.items.reduce((s, i) => s + linePrice(i) * i.qty, 0);
  const discount = 0;
  const gst = subtotal * (settings.tax.gstPercent / 100);
  const total = subtotal - discount + gst;
  const cashReceived = parseFloat(tab.cashReceived || "0") || 0;
  const pending = tab.payMethod === "Cash" ? Math.max(0, total - cashReceived) : 0;
  const balance = tab.payMethod === "Cash" ? Math.max(0, cashReceived - total) : 0;
  const outOfStock = tab.items.find((i) => {
    const live = products.find((p) => p.id === i.product.id);
    return (live?.stock ?? i.product.stock) < i.qty;
  });

  function updateTab(patch: Partial<SaleTab>) {
    saleTabsStore.set((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === activeTab ? { ...t, ...patch } : t)),
    }));
  }

  function addProduct(p: Product) {
    updateTab({
      items: tab.items.some((i) => i.product.id === p.id)
        ? tab.items.map((i) => (i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i))
        : [...tab.items, { product: p, qty: 1 }],
    });
    setQuery("");
  }

  function setQty(id: string, qty: number) {
    updateTab({
      items:
        qty <= 0
          ? tab.items.filter((i) => i.product.id !== id)
          : tab.items.map((i) => (i.product.id === id ? { ...i, qty } : i)),
    });
  }

  function newTab() {
    saleTabsStore.newTab();
  }

  function discardBill() {
    updateTab({
      items: [],
      cashReceived: "0.00",
      customerId: null,
      payMethod: "Cash",
      transferSlip: "",
      recipientNumber: "",
      cardSlipNumber: "",
    });
    setCustomerQuery("");
  }

  function selectCustomer(id: string, name: string) {
    updateTab({ customerId: id });
    setCustomerQuery(name);
    setCustomerFocused(false);
  }

  function readSlip(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateTab({ transferSlip: reader.result as string });
    reader.readAsDataURL(file);
  }

  function createCustomer() {
    if (!newCustomerName.trim()) return;
    const customer = customersStore.create({
      name: newCustomerName.trim(),
      mobile: newCustomerMobile.trim(),
      limit: 0,
    });
    selectCustomer(customer.id, customer.name);
    setNewCustomerName("");
    setNewCustomerMobile("");
    setNewCustomerOpen(false);
    toast.success(`Customer "${customer.name}" added`);
  }

  async function saveBill() {
    const payMethod = tab.payMethod;
    if (!register.register) return toast.error("Open a register before selling");
    if (!tab.items.length) return toast.error("Cart is empty");
    if (outOfStock && !settings.sales.allowSellWithoutStock) return toast.error("Not enough stock");
    if (payMethod === "Cash" && cashReceived < total)
      return toast.error("Enter the full cash amount given");
    if (payMethod === "Bank Transfer" && !tab.transferSlip)
      return toast.error("Upload the transfer slip");
    if (payMethod === "Bank Transfer" && !tab.recipientNumber.trim())
      return toast.error("Enter the recipient number");
    if (payMethod === "Card" && !tab.cardSlipNumber.trim())
      return toast.error("Enter the slip number or transfer ID");
    if (payMethod === "Credit" && !tab.customerId)
      return toast.error("Select a customer for a credit sale");
    // Stock is decremented atomically on the server as part of creating the bill (see
    // createBillOnServer in bills-api.ts) — no separate client-side stock call needed.
    const bill = await billsStore.create({
      customer: selectedCustomer?.name ?? "",
      customerId: tab.customerId,
      location: register.storeName,
      register: register.register,
      items: tab.items.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        price: linePrice(i),
        qty: i.qty,
      })),
      subtotal,
      discount,
      gst,
      total,
      by: currentUser?.name ?? "Unknown",
      paymentMethod: payMethod as Bill["paymentMethod"],
      paymentStatus: payMethod === "Credit" ? "Pending" : "Paid",
      cashGiven: payMethod === "Cash" ? cashReceived : undefined,
      changeGiven: payMethod === "Cash" ? balance : undefined,
      transferSlip: payMethod === "Bank Transfer" ? tab.transferSlip : undefined,
      recipientNumber: payMethod === "Bank Transfer" ? tab.recipientNumber : undefined,
      cardSlipNumber: payMethod === "Card" ? tab.cardSlipNumber : undefined,
    });
    if ("error" in bill) {
      toast.error(bill.error);
      return;
    }
    if (payMethod === "Bank Transfer") {
      onlinePaymentsStore.create({
        billNumber: bill.number,
        amount: total,
        reference: tab.recipientNumber,
        receiptSlip: tab.transferSlip,
        by: currentUser?.name ?? "Unknown",
      });
    }
    toast.success(
      payMethod === "Credit"
        ? `Bill ${bill.number} saved for ${total.toFixed(2)} on credit`
        : `Bill ${bill.number} saved for ${total.toFixed(2)} via ${payMethod}`,
    );
    setSavedBill(bill);
    setPrintOpen(true);
  }

  if (!register.register) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Store className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">No Open Register</p>
            <p className="text-sm text-muted-foreground">
              Open a register before you can start selling.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/pos/register">Open Register</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col">
        <div className="flex items-center gap-6 overflow-x-auto border-b border-border bg-background px-4">
          {tabs.map((t) => {
            const tSubtotal = t.items.reduce((s, i) => s + linePrice(i) * i.qty, 0);
            const tTotal = tSubtotal * (1 + settings.tax.gstPercent / 100);
            return (
              <button
                key={t.id}
                onClick={() => saleTabsStore.set((s) => ({ ...s, activeTab: t.id }))}
                className={`flex flex-col items-start gap-0.5 border-b-2 py-3 text-sm ${
                  activeTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground"
                }`}
              >
                <span>Total</span>
                <span className="font-semibold">{tTotal.toFixed(2)}</span>
              </button>
            );
          })}
          <button
            onClick={newTab}
            className="flex items-center gap-1 py-3 text-sm font-semibold text-foreground"
          >
            <Plus className="h-4 w-4" /> New Sale (F2)
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_420px] md:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Enter product name, brand or barcode (...)"
                  className="pl-8"
                />
                {showSuggestions && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                    {filtered.map((p) => (
                      <button
                        key={p.id}
                        onMouseDown={() => addProduct(p)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-2">
                          <img src={p.image} alt="" className="h-8 w-8 rounded object-cover" />
                          <span className="font-medium text-foreground">{p.name}</span>
                        </span>
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span>{p.stock} in stock</span>
                          <span className="font-semibold text-primary">${p.price.toFixed(2)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={discardBill}>
                Discard Bill (F4)
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tab.items.map((i) => {
                    const liveStock =
                      products.find((p) => p.id === i.product.id)?.stock ?? i.product.stock;
                    return (
                      <TableRow key={i.product.id}>
                        <TableCell>
                          <p className="font-medium text-foreground">{i.product.name}</p>
                          {liveStock < i.qty && (
                            <p className="mt-1 inline-block rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                              Not enough stock
                            </p>
                          )}
                        </TableCell>
                        <TableCell
                          className={
                            liveStock < i.qty ? "text-destructive" : "text-muted-foreground"
                          }
                        >
                          {liveStock}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => setQty(i.product.id, i.qty - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center">{i.qty}</span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => setQty(i.product.id, i.qty + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {settings.sales.salesPriceEditable ? (
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 w-20"
                              value={linePrice(i)}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (Number.isNaN(value)) return;
                                if (
                                  value < (i.product.cost ?? 0) &&
                                  !settings.sales.allowSellBelowCost
                                ) {
                                  toast.error("Selling below cost is not allowed");
                                  return;
                                }
                                updateTab({
                                  items: tab.items.map((line) =>
                                    line.product.id === i.product.id
                                      ? { ...line, priceOverride: value }
                                      : line,
                                  ),
                                });
                              }}
                            />
                          ) : (
                            linePrice(i).toFixed(2)
                          )}
                        </TableCell>
                        <TableCell>{(linePrice(i) * i.qty).toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      Sub Total
                    </TableCell>
                    <TableCell className="font-semibold">{subtotal.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      Discount
                    </TableCell>
                    <TableCell className="font-semibold">{discount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      {subtotal > 0 ? `GST @ ${settings.tax.gstPercent}%` : "Total Taxes"}
                    </TableCell>
                    <TableCell className="font-semibold">{gst.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={3} className="text-right text-base font-bold">
                      Total
                    </TableCell>
                    <TableCell className="text-base font-bold">{total.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-4">
                <IconAction
                  icon={StickyNote}
                  label="Note"
                  onClick={() => toast("Add a note to this bill")}
                />
                <IconAction
                  icon={Globe}
                  label="Currency"
                  onClick={() => toast("Currency switcher coming soon")}
                />
                <IconAction
                  icon={Smile}
                  label="FOC"
                  onClick={() => toast.success("Marked as Free of Charge")}
                />
                <IconAction
                  icon={PackageX}
                  label="No Delivery"
                  onClick={() => toast.success("Delivery disabled for this bill")}
                />
                <IconAction icon={Tag} label="Tags" onClick={() => toast("Tag this bill")} />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={settings.printing.autoPrintOnSave}
                  onCheckedChange={(v) =>
                    settingsStore.updateSection("printing", { autoPrintOnSave: !!v })
                  }
                />
                Automatically print bill on save
              </label>
              <div className="mt-4 text-sm font-semibold text-foreground">Keyboard Shortcuts</div>
              <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                <div className="flex gap-3">
                  <span className="w-8 font-mono text-foreground">F2</span> New sale window
                </div>
                <div className="flex gap-3">
                  <span className="w-8 font-mono text-foreground">F4</span> Dismiss Bill
                </div>
                <div className="flex gap-3">
                  <span className="w-8 font-mono text-foreground">ESC</span> Focus Product Search
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-fit flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:sticky lg:top-20">
            <Button
              variant="outline"
              className="ml-auto gap-1.5"
              onClick={() => setNewCustomerOpen(true)}
            >
              <UserPlus className="h-4 w-4" /> New Customer
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={selectedCustomer ? selectedCustomer.name : customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  if (tab.customerId) updateTab({ customerId: null });
                }}
                onFocus={() => setCustomerFocused(true)}
                onBlur={() => setTimeout(() => setCustomerFocused(false), 150)}
                placeholder="Enter customer mobile or name (Alt+C)"
                className="pl-8 pr-8"
              />
              {selectedCustomer && (
                <button
                  type="button"
                  onMouseDown={() => {
                    updateTab({ customerId: null });
                    setCustomerQuery("");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {showCustomerSuggestions && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
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
            <p
              className={`text-xs ${
                tab.payMethod === "Credit" && !tab.customerId
                  ? "font-medium text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              A customer is required for a credit sale.
            </p>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">Payment Method</span>
              <Select value={tab.payMethod} onValueChange={(v) => updateTab({ payMethod: v })}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tab.payMethod === "Credit" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Credit sale — nothing collected now.</p>
                <p className="mt-1 text-xs">
                  {selectedCustomer
                    ? `This bill will be billed to ${selectedCustomer.name} and show as Payment Pending in Bill History until settled.`
                    : "Select a customer above before saving."}
                </p>
              </div>
            )}

            {tab.payMethod === "Cash" && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Cash Given</p>
                    <p className="text-xs text-muted-foreground">(Alt+R)</p>
                  </div>
                  <Input
                    value={tab.cashReceived}
                    onChange={(e) => updateTab({ cashReceived: e.target.value })}
                    className="w-28 text-right"
                  />
                </div>

                <div className="flex items-center justify-between px-1">
                  <div>
                    <p className="text-xs uppercase text-muted-foreground">Payment Pending</p>
                    <p className="text-2xl font-bold text-foreground">{pending.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase text-muted-foreground">Change Due</p>
                    <p className="text-2xl font-bold text-emerald-600">{balance.toFixed(2)}</p>
                  </div>
                </div>
              </>
            )}

            {tab.payMethod === "Bank Transfer" && (
              <>
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Label>Transfer Slip</Label>
                  <div className="flex items-center gap-3">
                    {tab.transferSlip ? (
                      <img
                        src={tab.transferSlip}
                        alt="Transfer slip"
                        className="h-14 w-20 rounded border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-20 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                        No slip
                      </div>
                    )}
                    <input
                      ref={slipInput}
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
                      onClick={() => slipInput.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" /> {tab.transferSlip ? "Replace" : "Upload"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 rounded-lg border border-border p-3">
                  <Label>Recipient Number</Label>
                  <Input
                    value={tab.recipientNumber}
                    onChange={(e) => updateTab({ recipientNumber: e.target.value })}
                    placeholder="Account or mobile number"
                  />
                </div>
              </>
            )}

            {tab.payMethod === "Card" && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Label>Slip Number / Transfer ID</Label>
                <Input
                  value={tab.cardSlipNumber}
                  onChange={(e) => updateTab({ cardSlipNumber: e.target.value })}
                  placeholder="e.g. 000123 or TXN-9F2C"
                />
              </div>
            )}

            {outOfStock && (
              <p className="rounded-md bg-destructive/10 py-2 text-center text-sm font-medium text-destructive">
                Not enough stock
              </p>
            )}

            <Button
              size="lg"
              onClick={saveBill}
              disabled={!tab.items.length || (tab.payMethod === "Credit" && !tab.customerId)}
            >
              Save Bill (Alt+S)
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input
                value={newCustomerMobile}
                onChange={(e) => setNewCustomerMobile(e.target.value)}
                placeholder="Mobile number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!newCustomerName.trim()} onClick={createCustomer}>
              Add Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintBillDialog
        bill={savedBill}
        open={printOpen}
        onOpenChange={(v) => {
          setPrintOpen(v);
          if (!v) {
            discardBill();
            setSavedBill(null);
          }
        }}
        autoPrint={settings.printing.autoPrintOnSave}
      />
    </AppShell>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
