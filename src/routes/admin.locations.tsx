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
import { useProducts, useProductsPolling } from "@/lib/products-store";

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

      {/* Outlet inventory — read-only: each outlet has its own independent product catalog now,
          so this is just a lookup, not a management screen. To add/edit/delete products for an
          outlet, go to the Products page (Super Admin can pick any outlet there). */}
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
                  (p) => p.outletId === inventoryOutlet.id && matches(p),
                );
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Products at this outlet ({stocked.length})
                    </p>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                      {stocked.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          No products in this outlet's catalog yet — add one from the Products page.
                        </p>
                      ) : (
                        stocked.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 border-b border-border p-2 last:border-b-0"
                          >
                            <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                            <Badge
                              variant="outline"
                              className={
                                p.stock === 0
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-emerald-100 text-emerald-700"
                              }
                            >
                              {p.stock} in stock
                            </Badge>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
