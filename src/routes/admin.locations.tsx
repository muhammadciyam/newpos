import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Card } from "@/components/ui/card";
import { MapPin, Plus, Pencil, Trash2, Package, Search } from "lucide-react";
import { toast } from "sonner";
import { useHasPermission } from "@/lib/permissions";
import { outletsStore, useOutlets, type Outlet } from "@/lib/outlets-store";
import { useProducts, useProductsPolling, productsStore } from "@/lib/products-store";
import { stockAt } from "@/lib/pos-data";

export const Route = createFileRoute("/admin/locations")({
  head: () => ({ meta: [{ title: "Locations — Dhipos" }] }),
  component: LocationsPage,
});

const emptyForm = { name: "", address: "", phone: "" };

function LocationsPage() {
  const canManageOutlets = useHasPermission("outlets.manage");
  const outlets = useOutlets();
  const products = useProducts();
  useProductsPolling();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [inventoryOutletId, setInventoryOutletId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  if (!canManageOutlets) return <RestrictedPage />;

  const inventoryOutlet = outlets.find((o) => o.id === inventoryOutletId) ?? null;

  async function createOutlet() {
    if (!form.name.trim()) {
      toast.error("Outlet name is required");
      return;
    }
    const result = await outletsStore.create({
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      active: true,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${result.name}" added`);
    setForm(emptyForm);
    setOpen(false);
  }

  function openEdit(outlet: Outlet) {
    setEditingId(outlet.id);
    setEditForm({ name: outlet.name, address: outlet.address, phone: outlet.phone });
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      toast.error("Outlet name is required");
      return;
    }
    const result = await outletsStore.update(editingId, {
      name: editForm.name.trim(),
      address: editForm.address.trim(),
      phone: editForm.phone.trim(),
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${editForm.name.trim()}" updated`);
    setEditingId(null);
  }

  async function toggleActive(outlet: Outlet) {
    const result = await outletsStore.update(outlet.id, { active: !outlet.active });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${outlet.name}" ${outlet.active ? "disabled" : "enabled"}`);
  }

  async function removeOutlet(outlet: Outlet) {
    const result = await outletsStore.remove(outlet.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${outlet.name}" removed`);
  }

  // Adds an existing (globally shared) product to this outlet's inventory at zero stock —
  // ready to receive via a Purchase Invoice or Stock Count. Product name/price/etc. stay
  // exactly as they are everywhere else; only this outlet's stock entry is created.
  async function addExistingProduct(productId: string, outletId: string) {
    setAddingProductId(productId);
    await productsStore.increaseStock(productId, outletId, 0);
    setAddingProductId(null);
    const product = products.find((p) => p.id === productId);
    toast.success(`"${product?.name ?? "Product"}" added to this outlet's inventory`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Locations</h1>
            <p className="text-sm text-muted-foreground">
              Manage the outlets this company operates.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Outlet
          </Button>
        </div>

        {outlets.length === 0 ? (
          <Card className="flex flex-col items-center gap-2 p-16 text-center text-muted-foreground">
            <MapPin className="h-10 w-10" />
            <p className="font-medium text-foreground">No outlets yet — add one to get started.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outlets.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium text-foreground">{o.name}</TableCell>
                    <TableCell>{o.address || "—"}</TableCell>
                    <TableCell>{o.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          o.active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            : "bg-muted text-muted-foreground hover:bg-muted"
                        }
                        variant="outline"
                      >
                        {o.active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setInventoryOutletId(o.id);
                            setProductSearch("");
                          }}
                        >
                          <Package className="h-3.5 w-3.5" /> Inventory
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => openEdit(o)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleActive(o)}>
                          {o.active ? "Disable" : "Enable"}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeOutlet(o)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create outlet */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet Name
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Seven Mart"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="e.g. Hulhumale"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 7777777"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createOutlet}>Add Outlet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit outlet */}
      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet Name
              </Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outlet inventory — product names/prices/etc. are shared everywhere; only the
          stock-at-this-outlet entry is outlet-specific. Adding a product here just creates
          a zero-stock entry, ready to receive via a Purchase Invoice or Stock Count. */}
      <Dialog open={!!inventoryOutletId} onOpenChange={(v) => !v && setInventoryOutletId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{inventoryOutlet?.name} Inventory</DialogTitle>
          </DialogHeader>
          {inventoryOutlet && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name, SKU, or barcode..."
                  className="pl-8"
                />
              </div>

              {(() => {
                const q = productSearch.trim().toLowerCase();
                const matches = (p: (typeof products)[number]) =>
                  !q ||
                  p.name.toLowerCase().includes(q) ||
                  (p.sku ?? "").toLowerCase().includes(q) ||
                  (p.barcode ?? "").toLowerCase().includes(q);
                const stocked = products.filter(
                  (p) => p.stockByOutlet?.[inventoryOutlet.id] !== undefined,
                );
                const notStocked = products.filter(
                  (p) => p.stockByOutlet?.[inventoryOutlet.id] === undefined && matches(p),
                );
                return (
                  <>
                    {q && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">
                          Add an existing product to this outlet
                        </p>
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                          {notStocked.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                              No matching products outside this outlet's inventory.
                            </p>
                          ) : (
                            notStocked.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-2 border-b border-border p-2 last:border-b-0"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {p.name}
                                  </p>
                                  {(p.sku || p.barcode) && (
                                    <p className="truncate text-xs text-muted-foreground">
                                      {p.sku || p.barcode}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="shrink-0 gap-1.5"
                                  disabled={addingProductId === p.id}
                                  onClick={() => addExistingProduct(p.id, inventoryOutlet.id)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {addingProductId === p.id ? "Adding..." : "Add"}
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Products stocked at this outlet ({stocked.length})
                      </p>
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                        {stocked.length === 0 ? (
                          <p className="p-3 text-sm text-muted-foreground">
                            No products in this outlet's inventory yet — search above to add one.
                          </p>
                        ) : (
                          stocked.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-2 border-b border-border p-2 last:border-b-0"
                            >
                              <p className="truncate text-sm font-medium text-foreground">
                                {p.name}
                              </p>
                              <Badge
                                variant="outline"
                                className={
                                  stockAt(p, inventoryOutlet.id) === 0
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-emerald-100 text-emerald-700"
                                }
                              >
                                {stockAt(p, inventoryOutlet.id)} in stock
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInventoryOutletId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
