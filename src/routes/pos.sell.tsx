import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Search, UserPlus, StickyNote, Globe, Smile, PackageX, Tag, Minus, Store } from "lucide-react";
import { categories, type Product } from "@/lib/pos-data";
import { useProducts, productsStore } from "@/lib/products-store";
import { billsStore } from "@/lib/bills-store";
import { useRegister } from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";

type CartLine = { product: Product; qty: number };
type SaleTab = { id: number; items: CartLine[]; cashReceived: string };

export const Route = createFileRoute("/pos/sell")({
  head: () => ({
    meta: [
      { title: "Sell - Dhipos" },
      { name: "description", content: "Ring up sales and check out with Dhipos." },
    ],
  }),
  component: SellPage,
});

let tabId = 1;

function SellPage() {
  const products = useProducts();
  const register = useRegister();
  const currentUser = useCurrentUser();
  const [tabs, setTabs] = useState<SaleTab[]>([{ id: 0, items: [], cashReceived: "0.00" }]);
  const [activeTab, setActiveTab] = useState(0);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [payMethod, setPayMethod] = useState("Cash");

  const tab = tabs.find((t) => t.id === activeTab)!;

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

  const subtotal = tab.items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const discount = 0;
  const gst = subtotal * 0.08;
  const total = subtotal - discount + gst;
  const cashReceived = parseFloat(tab.cashReceived || "0") || 0;
  const pending = Math.max(0, total - cashReceived);
  const balance = Math.max(0, cashReceived - total);
  const outOfStock = tab.items.find((i) => {
    const live = products.find((p) => p.id === i.product.id);
    return (live?.stock ?? i.product.stock) < i.qty;
  });

  function updateTab(patch: Partial<SaleTab>) {
    setTabs((ts) => ts.map((t) => (t.id === activeTab ? { ...t, ...patch } : t)));
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
      items: qty <= 0 ? tab.items.filter((i) => i.product.id !== id) : tab.items.map((i) => (i.product.id === id ? { ...i, qty } : i)),
    });
  }

  function newTab() {
    tabId += 1;
    const id = tabId;
    setTabs((ts) => [...ts, { id, items: [], cashReceived: "0.00" }]);
    setActiveTab(id);
  }

  function discardBill() {
    updateTab({ items: [], cashReceived: "0.00" });
  }

  function saveBill() {
    if (!register.register) return toast.error("Open a register before selling");
    if (!tab.items.length) return toast.error("Cart is empty");
    if (outOfStock) return toast.error("Not enough stock");
    for (const i of tab.items) {
      productsStore.decrementStock(i.product.id, i.qty);
    }
    const bill = billsStore.create({
      customer: "",
      location: register.storeName,
      register: register.register,
      total,
      by: currentUser?.name ?? "Unknown",
    });
    toast.success(`Bill ${bill.number} saved for ${total.toFixed(2)} via ${payMethod}`);
    discardBill();
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
            <p className="text-sm text-muted-foreground">Open a register before you can start selling.</p>
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
            const tTotal = t.items.reduce((s, i) => s + i.product.price * i.qty, 0) * 1.08;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex flex-col items-start gap-0.5 border-b-2 py-3 text-sm ${
                  activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
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
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tab.items.map((i) => {
                    const liveStock = products.find((p) => p.id === i.product.id)?.stock ?? i.product.stock;
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
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setQty(i.product.id, i.qty - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center">{i.qty}</span>
                          <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setQty(i.product.id, i.qty + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{i.product.price.toFixed(2)}</TableCell>
                      <TableCell>{(i.product.price * i.qty).toFixed(2)}</TableCell>
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
                      {subtotal > 0 ? "GST @ 8%" : "Total Taxes"}
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
                <IconAction icon={StickyNote} label="Note" onClick={() => toast("Add a note to this bill")} />
                <IconAction icon={Globe} label="Currency" onClick={() => toast("Currency switcher coming soon")} />
                <IconAction icon={Smile} label="FOC" onClick={() => toast.success("Marked as Free of Charge")} />
                <IconAction icon={PackageX} label="No Delivery" onClick={() => toast.success("Delivery disabled for this bill")} />
                <IconAction icon={Tag} label="Tags" onClick={() => toast("Tag this bill")} />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox /> Automatically print bill on save
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
            <Button variant="outline" className="ml-auto gap-1.5" onClick={() => toast("New customer form opened")}>
              <UserPlus className="h-4 w-4" /> New Customer
            </Button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Enter customer mobile, passport, or name (Alt+C)" className="pl-8" />
            </div>
            <p className="text-xs text-muted-foreground">A customer is required for a credit sale.</p>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm font-medium text-foreground">Payment Method</span>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Cash Received</p>
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
                <p className="text-xs uppercase text-muted-foreground">Cash Balance</p>
                <p className="text-2xl font-bold text-emerald-600">{balance.toFixed(2)}</p>
              </div>
            </div>

            {outOfStock && (
              <p className="rounded-md bg-destructive/10 py-2 text-center text-sm font-medium text-destructive">
                Not enough stock
              </p>
            )}

            <Button size="lg" onClick={saveBill} disabled={!tab.items.length}>
              Save Bill (Alt+S)
            </Button>
          </div>
        </div>
      </div>
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
    <button onClick={onClick} className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </button>
  );
}
