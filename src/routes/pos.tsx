import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2, CreditCard, Banknote, Wallet, Percent, User } from "lucide-react";
import { categories, products } from "@/lib/pos-data";
import { cartStore, cartTotals, useCart } from "@/lib/cart-store";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "Point of Sale — DhiPOS" },
      { name: "description", content: "Ring up sales, manage the cart, and check out with DhiPOS." },
    ],
  }),
  component: PosPage,
});

function PosPage() {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [pay, setPay] = useState<"cash" | "card" | "wallet">("card");
  const cart = useCart();

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "all" || p.category === category) &&
          p.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [category, query],
  );

  const totals = cartTotals(cart);

  const checkout = () => {
    if (!cart.length) return toast.error("Cart is empty");
    toast.success(`Payment of $${totals.total.toFixed(2)} via ${pay} completed`);
    cartStore.clear();
  };

  return (
    <AppShell title="Point of Sale">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search or scan barcode…"
                  className="pl-8"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    size="sm"
                    variant={category === c.id ? "default" : "outline"}
                    onClick={() => setCategory(c.id)}
                  >
                    {c.name}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => cartStore.add(p)}
                className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{p.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {p.stock}
                    </Badge>
                  </div>
                  <span className="text-sm font-bold text-primary">${p.price.toFixed(2)}</span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                No products match your search.
              </p>
            )}
          </div>
        </div>

        <Card className="flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Current Order</p>
              <p className="text-lg font-bold text-foreground">Cart · {cart.length}</p>
            </div>
            <Button variant="outline" size="sm">
              <User className="mr-1 h-3.5 w-3.5" /> Walk-in
            </Button>
          </div>
          <Separator />
          <div className="flex max-h-[320px] flex-col gap-2 overflow-auto pr-1">
            {cart.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Tap a product to add it.</p>
            )}
            {cart.map((i) => (
              <div key={i.product.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <img
                  src={i.product.image}
                  alt=""
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className="h-10 w-10 rounded-md object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{i.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    ${i.product.price.toFixed(2)} each
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => cartStore.setQty(i.product.id, i.qty - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{i.qty}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    onClick={() => cartStore.setQty(i.product.id, i.qty + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => cartStore.remove(i.product.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
            <Row label="Tax (5%)" value={`$${totals.tax.toFixed(2)}`} />
            <Row label="Discount" value={`-$${totals.discount.toFixed(2)}`} />
            <div className="flex items-center justify-between pt-2 text-base font-bold">
              <span>Total</span>
              <span className="text-primary">${totals.total.toFixed(2)}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PayBtn active={pay === "cash"} onClick={() => setPay("cash")} icon={Banknote} label="Cash" />
            <PayBtn active={pay === "card"} onClick={() => setPay("card")} icon={CreditCard} label="Card" />
            <PayBtn active={pay === "wallet"} onClick={() => setPay("wallet")} icon={Wallet} label="Wallet" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => toast("Discount applied")}>
              <Percent className="mr-1 h-4 w-4" /> Discount
            </Button>
            <Button variant="outline" onClick={() => cartStore.clear()}>
              <Trash2 className="mr-1 h-4 w-4" /> Clear
            </Button>
          </div>
          <Button size="lg" onClick={checkout}>
            Charge ${totals.total.toFixed(2)}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function PayBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}