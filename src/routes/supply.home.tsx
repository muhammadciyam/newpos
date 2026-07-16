import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { DhiposSupplyLogo } from "@/components/dhipos-supply-logo";
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
  Store,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Phone,
  MapPin,
  BookOpen,
  Search,
  Truck,
  CreditCard,
  CircleCheck,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSuppliers, suppliersStore, type Supplier, type SupplierCategory } from "@/lib/suppliers-store";
import { useCurrentUser } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

// Supplier management (add/edit/delete/enable-disable) is restricted to this one email,
// independent of the app's Role/Permission system — everyone else can only browse.
const SUPPLY_ADMIN_EMAIL = "siyante003@gmail.com";

export const Route = createFileRoute("/supply/home")({
  head: () => ({
    meta: [
      { title: "Supply — Dhipos" },
      { name: "description", content: "Connect with wholesale suppliers and browse their catalogues." },
    ],
  }),
  component: SupplyHomePage,
});

const PAYMENT_METHOD_OPTIONS = ["Cash On Delivery", "Card On Delivery", "Pay on Pickup"];

const emptyForm = {
  name: "",
  subtitle: "",
  logoUrl: "",
  bannerUrl: "",
  description: "",
  phone: "",
  address: "",
  openNow: true,
  deliveryAvailable: false,
  pickupAvailable: false,
  paymentMethods: [] as string[],
  categories: [] as SupplierCategory[],
  active: true,
};

