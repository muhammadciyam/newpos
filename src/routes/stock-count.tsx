import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { ClipboardList, Check, Search, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useProducts, useProductsPolling, productsStore } from "@/lib/products-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { useOutlets } from "@/lib/outlets-store";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { CalculatorDialog } from "@/components/calculator-dialog";

export const Route = createFileRoute("/stock-count")({
  head: () => ({ meta: [{ title: "Stock Count - Dhipos" }] }),
  component: StockCountPage,
});

type DraftRow = { qty: string; reason: string };

function StockCountPage() {
  const canAccess = useHasPermission("inventory.access");
  const products = useProducts();
  useProductsPolling();
  const settings = useSettings();
  const outlets = useOutlets();
  // Restricted to the viewer's own outlet — the same rule as every other outlet-scoped
  // screen (registers, bills, reports). Super Admin (scopeOutletId === null) can still pick
  // any outlet.
  const scopeOutletId = useScopeOutletId();
  const selectableOutlets = scopeOutletId ? outlets.filter((o) => o.id === scopeOutletId) : outlets;

  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [outletId, setOutletId] = useState("");
  const [calculatorProductId, setCalculatorProductId] = useState<string | null>(null);

  useEffect(() => {
    if (scopeOutletId) {
      if (outletId !== scopeOutletId) setOutletId(scopeOutletId);
      return;
    }
    if (!outletId && outlets.length > 0) setOutletId(outlets[0].id);
  }, [outletId, outlets, scopeOutletId]);

  if (!canAccess) return <RestrictedPage />;

  // useProducts() already scopes to the viewer's own outlet, but Super Admin can pick a
  // *different* outlet via the Select above (scopeOutletId is null for them, so it returns
  // every outlet's products combined) — filter to whichever outlet is actually selected so
  // switching it re-filters the product list too, not just what stock number shows.
  const productsForOutlet = products.filter((p) => p.outletId === outletId);

  const filtered = productsForOutlet.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q)
    );
  });
  const countableCount = productsForOutlet.filter((p) => p.countable !== false).length;

  function draftFor(id: string, stock: number): DraftRow {
    return drafts[id] ?? { qty: String(stock), reason: "" };
  }

  function setDraft(id: string, stock: number, patch: Partial<DraftRow>) {
    setDrafts((d) => ({
      ...d,
      [id]: { ...(d[id] ?? { qty: String(stock), reason: "" }), ...patch },
    }));
  }

  async function toggleCountable(id: string, name: string, next: boolean) {
    const result = await productsStore.setCountable(id, next);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} is ${next ? "now" : "no longer"} countable`);
  }

  async function saveCount(id: string, name: string, currentStock: number) {
    if (!outletId) return;
    const draft = draftFor(id, currentStock);
    const newQty = parseInt(draft.qty, 10);
    if (!Number.isFinite(newQty) || newQty < 0 || !draft.reason) return;
    setSavingId(id);
    const result = await productsStore.setStockCount(id, newQty, draft.reason);
    setSavingId(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} stock set to ${newQty}`);
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Stock Count</h1>
            <p className="text-sm text-muted-foreground">
              Mark which products are countable, then record physical counts directly in the table —
              each change is saved with a reason.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="bg-emerald-100 text-emerald-700">
              {countableCount} of {productsForOutlet.length} countable
            </Badge>
            <Select value={outletId} onValueChange={setOutletId} disabled={!!scopeOutletId}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select an outlet" />
              </SelectTrigger>
              <SelectContent>
                {selectableOutlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, category, SKU, or barcode..."
                className="w-72 pl-8"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Countable</TableHead>
                <TableHead>System Stock</TableHead>
                <TableHead>Counted Quantity</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Save</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productsForOutlet.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                      <ClipboardList className="h-10 w-10" />
                      <p>No products yet.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {productsForOutlet.length > 0 && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No products match your search.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => {
                const countable = p.countable !== false;
                const draft = draftFor(p.id, p.stock);
                const parsedQty = parseInt(draft.qty, 10);
                const delta = Number.isFinite(parsedQty) ? parsedQty - p.stock : null;
                const canSave =
                  countable &&
                  Number.isFinite(parsedQty) &&
                  parsedQty >= 0 &&
                  !!draft.reason &&
                  delta !== 0 &&
                  savingId !== p.id;
                return (
                  <TableRow key={p.id} className={!countable ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">
                      {p.name}
                      {(p.sku || p.barcode) && (
                        <span className="block text-xs text-muted-foreground">
                          {p.sku || p.barcode}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                    <TableCell>
                      <Switch
                        checked={countable}
                        onCheckedChange={(v) => toggleCountable(p.id, p.name, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.stock === 0
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-100 text-emerald-700"
                        }
                      >
                        {p.stock}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {countable ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={draft.qty}
                            onChange={(e) => setDraft(p.id, p.stock, { qty: e.target.value })}
                            className="w-24"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            title="Open calculator"
                            onClick={() => setCalculatorProductId(p.id)}
                          >
                            <Calculator className="h-4 w-4" />
                          </Button>
                          {delta !== null && delta !== 0 && (
                            <span
                              className={
                                delta > 0
                                  ? "text-xs font-medium text-emerald-600"
                                  : "text-xs font-medium text-destructive"
                              }
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not countable</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {countable && (
                        <Select
                          value={draft.reason}
                          onValueChange={(v) => setDraft(p.id, p.stock, { reason: v })}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {settings.inventory.stockAdjustmentTypes.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {countable && (
                        <Button
                          size="sm"
                          disabled={!canSave}
                          onClick={() => saveCount(p.id, p.name, p.stock)}
                          className="gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {savingId === p.id ? "Saving..." : "Save"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <CalculatorDialog
        open={!!calculatorProductId}
        onOpenChange={(v) => !v && setCalculatorProductId(null)}
        title={products.find((p) => p.id === calculatorProductId)?.name}
        onApply={(value) => {
          if (!calculatorProductId) return;
          const product = products.find((p) => p.id === calculatorProductId);
          if (!product) return;
          setDraft(calculatorProductId, product.stock, {
            qty: String(Math.round(value)),
          });
        }}
      />
    </AppShell>
  );
}
