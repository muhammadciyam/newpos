import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Search, Filter, Pencil, Trash2, Upload, Loader2 } from "lucide-react";
import { useProducts, useProductsPolling, productsStore } from "@/lib/products-store";
import { useCategories, categoriesStore } from "@/lib/categories-store";
import { findProductImage } from "@/lib/image-search";
import { PLACEHOLDER_PRODUCT_IMAGE } from "@/lib/placeholder-image";
import { useHasPermission } from "@/lib/permissions";
import { ProductImportDialog } from "@/components/product-import-dialog";
import { useSettings } from "@/lib/settings-store";
import { toast } from "sonner";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Products - Dhipos" },
      { name: "description", content: "Manage your product catalog, pricing, and information." },
    ],
  }),
  component: ProductsPage,
});

const emptyForm = {
  name: "",
  price: "",
  category: "drinks",
  barcode: "",
  sku: "",
  image: "",
  countable: true,
  gstApplicable: true,
};

function ProductsPage() {
  const canManage = useHasPermission("products.manage");
  const products = useProducts();
  useProductsPolling();
  const categories = useCategories();
  const settings = useSettings();
  const currency = settings.general.currency;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (categoryFilter === "all" || p.category === categoryFilter) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.barcode ?? "").includes(search) ||
            (p.sku ?? "").toLowerCase().includes(search.toLowerCase())),
      ),
    [products, search, categoryFilter],
  );

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setEditingId(id);
    setForm({
      name: p.name,
      price: String(p.price),
      category: p.category,
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      image: p.image,
      countable: p.countable ?? true,
      gstApplicable: p.gstApplicable ?? true,
    });
    setOpen(true);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function save() {
    if (settings.product.skuRequired && !form.sku.trim()) {
      toast.error("SKU is required (Settings > Product > Require SKU on new products).");
      return;
    }
    // Auto-generate a barcode when the setting is on and none was entered manually —
    // a 12-digit numeric code in the same shape as a real UPC/EAN, not itself validated
    // against any external registry.
    const barcode =
      form.barcode.trim() ||
      (settings.product.barcodeAutoGenerate
        ? String(Date.now()).slice(-12).padStart(12, "0")
        : "");

    const basePayload = {
      name: form.name,
      price: parseFloat(form.price) || 0,
      category: form.category,
      barcode: barcode || undefined,
      sku: form.sku.trim() || undefined,
      countable: form.countable,
      gstApplicable: form.gstApplicable,
    };

    if (editingId) {
      const result = await productsStore.update(editingId, {
        ...basePayload,
        image: form.image || PLACEHOLDER_PRODUCT_IMAGE,
      });
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${form.name}" updated`);
      setOpen(false);
      return;
    }

    // Manual image (if the user uploaded one) always wins over the auto search.
    const manualImage = form.image;
    const created = await productsStore.create({
      ...basePayload,
      image: manualImage || PLACEHOLDER_PRODUCT_IMAGE,
    });
    if ("error" in created) {
      toast.error(created.error);
      return;
    }
    toast.success(`"${form.name}" added`);
    setOpen(false);

    if (!manualImage) {
      toast("Searching for a product image...");
      findProductImage(form.name, form.barcode.trim() || undefined).then((found) => {
        if (found) {
          void productsStore.setImage(created.id, found);
          toast.success(`Found an image for "${form.name}"`);
        } else {
          toast(`No image found for "${form.name}" — using placeholder`);
        }
      });
    }
  }

  function addCategory() {
    const result = categoriesStore.create(newCategoryName);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setForm((f) => ({ ...f, category: result.id }));
    setNewCategoryName("");
    setAddingCategory(false);
    toast.success(`Category "${result.name}" added`);
  }

  async function remove(id: string, name: string) {
    const result = await productsStore.remove(id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${name}" deleted`);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Products</h1>
            <p className="text-sm text-muted-foreground">{products.length} products in catalog</p>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1 h-4 w-4" /> Import CSV
              </Button>
              <Button onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" /> Add Product
              </Button>
            </div>
          )}
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, barcode, or SKU..."
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44 gap-1.5">
                <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
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
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Countable</TableHead>
                <TableHead>GST</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
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
                      <div>
                        <span className="font-medium">{p.name}</span>
                        {(p.barcode || p.sku) && (
                          <p className="text-xs text-muted-foreground">
                            {[p.sku && `SKU ${p.sku}`, p.barcode].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.cost != null ? `${currency} ${p.cost.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell className="font-semibold">
                    {currency} {p.price.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.stock < 15 ? "destructive" : "secondary"}>{p.stock}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        p.countable === false
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-100 text-emerald-700"
                      }
                    >
                      {p.countable === false ? "No" : "Yes"}
                    </Badge>
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
                      {p.gstApplicable === false ? "Exempt" : "Yes"}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id, p.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 8 : 7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No products match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
        <p className="text-xs text-muted-foreground">
          Stock quantities are view-only here. Add inventory through a Purchase Invoice on the
          Inventory page.
        </p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <img
                src={form.image || PLACEHOLDER_PRODUCT_IMAGE}
                alt=""
                className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
              />
              <div className="space-y-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Image
                </Button>
                <p className="text-xs text-muted-foreground">
                  {editingId
                    ? "Optional — replaces the current image."
                    : "Optional — skips the automatic image search."}
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                  placeholder={
                    settings.product.barcodeAutoGenerate
                      ? "Leave blank to auto-generate"
                      : "e.g. 8901030"
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>SKU{settings.product.skuRequired && " *"}</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="e.g. SKU-001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Price</Label>
                <Input
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                {addingCategory ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name"
                      onKeyDown={(e) => e.key === "Enter" && addCategory()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newCategoryName.trim()}
                      onClick={addCategory}
                    >
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingCategory(false);
                        setNewCategoryName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter((c) => c.id !== "all")
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Add new category"
                      onClick={() => setAddingCategory(true)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>Countable</Label>
                <p className="text-xs text-muted-foreground">
                  Shows on the Stock Count page for physical stock counts.
                </p>
              </div>
              <Switch
                checked={form.countable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, countable: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label>GST</Label>
                <p className="text-xs text-muted-foreground">
                  Whether GST applies to this product when sold.
                </p>
              </div>
              <Switch
                checked={form.gstApplicable}
                onCheckedChange={(v) => setForm((f) => ({ ...f, gstApplicable: v }))}
              />
            </div>
            {!editingId && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3" /> New products start with 0 stock — receive them
                through a Purchase Invoice once created.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.name.trim() ||
                !form.price ||
                (settings.product.skuRequired && !form.sku.trim())
              }
              onClick={save}
            >
              {editingId ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AppShell>
  );
}