const avatarColors = ["#dc2626", "#2563eb", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function SupplyHomePage() {
  const currentUser = useCurrentUser();
  if (!currentUser) return <RestrictedPage />;

  const canManage = (currentUser.email ?? "").trim().toLowerCase() === SUPPLY_ADMIN_EMAIL;
  const suppliers = useSuppliers();
  const visible = canManage ? suppliers : suppliers.filter((s) => s.active);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [catalogueSupplier, setCatalogueSupplier] = useState<Supplier | null>(null);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      subtitle: s.subtitle,
      logoUrl: s.logoUrl,
      bannerUrl: s.bannerUrl,
      description: s.description,
      phone: s.phone,
      address: s.address,
      openNow: s.openNow,
      deliveryAvailable: s.deliveryAvailable,
      pickupAvailable: s.pickupAvailable,
      paymentMethods: s.paymentMethods,
      categories: s.categories,
      active: s.active,
    });
    setOpen(true);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, logoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, bannerUrl: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function togglePaymentMethod(method: string) {
    setForm((f) => ({
      ...f,
      paymentMethods: f.paymentMethods.includes(method)
        ? f.paymentMethods.filter((m) => m !== method)
        : [...f.paymentMethods, method],
    }));
  }

  function addCategory() {
    setForm((f) => ({
      ...f,
      categories: [...f.categories, { id: `cat-${Date.now()}`, name: "", imageUrl: "" }],
    }));
  }

  function updateCategory(id: string, patch: Partial<SupplierCategory>) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }

  function removeCategory(id: string) {
    setForm((f) => ({ ...f, categories: f.categories.filter((c) => c.id !== id) }));
  }

  function categoryImageUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateCategory(id, { imageUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  function save() {
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    const payload = {
      name: form.name.trim(),
      subtitle: form.subtitle.trim(),
      logoUrl: form.logoUrl,
      bannerUrl: form.bannerUrl,
      description: form.description.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      openNow: form.openNow,
      deliveryAvailable: form.deliveryAvailable,
      pickupAvailable: form.pickupAvailable,
      paymentMethods: form.paymentMethods,
      categories: form.categories
        .map((c) => ({ ...c, name: c.name.trim() }))
        .filter((c) => c.name),
      active: form.active,
    };
    if (editingId) {
      suppliersStore.update(editingId, payload);
      toast.success(`"${payload.name}" updated`);
    } else {
      suppliersStore.create(payload);
      toast.success(`"${payload.name}" added`);
    }
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center gap-2.5 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
            <DhiposSupplyLogo className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">Dhipos Supply</p>
            <p className="truncate text-[11px] text-primary-foreground/70">
              Connect with suppliers and reorder inventory
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-foreground">Suppliers</h2>
          {canManage && (
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Supplier
            </Button>
          )}
        </div>

        {visible.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Store className="h-8 w-8" />
            <p>{canManage ? "No suppliers yet — add one to get started." : "No suppliers are listed yet."}</p>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start gap-3">
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
                    style={{ backgroundColor: avatarColor(s.name) }}
                  >
                    {initials(s.name) || "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-foreground">{s.name}</p>
                    {canManage && !s.active && (
                      <Badge variant="outline" className="bg-muted">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {s.subtitle && <p className="text-xs text-muted-foreground">{s.subtitle}</p>}
                </div>
              </div>

              {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}

              <div className="space-y-1 text-sm text-muted-foreground">
                {s.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> {s.phone}
                  </p>
                )}
                {s.address && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" /> {s.address}
                  </p>
                )}
              </div>

              <Button className="mt-1 gap-1.5" onClick={() => setCatalogueSupplier(s)}>
                <BookOpen className="h-4 w-4" /> View Catalogue
              </Button>

              {canManage && (
                <div className="flex justify-end gap-2 border-t border-border pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      suppliersStore.setActive(s.id, !s.active);
                      toast.success(`"${s.name}" ${s.active ? "disabled" : "enabled"}`);
                    }}
                  >
                    {s.active ? "Disable" : "Enable"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This removes the supplier from the directory. This can't be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            suppliersStore.remove(s.id);
                            toast.success(`"${s.name}" deleted`);
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Add / Edit Supplier */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                <img src={form.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white"
                  style={{ backgroundColor: avatarColor(form.name || "?") }}
                >
                  {initials(form.name) || "?"}
                </div>
              )}
              <div>
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Upload Logo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">Optional — initials are shown otherwise.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Catalogue Banner</Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                  {form.bannerUrl ? (
                    <img src={form.bannerUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div>
                  <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => bannerInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> Upload Banner
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">Shown at the top of the catalogue panel.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Supplier Name
                </Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Subtitle</Label>
                <Input
                  value={form.subtitle}
                  onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                  placeholder="e.g. by Red Brothers Pvt Ltd"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this supplier offers"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <Label className="text-xs">Open Now</Label>
                  <Switch checked={form.openNow} onCheckedChange={(v) => setForm((f) => ({ ...f, openNow: v }))} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <Label className="text-xs">Delivery</Label>
                  <Switch
                    checked={form.deliveryAvailable}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, deliveryAvailable: v }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <Label className="text-xs">Pickup</Label>
                  <Switch
                    checked={form.pickupAvailable}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, pickupAvailable: v }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Payment Methods</Label>
                <div className="flex flex-wrap gap-2">
                  {PAYMENT_METHOD_OPTIONS.map((method) => {
                    const selected = form.paymentMethods.includes(method);
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => togglePaymentMethod(method)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {method}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Shop Categories</Label>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCategory}>
                    <Plus className="h-3.5 w-3.5" /> Add Category
                  </Button>
                </div>
                {form.categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Shown as tiles in this supplier's "Shop" tab. None added yet.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {form.categories.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-muted">
                        {c.imageUrl ? (
                          <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => categoryImageUpload(c.id, e)}
                        />
                      </label>
                      <Input
                        value={c.name}
                        onChange={(e) => updateCategory(c.id, { name: e.target.value })}
                        placeholder="e.g. Basmati Rice"
                        className="h-9"
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeCategory(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label>Active (visible in directory)</Label>
                <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save}>{editingId ? "Save Changes" : "Add Supplier"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CatalogueSheet supplier={catalogueSupplier} onClose={() => setCatalogueSupplier(null)} />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Catalogue panel — Shop (categories) / About (status, delivery, payment)
// ---------------------------------------------------------------------------

function CatalogueSheet({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [query, setQuery] = useState("");

  const categories = (supplier?.categories ?? []).filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Sheet open={!!supplier} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {supplier && (
          <>
            <div className="relative h-36 w-full">
              {supplier.bannerUrl ? (
                <img src={supplier.bannerUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full" style={{ backgroundColor: avatarColor(supplier.name) }} />
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent p-4 pt-10">
                {supplier.logoUrl ? (
                  <img src={supplier.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border border-white/40 object-cover" />
                ) : (
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                    style={{ backgroundColor: avatarColor(supplier.name) }}
                  >
                    {initials(supplier.name) || "?"}
                  </div>
                )}
                <div>
                  <p className="font-bold leading-tight text-white">{supplier.name}</p>
                  <span className="flex items-center gap-1 text-xs text-white/90">
                    <span className={cn("h-1.5 w-1.5 rounded-full", supplier.openNow ? "bg-emerald-400" : "bg-white/50")} />
                    {supplier.openNow ? "Open now" : "Currently closed"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${supplier.name}...`}
                  className="pl-9"
                />
              </div>

              <Tabs defaultValue="shop">
                <TabsList>
                  <TabsTrigger value="shop">Shop</TabsTrigger>
                  <TabsTrigger value="about">About</TabsTrigger>
                </TabsList>

                <TabsContent value="shop" className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-foreground">Shop by category</p>
                  {categories.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      {supplier.categories.length === 0
                        ? "This supplier hasn't published a catalogue yet. Contact them directly using the About tab."
                        : "No categories match your search."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {categories.map((c) => (
                        <div key={c.id} className="flex flex-col gap-1.5">
                          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                            {c.imageUrl ? (
                              <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <ImageIcon className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="about" className="mt-4 flex flex-col gap-3">
                  {supplier.description && <p className="text-sm text-muted-foreground">{supplier.description}</p>}

                  <AboutRow
                    icon={<CircleCheck className="h-4 w-4" />}
                    label="Status"
                    value={supplier.openNow ? "Open now" : "Currently closed"}
                    tone={supplier.openNow ? "positive" : "neutral"}
                  />
                  <AboutRow
                    icon={<Truck className="h-4 w-4" />}
                    label="Delivery"
                    value={supplier.deliveryAvailable ? "Available" : "Not available"}
                    tone={supplier.deliveryAvailable ? "positive" : "neutral"}
                  />
                  <AboutRow
                    icon={<Store className="h-4 w-4" />}
                    label="Pickup"
                    value={supplier.pickupAvailable ? "Available" : "Not available"}
                    tone={supplier.pickupAvailable ? "positive" : "neutral"}
                  />
                  <AboutRow
                    icon={<CreditCard className="h-4 w-4" />}
                    label="Payment"
                    value={supplier.paymentMethods.length > 0 ? supplier.paymentMethods.join(" · ") : "Not specified"}
                    tone="neutral"
                  />

                  <div className="space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                    {supplier.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {supplier.phone}
                      </p>
                    )}
                    {supplier.address && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {supplier.address}
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AboutRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "positive" | "neutral";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          tone === "positive" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
