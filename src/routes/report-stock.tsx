import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { ReportPageShell, StatCard, downloadSearchSchema } from "@/components/report-page-shell";

export const Route = createFileRoute("/report-stock")({
  head: () => ({ meta: [{ title: "Stock Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: StockReportPage,
});

function StockReportPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const products = useProducts();
  useProductsPolling();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  if (!canView) return <RestrictedPage />;

  const totalUnits = products.reduce((s, p) => s + p.stock, 0);
  const outOfStock = products.filter((p) => p.stock === 0).length;
  const lowStock = products.filter((p) => p.stock > 0 && p.stock < 15).length;

  return (
    <ReportPageShell
      title="Stock Report"
      description="Current stock levels by product."
      download={download}
      extraHeader={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, or barcode..."
            className="w-56 pl-8"
          />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Products" value={String(products.length)} />
        <StatCard label="Total Units" value={String(totalUnits)} />
        <StatCard label="Low Stock" value={String(lowStock)} />
        <StatCard label="Out of Stock" value={String(outOfStock)} />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  No products match your search.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                <TableCell>{p.stock}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      p.stock === 0
                        ? "bg-destructive/10 text-destructive"
                        : p.stock < 15
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    }
                  >
                    {p.stock === 0 ? "Out of Stock" : p.stock < 15 ? "Low Stock" : "In Stock"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
