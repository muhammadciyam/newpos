import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Percent,
} from "lucide-react";
import { type Product, type Bill } from "@/lib/pos-data";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { useCategories } from "@/lib/categories-store";
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
  const categories = useCategories();
  useProductsPolling();
  const customers = useCustomers();
  const register = useRegister();
  const currentOutletId = register.register
    ? (register.registers[register.register]?.outletId ?? null)
    : null;
  const currentUser = useCurrentUser();
  const settings = useSettings();
  // "Credit" is a sale-outcome (unsettled/AR), not a collectible payment method, so it's
  // always offered regardless of what's configured in Settings > Payments. Cash/Card/Bank
  // Transfer each have their own hardcoded collection workflow below (cash tendered, card
  // slip #, transfer slip) tied to their stable `key`, which is what's actually stored on
  // the Bill — so whether one is offered, and its display label, both come from Settings,
  // but a rename there can never desync from what past/future bills are tagged with. Any
  // other configured method (no `key`) is a generic/simple payment — selectable at Sell,
  // marked Paid immediately, with no extra slip/reference fields to collect.
  const methodsByKey = new Map<string, (typeof settings.payments.methods)[number]>(
    settings.payments.methods.filter((m) => m.key).map((m) => [m.key as string, m]),
  );
  const specialPayMethods = (["Cash", "Card", "Bank Transfer"] as const)
    .map((key) => methodsByKey.get(key))
    .filter((m): m is (typeof settings.payments.methods)[number] => m !== undefined);
  const customPayMethods = settings.payments.methods.filter((m) => !m.key);
  const availablePayMethods = [...specialPayMethods, ...customPayMethods];
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
  // Blocks a second Save Bill click (double-click, Alt+S repeat) from creating a duplicate
  // bill while the save request is in flight.
  const [isSaving, setIsSaving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountDraftType, setDiscountDraftType] = useState<"percent" | "amount">("percent");
  const [discountDraftValue, setDiscountDraftValue] = useState("");
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const slipInput = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const cashGivenRef = useRef<HTMLInputElement>(null);

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

  // Browsers won't let a beforeunload prompt say anything custom (Chrome/Edge/Firefox all
  // ignore the message and show their own generic "leave site?" wording), so the in-page F5
  // / Ctrl+R shortcut is intercepted here instead to ask something that actually explains
  // what happens: refreshing is safe, the cart is already auto-saved as a held sale either
  // way (see sale-tabs-store.ts), this is just reassurance before doing it. Skipped
  // entirely when every tab is empty — nothing to hold, so just let the refresh happen.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isRefreshKey = e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key === "r");
      if (!isRefreshKey) return;
      if (!tabs.some((t) => t.items.length > 0)) return;
      e.preventDefault();
      setRefreshConfirmOpen(true);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs]);

  const tab = tabs.find((t) => t.id === activeTab)!;
  const selectedCustomer = customers.find((c) => c.id === tab.customerId) ?? null;

  const filtered = useMemo(
    () =>
      products.filter(
        // useProducts() scopes to the viewer's own outlet, but for Super Admin (unrestricted)
        // that's every outlet's catalog combined — only this register's own outlet's
        // products should ever be searchable/sellable here, regardless of who's operating it.
        (p) =>
          p.outletId === currentOutletId &&
          (category === "all" || p.category === category) &&
          (p.name.toLowerCase().includes(query.toLowerCase()) || (p.barcode ?? "").includes(query)),
      ),
    [products, currentOutletId, category, query],
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
  // Only items marked GST-applicable on the product itself contribute to GST — an exempt
  // item (gstApplicable === false) is sold tax-free, not taxed at the same flat rate as
  // everything else in the cart.
  const gstableSubtotal = tab.items.reduce(
    (s, i) => s + (i.product.gstApplicable !== false ? linePrice(i) * i.qty : 0),
    0,
  );
  const gst = gstableSubtotal * (settings.tax.gstPercent / 100);
  // The Sell page's "Plastic Bag" checkbox — cashier-entered bag count * the configured
  // per-bag rate. Not itself subject to GST.
  const bagQtyNum = tab.bagEnabled ? parseInt(tab.bagQty, 10) || 0 : 0;
  const bagCharge = bagQtyNum * settings.tax.bagFeeRate;
  // Manually-applied discount (Discount quick action) — percent is off the subtotal, amount
  // is a flat deduction. Capped so it can never push the total below zero on its own.
  const manualDiscount =
    !tab.foc && tab.discountType && tab.discountValue
      ? tab.discountType === "percent"
        ? subtotal * ((parseFloat(tab.discountValue) || 0) / 100)
        : parseFloat(tab.discountValue) || 0
      : 0;
  // Free of Charge — the discount is set to cover the full subtotal+gst+bagCharge so total
  // lands on exactly 0, rather than being a separate code path through the totals below.
  const discount = tab.foc
    ? subtotal + gst + bagCharge
    : Math.min(manualDiscount, subtotal + gst + bagCharge);
  const total = subtotal - discount + gst + bagCharge;
  // Display-only conversion for the Currency quick action — `rate` is MVR (base) per 1
  // unit of the alternate currency, so dividing converts base -> alternate.
  const currencyTotal = tab.currency && tab.currencyRate ? total / tab.currencyRate : null;
  const cashReceived = parseFloat(tab.cashReceived || "0") || 0;
  const pending = tab.payMethod === "Cash" ? Math.max(0, total - cashReceived) : 0;
  const balance = tab.payMethod === "Cash" ? Math.max(0, cashReceived - total) : 0;
  const outOfStock = tab.items.find((i) => {
    const live = products.find((p) => p.id === i.product.id);
    const available = live ? live.stock : i.product.stock;
    return available < i.qty;
  });

  function updateTab(patch: Partial<SaleTab>) {
    saleTabsStore.set((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === activeTab ? { ...t, ...patch } : t)),
    }));
  }

  // Cash Given defaults to the exact Grand Total (so Change Due starts at 0.00 without the
  // cashier having to type it) and re-syncs whenever that tab's total changes — e.g. after
  // adding another item. The cashier can still overwrite it for the current total (say the
  // customer hands over a rounded note) without it snapping back until the total changes
  // again. Tracked per tab.id (not just the last render's total) so switching between
  // multiple open sale tabs never clobbers a manual override on the tab you switch back to.
  const lastSyncedCashTotal = useRef<Record<string, number>>({});
  useEffect(() => {
    if (tab.payMethod !== "Cash") return;
    if (lastSyncedCashTotal.current[tab.id] === total) return;
    lastSyncedCashTotal.current[tab.id] = total;
    updateTab({ cashReceived: total.toFixed(2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, tab.payMethod, tab.id]);

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
      customReceiptNumber: "",
      note: "",
      foc: false,
      noDelivery: false,
      bagEnabled: false,
      bagQty: "1",
      tags: [],
      currency: null,
      currencyRate: null,
    });
    setCustomerQuery("");
  }

  // Closes the current sale tab outright when there are others open (so it disappears from
  // the tab bar, not just an emptied-out tab sitting there) — with only one tab left, there's
  // nothing to close down to, so it's reset in place instead (same end result either way).
  function closeOrResetTab() {
    if (tabs.length > 1) {
      saleTabsStore.closeTab(activeTab);
    } else {
      discardBill();
    }
  }

  // Nothing to lose on an empty bill, so skip asking and just close/reset straight away.
  // Anything with items in it needs a confirmation first (see discardConfirmOpen below).
  function requestDiscardBill() {
    if (tab.items.length === 0) {
      closeOrResetTab();
      return;
    }
    setDiscardConfirmOpen(true);
  }

  // Wires up the shortcuts advertised right on the page (the "Discard Bill (F2)" button
  // label, "New Sale (Alt+N)", the Alt+C/Alt+R/Alt+S input hints, and the "Keyboard
  // Shortcuts" help panel) — previously just descriptive text with no listener behind any
  // of it, so pressing the key did nothing. Skipped while a dialog is open so e.g. F2 can't
  // blow away the cart out from under someone editing a note or a new customer.
  // F1 deliberately isn't used here — every major browser reserves it for their own Help
  // page and won't let a website's preventDefault() stop that, so New Sale uses Alt+N
  // instead (same Alt+<letter> convention as the other three), which browsers don't reserve.
  useEffect(() => {
    const dialogOpen =
      newCustomerOpen ||
      printOpen ||
      noteOpen ||
      tagsOpen ||
      currencyOpen ||
      discountOpen ||
      discardConfirmOpen ||
      refreshConfirmOpen;
    if (dialogOpen) return;
    function handler(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTab();
      } else if (e.key === "F2") {
        e.preventDefault();
        requestDiscardBill();
      } else if (e.key === "Escape") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        customerInputRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        cashGivenRef.current?.focus();
      } else if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveBill();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    newCustomerOpen,
    printOpen,
    noteOpen,
    tagsOpen,
    currencyOpen,
    discountOpen,
    discardConfirmOpen,
    refreshConfirmOpen,
    activeTab,
  ]);

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

  async function createCustomer() {
    if (!newCustomerName.trim()) return;
    const customer = await customersStore.create({
      name: newCustomerName.trim(),
      mobile: newCustomerMobile.trim(),
      limit: 0,
    });
    if ("error" in customer) {
      toast.error(customer.error);
      return;
    }
    selectCustomer(customer.id, customer.name);
    setNewCustomerName("");
    setNewCustomerMobile("");
    setNewCustomerOpen(false);
    toast.success(`Customer "${customer.name}" added`);
  }

  function openNote() {
    setNoteDraft(tab.note);
    setNoteOpen(true);
  }

  function saveNote() {
    updateTab({ note: noteDraft.trim() });
    setNoteOpen(false);
    toast.success(noteDraft.trim() ? "Note saved" : "Note cleared");
  }

  function openDiscount() {
    setDiscountDraftType(tab.discountType ?? "percent");
    setDiscountDraftValue(tab.discountValue || "");
    setDiscountOpen(true);
  }

  function applyDiscount(type: "percent" | "amount", value: string) {
    if (!value || (parseFloat(value) || 0) <= 0) {
      updateTab({ discountType: null, discountValue: "" });
      setDiscountOpen(false);
      toast.success("Discount removed");
      return;
    }
    updateTab({ discountType: type, discountValue: value });
    setDiscountOpen(false);
    toast.success("Discount applied");
  }

  function clearDiscount() {
    updateTab({ discountType: null, discountValue: "" });
    setDiscountOpen(false);
    toast.success("Discount removed");
  }

  function toggleFoc() {
    updateTab({ foc: !tab.foc });
    toast.success(
      tab.foc ? "FOC removed — bill will be charged normally" : "Marked as Free of Charge",
    );
  }

  function toggleNoDelivery() {
    updateTab({ noDelivery: !tab.noDelivery });
    toast.success(
      tab.noDelivery ? "Delivery re-enabled for this bill" : "Delivery disabled for this bill",
    );
  }

  function addTag() {
    const value = tagDraft.trim();
    if (!value || tab.tags.includes(value)) {
      setTagDraft("");
      return;
    }
    updateTab({ tags: [...tab.tags, value] });
    setTagDraft("");
  }

  function removeTag(value: string) {
    updateTab({ tags: tab.tags.filter((t) => t !== value) });
  }

  function selectCurrency(code: string | null) {
    if (!code) {
      updateTab({ currency: null, currencyRate: null });
      return;
    }
    const found = settings.general.alternateCurrencies.find((c) => c.code === code);
    updateTab({ currency: code, currencyRate: found?.rate ?? 1 });
  }

  function setCurrencyRate(rate: number) {
    if (!tab.currency || !Number.isFinite(rate) || rate <= 0) return;
    updateTab({ currencyRate: rate });
    settingsStore.updateSection("general", {
      alternateCurrencies: settings.general.alternateCurrencies.map((c) =>
        c.code === tab.currency ? { ...c, rate } : c,
      ),
    });
  }

  async function saveBill() {
    if (isSaving) return;
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
    const isCustomPayMethod = customPayMethods.some((m) => m.name === payMethod);
    if (isCustomPayMethod && !tab.customReceiptNumber.trim())
      return toast.error("Enter the receipt number");
    setIsSaving(true);
    // Stock is decremented atomically on the server as part of creating the bill (see
    // createBillOnServer in bills-api.ts) — no separate client-side stock call needed.
    const bill = await billsStore.create({
      customer: selectedCustomer?.name ?? "",
      customerId: tab.customerId,
      location: register.storeName,
      register: register.register,
      outletId: currentOutletId,
      items: tab.items.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        price: linePrice(i),
        qty: i.qty,
        gstApplicable: i.product.gstApplicable,
      })),
      subtotal,
      discount,
      gst,
      bagQty: tab.bagEnabled && bagQtyNum > 0 ? bagQtyNum : undefined,
      bagCharge: tab.bagEnabled && bagQtyNum > 0 ? bagCharge : undefined,
      total,
      by: currentUser?.name ?? "Unknown",
      paymentMethod: payMethod as Bill["paymentMethod"],
      paymentStatus: payMethod === "Credit" ? "Pending" : "Paid",
      cashGiven: payMethod === "Cash" ? cashReceived : undefined,
      changeGiven: payMethod === "Cash" ? balance : undefined,
      transferSlip: payMethod === "Bank Transfer" ? tab.transferSlip : undefined,
      recipientNumber: payMethod === "Bank Transfer" ? tab.recipientNumber : undefined,
      cardSlipNumber: payMethod === "Card" ? tab.cardSlipNumber : undefined,
      customReceiptNumber: isCustomPayMethod ? tab.customReceiptNumber.trim() : undefined,
      note: tab.note.trim() || undefined,
      foc: tab.foc,
      noDelivery: tab.noDelivery,
      tags: tab.tags,
      currency: tab.currency ?? undefined,
      currencyRate: tab.currencyRate ?? undefined,
      currencyTotal: currencyTotal ?? undefined,
    });
    if ("error" in bill) {
      toast.error(bill.error);
      setIsSaving(false);
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
    if (bill.pendingSync) {
      toast.warning(
        `Bill ${bill.number} saved on this device (offline) — will sync to Supabase once the connection is back`,
      );
    } else {
      toast.success(
        payMethod === "Credit"
          ? `Bill ${bill.number} saved for ${total.toFixed(2)} on credit`
          : `Bill ${bill.number} saved for ${total.toFixed(2)} via ${methodsByKey.get(payMethod)?.name ?? payMethod}`,
      );
    }
    setSavedBill(bill);
    setPrintOpen(true);
    // Unfreeze Save Bill as soon as the bill is safely in the database — the Print dialog
    // that just opened is a modal, so it already blocks another click from reaching this
    // button. Waiting any longer to unfreeze would just make the button look stuck.
    setIsSaving(false);
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
            const tBagCharge = t.bagEnabled
              ? (parseInt(t.bagQty, 10) || 0) * settings.tax.bagFeeRate
              : 0;
            const tTotal = tSubtotal * (1 + settings.tax.gstPercent / 100) + tBagCharge;
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
            <Plus className="h-4 w-4" /> New Sale (Alt+N)
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
                  ref={searchInputRef}
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
              <Button variant="outline" onClick={requestDiscardBill}>
                Discard Bill (F2)
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
                    <TableHead>GST</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tab.items.map((i) => {
                    const liveProduct = products.find((p) => p.id === i.product.id);
                    const liveStock = (liveProduct ?? i.product).stock;
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
                        <TableCell className="text-muted-foreground">
                          {i.product.gstApplicable !== false
                            ? (linePrice(i) * i.qty * (settings.tax.gstPercent / 100)).toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell>{(linePrice(i) * i.qty).toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      Sub Total
                    </TableCell>
                    <TableCell className="font-semibold">{subtotal.toFixed(2)}</TableCell>
                  </TableRow>
                  <TableRow
                    className={tab.foc ? undefined : "cursor-pointer hover:bg-muted/50"}
                    onClick={tab.foc ? undefined : openDiscount}
                  >
                    <TableCell colSpan={4} className="text-right font-semibold">
                      <span className="inline-flex items-center justify-end gap-1.5">
                        Discount
                        {!tab.foc && <Percent className="h-3 w-3 text-muted-foreground" />}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`font-semibold ${!tab.foc && discount > 0 ? "text-emerald-600" : ""}`}
                    >
                      {discount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">
                      {subtotal > 0
                        ? `${settings.tax.gstLabel} @ ${settings.tax.gstPercent}%`
                        : "Total Taxes"}
                    </TableCell>
                    <TableCell className="font-semibold">{gst.toFixed(2)}</TableCell>
                  </TableRow>
                  {tab.bagEnabled && bagQtyNum > 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-semibold">
                        Plastic Bag Charge ({bagQtyNum} × {settings.tax.bagFeeRate.toFixed(2)}{" "}
                        {settings.general.currency})
                      </TableCell>
                      <TableCell className="font-semibold">{bagCharge.toFixed(2)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right text-base font-bold">
                      Grand Total
                    </TableCell>
                    <TableCell className="text-base font-bold">{total.toFixed(2)}</TableCell>
                  </TableRow>
                  {currencyTotal !== null && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-right text-muted-foreground">
                        ≈ {tab.currency}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {currencyTotal.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {(tab.note || tab.tags.length > 0 || (!tab.foc && tab.discountType)) && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {tab.note && (
                    <Badge variant="outline" className="gap-1">
                      <StickyNote className="h-3 w-3" /> {tab.note}
                    </Badge>
                  )}
                  {!tab.foc && tab.discountType && (
                    <Badge variant="outline" className="gap-1 text-emerald-600">
                      <Percent className="h-3 w-3" />
                      {tab.discountType === "percent"
                        ? `${tab.discountValue}% off`
                        : `${settings.general.currency} ${tab.discountValue} off`}
                    </Badge>
                  )}
                  {tab.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-6 border-t border-border pt-4">
                <IconAction icon={StickyNote} label="Note" active={!!tab.note} onClick={openNote} />
                <IconAction
                  icon={Globe}
                  label="Currency"
                  active={!!tab.currency}
                  onClick={() => setCurrencyOpen(true)}
                />
                <IconAction icon={Smile} label="FOC" active={tab.foc} onClick={toggleFoc} />
                <IconAction
                  icon={PackageX}
                  label="No Delivery"
                  active={tab.noDelivery}
                  onClick={toggleNoDelivery}
                />
                <IconAction
                  icon={Tag}
                  label="Tags"
                  active={tab.tags.length > 0}
                  onClick={() => setTagsOpen(true)}
                />
                <IconAction
                  icon={Percent}
                  label="Discount"
                  active={!tab.foc && !!tab.discountType}
                  onClick={openDiscount}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={tab.bagEnabled}
                    onCheckedChange={(v) =>
                      updateTab({ bagEnabled: !!v, bagQty: tab.bagQty || "1" })
                    }
                  />
                  Plastic Bag
                </label>
                {tab.bagEnabled && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">Bag Quantity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={tab.bagQty}
                      onChange={(e) => updateTab({ bagQty: e.target.value })}
                      className="w-20"
                    />
                    <span className="text-xs text-muted-foreground">
                      × {settings.tax.bagFeeRate.toFixed(2)} {settings.general.currency} ={" "}
                      {bagCharge.toFixed(2)} {settings.general.currency}
                    </span>
                  </div>
                )}
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
                  <span className="w-14 font-mono text-foreground">Alt+N</span> New sale window
                </div>
                <div className="flex gap-3">
                  <span className="w-14 font-mono text-foreground">F2</span> Dismiss Bill
                </div>
                <div className="flex gap-3">
                  <span className="w-14 font-mono text-foreground">ESC</span> Focus Product Search
                </div>
                <div className="flex gap-3">
                  <span className="w-14 font-mono text-foreground">Alt+C</span> Focus Customer
                  Search
                </div>
                <div className="flex gap-3">
                  <span className="w-14 font-mono text-foreground">Alt+R</span> Focus Cash Given
                </div>
                <div className="flex gap-3">
                  <span className="w-14 font-mono text-foreground">Alt+S</span> Save Bill
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
                ref={customerInputRef}
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
                  {availablePayMethods.map((m) => (
                    <SelectItem key={m.key ?? m.name} value={m.key ?? m.name}>
                      {m.name}
                    </SelectItem>
                  ))}
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
                    ref={cashGivenRef}
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

            {customPayMethods.some((m) => m.name === tab.payMethod) && (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                <Label>Receipt Number</Label>
                <Input
                  value={tab.customReceiptNumber}
                  onChange={(e) => updateTab({ customReceiptNumber: e.target.value })}
                  placeholder="Proof of payment reference"
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
              disabled={
                isSaving ||
                !tab.items.length ||
                (tab.payMethod === "Credit" && !tab.customerId) ||
                (customPayMethods.some((m) => m.name === tab.payMethod) &&
                  !tab.customReceiptNumber.trim())
              }
            >
              {isSaving ? "Saving..." : "Save Bill (Alt+S)"}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this bill?</AlertDialogTitle>
            <AlertDialogDescription>
              {tabs.length > 1
                ? "This closes the tab and everything in it. This can't be undone."
                : "Everything in this cart will be cleared. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                closeOrResetTab();
                setDiscardConfirmOpen(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={refreshConfirmOpen} onOpenChange={setRefreshConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh page?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current sale{tabs.filter((t) => t.items.length > 0).length > 1 ? "s are" : " is"}{" "}
              already saved as a held sale, so nothing will be lost — you can pick up right where
              you left off after refreshing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.reload()}>Refresh</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            setIsSaving(false);
          }
        }}
        autoPrint={settings.printing.autoPrintOnSave}
      />

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bill Note</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="e.g. Gift wrap, deliver after 5pm..."
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNote}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tag This Bill</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTag()}
              placeholder="e.g. wholesale, gift"
            />
            <Button type="button" variant="outline" onClick={addTag} disabled={!tagDraft.trim()}>
              Add
            </Button>
          </div>
          {tab.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tab.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTagsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {settings.discounts.presets.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  {settings.discounts.onlyFixedDiscounts
                    ? "Choose a discount"
                    : "Quick pick, or enter a custom amount below"}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {settings.discounts.presets.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => applyDiscount(p.type, String(p.value))}
                    >
                      {p.name} ({p.type === "percent" ? `${p.value}%` : p.value.toFixed(2)})
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {!settings.discounts.onlyFixedDiscounts && (
              <div className="space-y-1.5">
                <Label>Custom Discount</Label>
                <div className="flex gap-2">
                  <Select
                    value={discountDraftType}
                    onValueChange={(v) => setDiscountDraftType(v as "percent" | "amount")}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percent (%)</SelectItem>
                      <SelectItem value="amount">Amount ({settings.general.currency})</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={discountDraftValue}
                    onChange={(e) => setDiscountDraftValue(e.target.value)}
                    placeholder={discountDraftType === "percent" ? "e.g. 10" : "e.g. 10.00"}
                  />
                </div>
              </div>
            )}
            {settings.discounts.onlyFixedDiscounts && settings.discounts.presets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No discount presets are set up yet — ask an Admin to add some in Settings &gt;
                Discounts.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {tab.discountType ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                onClick={clearDiscount}
              >
                Remove Discount
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDiscountOpen(false)}>
                Cancel
              </Button>
              {!settings.discounts.onlyFixedDiscounts && (
                <Button
                  onClick={() => applyDiscount(discountDraftType, discountDraftValue)}
                  disabled={!discountDraftValue || (parseFloat(discountDraftValue) || 0) <= 0}
                >
                  Apply
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={currencyOpen} onOpenChange={setCurrencyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Show Total In Another Currency</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select
                value={tab.currency ?? "none"}
                onValueChange={(v) => selectCurrency(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None ({settings.general.currency} only)</SelectItem>
                  {settings.general.alternateCurrencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tab.currency && (
              <>
                <div className="space-y-1.5">
                  <Label>
                    Rate ({settings.general.currency} per 1 {tab.currency})
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tab.currencyRate ?? ""}
                    onChange={(e) => setCurrencyRate(parseFloat(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Manually entered — saved as the default rate for {tab.currency} going forward.
                  </p>
                </div>
                {currencyTotal !== null && (
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <p className="text-xs uppercase text-muted-foreground">
                      Total in {tab.currency}
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {currencyTotal.toFixed(2)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setCurrencyOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 text-xs ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full border ${
          active ? "border-primary bg-primary/10" : "border-border"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
