import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, AlertTriangle } from "lucide-react";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { useCategories } from "@/lib/categories-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { useCurrentUser } from "@/lib/auth-store";
import { useOutlets } from "@/lib/outlets-store";
import { RestrictedPage } from "@/components/restricted-page";

// Same threshold the Products page and Stock Report already flag "Low Stock" at — kept
// consistent across every stock indicator in the app rather than introducing a second,
// separately-configurable number just for this page.
const LOW_STOCK_THRESHOLD = 15;

export const Route = createFileRoute("/inventory-items")({
  head: () => ({
    meta: [
      { title: "Inventory Items - Dhipos" },
      { name: "description", content: "Full item details for every product in stock." },
    ],
  }),
  component: InventoryItemsPage,
});

function InventoryItemsPage() {
  const canAccess = useHasPermission("inventory.access");
  const isSuperAdmin = useCurrentUser()?.role === "Super Admin";
  const outlets = useOutlets();
  const products = useProducts();
  useProductsPolling();
  const categories = useCategories();
  const settings = useSettings();
  const currency = settings.general.currency;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.stock < LOW_STOCK_THRESHOLD).length,
    [products],
  );

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (categoryFilter === "all" || p.category === categoryFilter) &&
          (!lowStockOnly || p.stock < LOW_STOCK_THRESHOLD) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
            (p.barcode ?? "").includes(search) ||
            (p.supplier ?? "").toLowerCase().includes(search.toLowerCase())),
      ),
    [products, search, categoryFilter, lowStockOnly],
  );

  if (!canAccess) return <RestrictedPage />;

  function categoryName(id: string): string {
    return categories.find((c) => c.id === id)?.name ?? id;
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inventory Items</h1>
            <p className="text-sm text-muted-foreground">
              {products.length} item{products.length === 1 ? "" : "s"} — stock, pricing, SKU,
              barcode, GST and supplier in one place.
            </p>
          </div>
          <Button
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            className="gap-1.5"
            onClick={() => setLowStockOnly((v) => !v)}
          >
            <AlertTriangle className="h-4 w-4" />
            {lowStockOnly ? "Showing Low Stock" : `Low Stock (${lowStockCount})`}
          </Button>
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, SKU, barcode, or supplier..."
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories
                  .filter((c) => c.id !== "all")
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                {isSuperAdmin && <TableHead>Outlet</TableHead>}
                <TableHead>SKU</TableHead>
                <TableHead>Barcode</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Cost Price</TableHead>
                <TableHead>Selling Price</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>Supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={isSuperAdmin ? 10 : 9}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {lowStockOnly ? "No low stock items right now." : "No items match your search."}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={p.image}
                        alt=""
                        loading="lazy"
                        width={1024}
                        height={1024}
                        className="h-10 w-10 rounded-md object-cover"
                      />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-muted-foreground">
                      {outlets.find((o) => o.id === p.outletId)?.name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{p.sku ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.barcode ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryName(p.category)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.stock < LOW_STOCK_THRESHOLD ? "destructive" : "secondary"}>
                      {p.stock}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.cost != null ? `${currency} ${p.cost.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {currency} {p.price.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        p.gstApplicable === false
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-100 text-emerald-700"
                      }
                    >
                      {p.gstApplicable === false ? "No" : "Yes"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.supplier ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}
