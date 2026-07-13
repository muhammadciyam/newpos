import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Filter, Download, Pencil, Trash2 } from "lucide-react";
import { products } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products — DhiPOS" },
      { name: "description", content: "Manage your product catalog, pricing, and stock." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  return (
    <AppShell title="Products">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Catalog</h2>
            <p className="text-sm text-muted-foreground">{products.length} products in stock</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Download className="mr-1 h-4 w-4" /> Export</Button>
            <Button onClick={() => toast.success("New product form opened")}>
              <Plus className="mr-1 h-4 w-4" /> Add Product
            </Button>
          </div>
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products…" className="pl-8" />
            </div>
            <Button variant="outline"><Filter className="mr-1 h-4 w-4" /> Filter</Button>
          </div>
        </Card>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img src={p.image} alt="" loading="lazy" width={1024} height={1024} className="h-10 w-10 rounded-md object-cover" />
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="font-semibold">${p.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={p.stock < 15 ? "destructive" : "secondary"}>{p.stock}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => toast("Edit " + p.name)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toast.error("Deleted " + p.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}