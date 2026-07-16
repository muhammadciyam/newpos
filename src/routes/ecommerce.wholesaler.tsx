import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  Mail,
  Printer,
  FileDown,
  Copy,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { useCategories } from "@/lib/categories-store";
import { useWholesalers, wholesalersStore, type Wholesaler } from "@/lib/wholesalers-store";
import {
  useWholesaleOrders,
  wholesaleOrdersStore,
  type WholesaleOrder,
  type WholesaleOrderItem,
  type WholesaleOrderStatus,
} from "@/lib/wholesale-orders-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { downloadCsv } from "@/lib/csv-utils";
import type { Product } from "@/lib/pos-data";

export const Route = createFileRoute("/ecommerce/wholesaler")({
  head: () => ({
    meta: [
      { title: "Wholesaler — Dhipos" },
      { name: "description", content: "Manage wholesale customers and orders." },
    ],
  }),
  component: WholesalerPage,
});

const statusColor: Record<WholesaleOrderStatus, string> = {
  Draft: "bg-muted text-muted-foreground hover:bg-muted",
  Sent: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  Confirmed: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Cancelled: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

function LOW_STOCK_THRESHOLD() {
  return 10;
}

function WholesalerPage() {
  const canAccess = useHasPermission("wholesale.access");
  if (!canAccess) return <RestrictedPage />;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wholesaler</h1>
          <p className="text-sm text-muted-foreground">
            Manage wholesale customers, build orders, and send them by WhatsApp or Email.
          </p>
        </div>
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="wholesalers">Wholesalers</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <OrdersTab />
          </TabsContent>
          <TabsContent value="wholesalers">
            <WholesalersTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Wholesalers
// ---------------------------------------------------------------------------

const emptyWholesalerForm = {
  name: "",
  contactPerson: "",
  phone: "",
  whatsapp: "",
  email: "",
  companyName: "",
  billingAddress: "",
  shippingAddress: "",
  notes: "",
  active: true,
};

function WholesalersTab() {
  const wholesalers = useWholesalers();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyWholesalerForm);

  const filtered = wholesalers.filter((w) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      w.name.toLowerCase().includes(q) ||
      w.companyName.toLowerCase().includes(q) ||
      w.phone.includes(q) ||
      w.contactPerson.toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyWholesalerForm);
    setOpen(true);
  }

  function openEdit(w: Wholesaler) {
    setEditingId(w.id);
    setForm({
      name: w.name,
      contactPerson: w.contactPerson,
      phone: w.phone,
      whatsapp: w.whatsapp,
      email: w.email,
      companyName: w.companyName,
      billingAddress: w.billingAddress,
      shippingAddress: w.shippingAddress,
      notes: w.notes,
      active: w.active,
    });
    setOpen(true);
  }

  function save() {
    if (!form.name.trim()) return;
    if (editingId) {
      wholesalersStore.update(editingId, form);
      toast.success(`"${form.name}" updated`);
    } else {
      wholesalersStore.create(form);
      toast.success(`"${form.name}" added`);
    }
    setOpen(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, company, contact, or phone..."
          className="w-72"
        />
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Wholesaler
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No wholesalers yet.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((w) => (
              <TableRow key={w.id}>
                <TableCell className="font-medium">{w.name}</TableCell>
                <TableCell className="text-muted-foreground">{w.companyName || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{w.contactPerson || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{w.phone || "—"}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => {
                      wholesalersStore.setActive(w.id, !w.active);
                      toast.success(`"${w.name}" ${w.active ? "disabled" : "enabled"}`);
                    }}
                  >
                    <Badge
                      variant="outline"
                      className={w.active ? "bg-emerald-100 text-emerald-700" : "bg-muted"}
                    >
                      {w.active ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(w)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{w.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the wholesaler record. Existing orders keep their
                            already-saved wholesaler name and details.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              wholesalersStore.remove(w.id);
                              toast.success(`"${w.name}" deleted`);
                            }}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Wholesaler" : "New Wholesaler"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Wholesaler Name
              </Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Person</Label>
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp Number</Label>
              <Input
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
                placeholder="e.g. 9609999999"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Billing Address</Label>
              <Textarea
                value={form.billingAddress}
                onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Shipping Address</Label>
              <Textarea
                value={form.shippingAddress}
                onChange={(e) => setForm((f) => ({ ...f, shippingAddress: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
              <Label>Active</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!form.name.trim()} onClick={save}>
              {editingId ? "Save Changes" : "Add Wholesaler"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function OrdersTab() {
  const orders = useWholesaleOrders();
  const settings = useSettings();
  const currency = settings.general.currency;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<WholesaleOrderStatus | "all">("all");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [duplicateFrom, setDuplicateFrom] = useState<WholesaleOrder | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsOrder = orders.find((o) => o.id === detailsId) ?? null;

  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return o.number.toLowerCase().includes(q) || o.wholesalerName.toLowerCase().includes(q);
  });

  function exportCsv() {
    downloadCsv("wholesale-orders.csv", [
      [
        "Order Number",
        "Order Date",
        "Wholesaler",
        "Status",
        `Total (${currency})`,
        "Payment Status",
        "Delivery Status",
      ],
      ...filtered.map((o) => [
        o.number,
        o.createdAt,
        o.wholesalerName,
        o.status,
        o.total.toFixed(2),
        o.paymentStatus,
        o.deliveryStatus,
      ]),
    ]);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or wholesaler..."
            className="w-64"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Sent">Sent</SelectItem>
              <SelectItem value="Confirmed">Confirmed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} className="gap-1.5">
            <FileDown className="h-4 w-4" /> Export Excel (CSV)
          </Button>
          <Button
            onClick={() => {
              setDuplicateFrom(null);
              setNewOrderOpen(true);
            }}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> New Order
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Wholesaler</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Delivery</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No wholesale orders yet.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">
                  <button className="hover:underline" onClick={() => setDetailsId(o.id)}>
                    {o.number}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{o.createdAt}</TableCell>
                <TableCell>{o.wholesalerName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColor[o.status]}>
                    {o.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {currency} {o.total.toFixed(2)}
                </TableCell>
                <TableCell className="text-muted-foreground">{o.paymentStatus}</TableCell>
                <TableCell className="text-muted-foreground">{o.deliveryStatus}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailsId(o.id)}>
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      title="Duplicate / Reorder"
                      onClick={() => {
                        setDuplicateFrom(o);
                        setNewOrderOpen(true);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {newOrderOpen && (
        <NewOrderDialog
          open={newOrderOpen}
          onOpenChange={setNewOrderOpen}
          duplicateFrom={duplicateFrom}
        />
      )}
      {detailsOrder && (
        <OrderDetailsDialog order={detailsOrder} onClose={() => setDetailsId(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Order — product cart builder
// ---------------------------------------------------------------------------

type CartLine = { product: Product; qty: number };

function NewOrderDialog({
  open,
  onOpenChange,
  duplicateFrom,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  duplicateFrom: WholesaleOrder | null;
}) {
  const products = useProducts();
  useProductsPolling();
  const categories = useCategories();
  const wholesalers = useWholesalers().filter((w) => w.active);
  const settings = useSettings();
  const currency = settings.general.currency;

  const [wholesalerId, setWholesalerId] = useState(duplicateFrom?.wholesalerId ?? "");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>(() => {
    if (!duplicateFrom) return [];
    return duplicateFrom.items
      .map((i) => {
        const product = products.find((p) => p.id === i.productId);
        return product ? { product, qty: i.qty } : null;
      })
      .filter((l): l is CartLine => l !== null);
  });
  const [discount, setDiscount] = useState(duplicateFrom?.discount ?? 0);
  const [notes, setNotes] = useState(duplicateFrom?.notes ?? "");

  const filteredProducts = products.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.sku ?? "").toLowerCase().includes(query.toLowerCase()) ||
        (p.barcode ?? "").includes(query)),
  );

  function wholesalePrice(p: Product) {
    return p.wholesalePrice ?? p.price;
  }

  function addToCart(product: Product) {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id);
      if (existing) {
        const newQty = existing.qty + 1;
        if (newQty > product.stock) {
          toast.warning(`Only ${product.stock} of "${product.name}" in stock`);
        }
        return c.map((l) => (l.product.id === product.id ? { ...l, qty: newQty } : l));
      }
      if (product.stock < LOW_STOCK_THRESHOLD()) {
        toast.warning(`"${product.name}" is low on stock (${product.stock} left)`);
      }
      return [...c, { product, qty: 1 }];
    });
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((c) => c.filter((l) => l.product.id !== productId));
      return;
    }
    setCart((c) => c.map((l) => (l.product.id === productId ? { ...l, qty } : l)));
  }

  const subtotal = cart.reduce((s, l) => s + wholesalePrice(l.product) * l.qty, 0);
  const gst = Math.max(0, subtotal - discount) * (settings.tax.gstPercent / 100);
  const total = Math.max(0, subtotal - discount) + gst;

  function buildItems(): WholesaleOrderItem[] {
    return cart.map((l) => ({
      productId: l.product.id,
      name: l.product.name,
      price: wholesalePrice(l.product),
      qty: l.qty,
    }));
  }

  function saveOrder(submit: boolean) {
    const wholesaler = wholesalers.find((w) => w.id === wholesalerId);
    if (!wholesaler) {
      toast.error("Select a wholesaler");
      return;
    }
    if (cart.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    const order = wholesaleOrdersStore.create({
      wholesalerId: wholesaler.id,
      wholesalerName: wholesaler.name,
      items: buildItems(),
      subtotal,
      discount,
      gst,
      total,
      notes,
      submit,
    });
    toast.success(`Order ${order.number} ${submit ? "submitted" : "saved as draft"}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>New Wholesale Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>
            <span className="text-destructive">*</span> Wholesaler
          </Label>
          <Select value={wholesalerId} onValueChange={setWholesalerId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a wholesaler" />
            </SelectTrigger>
            <SelectContent>
              {wholesalers.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                  {w.companyName ? ` (${w.companyName})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, SKU, or barcode..."
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-36">
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
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.name}
                        {p.sku && <span className="block text-xs text-muted-foreground">SKU {p.sku}</span>}
                      </TableCell>
                      <TableCell>
                        {currency} {wholesalePrice(p).toFixed(2)}
                        {p.wholesalePrice != null && (
                          <span className="ml-1 text-xs text-muted-foreground line-through">
                            {p.price.toFixed(2)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={p.stock < LOW_STOCK_THRESHOLD() ? "text-destructive" : ""}>
                        {p.stock}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => addToCart(p)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">Cart</p>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Cart is empty
                      </TableCell>
                    </TableRow>
                  )}
                  {cart.map((l) => (
                    <TableRow key={l.product.id}>
                      <TableCell className="font-medium">{l.product.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setQty(l.product.id, l.qty - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            value={l.qty}
                            onChange={(e) => setQty(l.product.id, parseInt(e.target.value, 10) || 0)}
                            className="h-7 w-12 text-center"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setQty(l.product.id, l.qty + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{(wholesalePrice(l.product) * l.qty).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setQty(l.product.id, 0)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>
                  {currency} {subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount</span>
                <Input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                  className="h-7 w-24 text-right"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{settings.tax.gstLabel} @ {settings.tax.gstPercent}%</span>
                <span>
                  {currency} {gst.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-bold">
                <span>Grand Total</span>
                <span>
                  {currency} {total.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => saveOrder(false)}>
            Save as Draft
          </Button>
          <Button onClick={() => saveOrder(true)}>Submit Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Order details — view, confirm/cancel, WhatsApp/Email, print
// ---------------------------------------------------------------------------

function buildOrderMessage(order: WholesaleOrder, currency: string): string {
  const lines = [
    `Order ${order.number}`,
    `Date: ${order.createdAt}`,
    `Wholesaler: ${order.wholesalerName}`,
    "",
    "Items:",
    ...order.items.map(
      (i) => `- ${i.name} x${i.qty} @ ${currency} ${i.price.toFixed(2)} = ${currency} ${(i.price * i.qty).toFixed(2)}`,
    ),
    "",
    `Subtotal: ${currency} ${order.subtotal.toFixed(2)}`,
    `Discount: ${currency} ${order.discount.toFixed(2)}`,
    `Tax: ${currency} ${order.gst.toFixed(2)}`,
    `Total: ${currency} ${order.total.toFixed(2)}`,
  ];
  if (order.notes.trim()) lines.push("", `Notes: ${order.notes.trim()}`);
  return lines.join("\n");
}

function OrderDetailsDialog({ order, onClose }: { order: WholesaleOrder; onClose: () => void }) {
  const wholesalers = useWholesalers();
  const settings = useSettings();
  const currency = settings.general.currency;
  const canApprove = useHasPermission("wholesale.approve");
  const wholesaler = wholesalers.find((w) => w.id === order.wholesalerId);

  function sendWhatsApp() {
    const digits = (wholesaler?.whatsapp || "").replace(/\D/g, "");
    if (!digits) {
      toast.error("This wholesaler has no WhatsApp number saved");
      return;
    }
    const text = encodeURIComponent(buildOrderMessage(order, currency));
    window.open(`https://wa.me/${digits}?text=${text}`, "_blank", "noopener,noreferrer");
  }

  function sendEmail() {
    if (!wholesaler?.email) {
      toast.error("This wholesaler has no email address saved");
      return;
    }
    const subject = encodeURIComponent(`Order ${order.number} — ${order.wholesalerName}`);
    const body = encodeURIComponent(buildOrderMessage(order, currency));
    window.location.href = `mailto:${wholesaler.email}?subject=${subject}&body=${body}`;
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order {order.number}</DialogTitle>
        </DialogHeader>

        <div className="report-print-area space-y-4">
          <div className="hidden print:block">
            <p className="text-lg font-bold text-black">Wholesale Order {order.number}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Wholesaler</p>
              <p className="font-medium text-foreground">{order.wholesalerName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium text-foreground">{order.createdAt}</p>
            </div>
            <div>
              <Badge variant="outline" className={statusColor[order.status]}>
                {order.status}
              </Badge>
            </div>
          </div>

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
              {order.items.map((i) => (
                <TableRow key={i.productId}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell>{i.qty}</TableCell>
                  <TableCell>
                    {currency} {i.price.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    {currency} {(i.price * i.qty).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="space-y-0.5 text-right text-sm">
            <p className="text-muted-foreground">
              Subtotal: {currency} {order.subtotal.toFixed(2)}
            </p>
            <p className="text-muted-foreground">
              Discount: {currency} {order.discount.toFixed(2)}
            </p>
            <p className="text-muted-foreground">
              {settings.tax.gstLabel}: {currency} {order.gst.toFixed(2)}
            </p>
            <p className="text-base font-bold text-foreground">
              Grand Total: {currency} {order.total.toFixed(2)}
            </p>
          </div>

          {order.notes && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Notes: </span>
              {order.notes}
            </p>
          )}

          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground print:hidden">
            <span>Payment: {order.paymentStatus}</span>
            <span>·</span>
            <span>Delivery: {order.deliveryStatus}</span>
          </div>
        </div>

        <DialogFooter className="flex-wrap justify-between gap-2 sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={sendWhatsApp}>
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={sendEmail}>
              <Mail className="h-3.5 w-3.5" /> Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.paymentStatus === "Pending" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  wholesaleOrdersStore.setPaymentStatus(order.id, "Paid");
                  toast.success(`Order ${order.number} marked Paid`);
                }}
              >
                Mark Paid
              </Button>
            )}
            {order.deliveryStatus === "Pending" && order.status === "Confirmed" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  wholesaleOrdersStore.setDeliveryStatus(order.id, "Delivered");
                  toast.success(`Order ${order.number} marked Delivered`);
                }}
              >
                Mark Delivered
              </Button>
            )}
            {canApprove && (order.status === "Draft" || order.status === "Sent") && (
              <Button
                size="sm"
                onClick={async () => {
                  const result = await wholesaleOrdersStore.confirm(order.id);
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(`Order ${order.number} confirmed — stock updated`);
                }}
              >
                Confirm Order
              </Button>
            )}
            {canApprove && order.status !== "Confirmed" && order.status !== "Cancelled" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  wholesaleOrdersStore.cancel(order.id);
                  toast(`Order ${order.number} cancelled`);
                }}
              >
                Cancel Order
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
