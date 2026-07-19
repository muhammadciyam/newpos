import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DhiposWholesalerLogo } from "@/components/dhipos-wholesaler-logo";
import { WholesaleProductImportDialog } from "@/components/wholesale-product-import-dialog";
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
  Maximize2,
  Minimize2,
  ShoppingCart,
  Warehouse,
  Minus,
  History,
  MessageCircle,
  MessageSquare,
  LogIn,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useWholesalers,
  wholesalersStore,
  type Wholesaler,
  type WholesalerCategory,
  type WholesalerProduct,
  type WholesalerProductSizeUnit,
} from "@/lib/wholesalers-store";
import {
  useWholesaleInventory,
  wholesaleInventoryStore,
  type WholesaleInventoryItem,
} from "@/lib/wholesale-inventory-store";
import { useCart, cartStore, type CartItem } from "@/lib/cart-store";
import { useWholesaleOrders, wholesaleOrdersStore } from "@/lib/wholesale-orders-store";
import { authStore, useCurrentUser } from "@/lib/auth-store";
import { findProductPhoto } from "@/lib/product-photo-search";
import { logAudit } from "@/lib/audit-log-store";
import { cn } from "@/lib/utils";

// Wholesaler management (add/edit/delete/enable-disable) is restricted to this one email,
// independent of the app's Role/Permission system — everyone else can only browse.
const SUPPLY_ADMIN_EMAIL = "siyante003@gmail.com";

export const Route = createFileRoute("/supply/home")({
  head: () => ({
    meta: [
      { title: "Wholesaler — Dhipos" },
      { name: "description", content: "Connect with wholesalers and browse their catalogues." },
    ],
  }),
  component: WholesalerHomePage,
});

const PAYMENT_METHOD_OPTIONS = ["Cash On Delivery", "Card On Delivery", "Pay on Pickup"];

// Sentinel Select value for "+ New Category" in the standalone Add Product dialog —
// distinct from any real category id (which are all `cat-<timestamp>`).
const NEW_CATEGORY_VALUE = "__new__";

const emptyForm = {
  name: "",
  subtitle: "",
  logoUrl: "",
  bannerUrl: "",
  description: "",
  phone: "",
  email: "",
  address: "",
  openNow: true,
  deliveryAvailable: false,
  pickupAvailable: false,
  paymentMethods: [] as string[],
  categories: [] as WholesalerCategory[],
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

// wa.me click-to-chat links need digits only (no "+", spaces, or dashes) in the phone part.
function buildWhatsAppLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

// Viber's chat deep link wants the number in +<countrycode><number> form. Unlike wa.me,
// Viber's URI scheme has no documented way to pre-fill message text for a direct-number
// chat — it can only open the conversation, not compose the message for you.
function buildViberLink(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `viber://chat?number=%2B${digitsOnly}`;
}

// sms: opens the device's native SMS app with the number and message pre-filled — only
// works on a device with SMS capability (a phone), not most desktop browsers.
function buildSmsLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `sms:${digitsOnly}?body=${encodeURIComponent(message)}`;
}

type OrderNotifyGroup = {
  wholesalerId: string;
  wholesalerName: string;
  phone: string;
  whatsAppUrl: string;
  viberUrl: string;
  smsUrl: string;
};

function WholesalerHomePage() {
  const currentUser = useCurrentUser();
  const wholesalers = useWholesalers();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [catalogueWholesalerId, setCatalogueWholesalerId] = useState<string | null>(null);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [productImportOpen, setProductImportOpen] = useState(false);
  const [productWholesalerId, setProductWholesalerId] = useState("");
  const [productCategoryId, setProductCategoryId] = useState("");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productPackingDetails, setProductPackingDetails] = useState("");
  const [productSize, setProductSize] = useState("");
  const [productSizeUnit, setProductSizeUnit] = useState<WholesalerProductSizeUnit>("kg");
  const [productNewCategoryName, setProductNewCategoryName] = useState("");
  const productImageInputRef = useRef<HTMLInputElement>(null);

  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [orderNotifyGroups, setOrderNotifyGroups] = useState<OrderNotifyGroup[]>([]);

  const wholesaleOrders = useWholesaleOrders();
  const [orderHistoryOpen, setOrderHistoryOpen] = useState(false);

  const wholesaleInventory = useWholesaleInventory();
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [editingInventoryId, setEditingInventoryId] = useState<string | null>(null);
  const [inventoryWholesalerId, setInventoryWholesalerId] = useState("");
  const [inventoryProductPickId, setInventoryProductPickId] = useState("");
  const [inventoryProductName, setInventoryProductName] = useState("");
  const [inventoryQty, setInventoryQty] = useState("");
  const [inventoryPrice, setInventoryPrice] = useState("");

  if (!currentUser) return <RestrictedPage />;

  const canManage = (currentUser.email ?? "").trim().toLowerCase() === SUPPLY_ADMIN_EMAIL;
  const visible = canManage ? wholesalers : wholesalers.filter((s) => s.active);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

  async function addToCart(wholesaler: Wholesaler, product: WholesalerProduct) {
    const result = await cartStore.addToCart(wholesaler, product);
    if ("error" in result) toast.error(result.error);
    else toast.success(`"${product.name}" added to cart`);
  }

  async function setCartQty(productId: string, qty: number) {
    const result = await cartStore.setQty(productId, qty);
    if ("error" in result) toast.error(result.error);
  }

  async function removeFromCart(productId: string) {
    const result = await cartStore.remove(productId);
    if ("error" in result) toast.error(result.error);
  }

  async function clearCart() {
    const result = await cartStore.clear();
    if ("error" in result) toast.error(result.error);
  }

  async function placeOrder() {
    if (cart.length === 0) return;
    const result = await wholesaleOrdersStore.create(cart);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    // Group by wholesaler so each one only gets notified about their own items — a cart
    // can span multiple wholesalers at once.
    const groups = new Map<string, CartItem[]>();
    for (const item of cart) {
      groups.set(item.wholesalerId, [...(groups.get(item.wholesalerId) ?? []), item]);
    }
    const notifyGroups: OrderNotifyGroup[] = [];
    for (const [wholesalerId, items] of groups) {
      const wholesaler = wholesalers.find((w) => w.id === wholesalerId);
      if (!wholesaler) continue;

      // Ordering deducts from available stock — mirrors what Wholesale Inventory shows,
      // so both stay in sync with what was actually just ordered.
      const orderedQtyByProductId = new Map(items.map((i) => [i.productId, i.qty]));
      const categories = wholesaler.categories.map((c) => ({
        ...c,
        products: c.products.map((p) => {
          const orderedQty = orderedQtyByProductId.get(p.id);
          return orderedQty == null ? p : { ...p, stockQty: Math.max(0, p.stockQty - orderedQty) };
        }),
      }));
      const stockResult = await wholesalersStore.update(wholesalerId, { categories });
      if ("error" in stockResult) toast.error(stockResult.error);

      for (const invItem of wholesaleInventory) {
        if (invItem.wholesalerId !== wholesalerId || !invItem.productId) continue;
        const orderedQty = orderedQtyByProductId.get(invItem.productId);
        if (orderedQty == null) continue;
        const invResult = await wholesaleInventoryStore.update(invItem.id, {
          qty: Math.max(0, invItem.qty - orderedQty),
        });
        if ("error" in invResult) toast.error(invResult.error);
      }

      if (!wholesaler.phone) continue;
      const lines = items.map((i) => `${i.qty} x ${i.productName} — ${i.price.toFixed(2)} each`);
      const total = items.reduce((sum, i) => sum + i.qty * i.price, 0);
      const message = [`New order from Dhipos:`, ...lines, `Total: ${total.toFixed(2)}`].join("\n");
      notifyGroups.push({
        wholesalerId,
        wholesalerName: wholesaler.name,
        phone: wholesaler.phone,
        whatsAppUrl: buildWhatsAppLink(wholesaler.phone, message),
        viberUrl: buildViberLink(wholesaler.phone),
        smsUrl: buildSmsLink(wholesaler.phone, message),
      });
    }
    setOrderNotifyGroups(notifyGroups);

    const clearResult = await cartStore.clear();
    if ("error" in clearResult) toast.error(clearResult.error);
    toast.success("Order placed");
  }

  function openAddInventoryItem() {
    setEditingInventoryId(null);
    setInventoryWholesalerId("");
    setInventoryProductPickId("");
    setInventoryProductName("");
    setInventoryQty("");
    setInventoryPrice("");
  }

  function openEditInventoryItem(item: WholesaleInventoryItem) {
    setEditingInventoryId(item.id);
    setInventoryWholesalerId(item.wholesalerId);
    setInventoryProductPickId(item.productId ?? "");
    setInventoryProductName(item.productName);
    setInventoryQty(String(item.qty));
    setInventoryPrice(String(item.price));
  }

  function pickInventoryProduct(productId: string, wholesaler: Wholesaler) {
    setInventoryProductPickId(productId);
    for (const category of wholesaler.categories) {
      const product = category.products.find((p) => p.id === productId);
      if (product) {
        setInventoryProductName(product.name);
        setInventoryPrice(String(product.price));
        return;
      }
    }
  }

  async function submitInventoryItem() {
    const wholesaler = wholesalers.find((w) => w.id === inventoryWholesalerId);
    if (!wholesaler) {
      toast.error("Choose a wholesaler");
      return;
    }
    if (!inventoryProductName.trim()) {
      toast.error("Product name is required");
      return;
    }
    const payload = {
      wholesalerId: wholesaler.id,
      wholesalerName: wholesaler.name,
      productName: inventoryProductName.trim(),
      qty: parseFloat(inventoryQty) || 0,
      price: parseFloat(inventoryPrice) || 0,
      productId: inventoryProductPickId || undefined,
    };
    const result = editingInventoryId
      ? await wholesaleInventoryStore.update(editingInventoryId, payload)
      : await wholesaleInventoryStore.create(payload);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    // Wholesale Inventory is the only place a product's stockQty is ever set — when this
    // entry is linked to an existing catalogue product, push the qty onto it directly.
    if (inventoryProductPickId) {
      const categories = wholesaler.categories.map((c) => ({
        ...c,
        products: c.products.map((p) =>
          p.id === inventoryProductPickId ? { ...p, stockQty: payload.qty } : p,
        ),
      }));
      const stockResult = await wholesalersStore.update(wholesaler.id, { categories });
      if ("error" in stockResult) toast.error(stockResult.error);
    }

    toast.success(`"${payload.productName}" ${editingInventoryId ? "updated" : "added"}`);
    openAddInventoryItem();
  }

  async function removeInventoryItem(id: string) {
    const result = await wholesaleInventoryStore.remove(id);
    if ("error" in result) toast.error(result.error);
    else toast.success("Removed from Wholesale Inventory");
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(s: Wholesaler) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      subtitle: s.subtitle,
      logoUrl: s.logoUrl,
      bannerUrl: s.bannerUrl,
      description: s.description,
      phone: s.phone,
      email: s.email,
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
      categories: [
        ...f.categories,
        { id: `cat-${Date.now()}`, name: "", imageUrl: "", products: [] },
      ],
    }));
  }

  function updateCategory(id: string, patch: Partial<WholesalerCategory>) {
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

  function addProduct(categoryId: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              products: [
                ...c.products,
                {
                  id: `prod-${Date.now()}`,
                  name: "",
                  price: 0,
                  imageUrl: "",
                  packingDetails: "",
                  size: 0,
                  sizeUnit: "kg",
                  stockQty: 0,
                },
              ],
            }
          : c,
      ),
    }));
  }

  function updateProduct(categoryId: string, productId: string, patch: Partial<WholesalerProduct>) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c) =>
        c.id === categoryId
          ? { ...c, products: c.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)) }
          : c,
      ),
    }));
  }

  function removeProduct(categoryId: string, productId: string) {
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c) =>
        c.id === categoryId ? { ...c, products: c.products.filter((p) => p.id !== productId) } : c,
      ),
    }));
  }

  function productImageUpload(
    categoryId: string,
    productId: string,
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      updateProduct(categoryId, productId, { imageUrl: reader.result as string });
    reader.readAsDataURL(file);
  }

  function openAddProduct() {
    setProductWholesalerId("");
    setProductCategoryId("");
    setProductName("");
    setProductPrice("");
    setProductImageUrl("");
    setProductPackingDetails("");
    setProductSize("");
    setProductSizeUnit("kg");
    setProductNewCategoryName("");
    setProductDialogOpen(true);
  }

  function handleProductImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProductImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  const productWholesaler = wholesalers.find((w) => w.id === productWholesalerId) ?? null;

  async function submitStandaloneProduct() {
    if (!productWholesaler) {
      toast.error("Choose a wholesaler");
      return;
    }
    const creatingNewCategory = productCategoryId === NEW_CATEGORY_VALUE;
    if (!productCategoryId) {
      toast.error("Choose a category");
      return;
    }
    if (creatingNewCategory && !productNewCategoryName.trim()) {
      toast.error("New category name is required");
      return;
    }
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }
    const name = productName.trim();
    setSubmittingProduct(true);
    const imageUrl = productImageUrl || (await findProductPhoto(name));
    const newProduct: WholesalerProduct = {
      id: `prod-${Date.now()}`,
      name,
      price: parseFloat(productPrice) || 0,
      imageUrl,
      packingDetails: productPackingDetails.trim(),
      size: parseFloat(productSize) || 0,
      sizeUnit: productSizeUnit,
      // Stock is only ever set/updated via Wholesale Inventory (see submitInventoryItem) —
      // new products always start at zero.
      stockQty: 0,
    };
    const categories = creatingNewCategory
      ? [
          ...productWholesaler.categories,
          {
            id: `cat-${Date.now()}`,
            name: productNewCategoryName.trim(),
            imageUrl: "",
            products: [newProduct],
          },
        ]
      : productWholesaler.categories.map((c) =>
          c.id === productCategoryId ? { ...c, products: [...c.products, newProduct] } : c,
        );
    const result = await wholesalersStore.update(productWholesaler.id, { categories });
    setSubmittingProduct(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${newProduct.name}" added to ${productWholesaler.name}`);
    setProductDialogOpen(false);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Wholesaler name is required");
      return;
    }
    const name = form.name.trim();
    const phone = form.phone.trim();
    const duplicate = wholesalers.find(
      (w) =>
        w.id !== editingId &&
        (w.name.trim().toLowerCase() === name.toLowerCase() || (phone && w.phone.trim() === phone)),
    );
    if (duplicate) {
      toast.error(
        duplicate.name.trim().toLowerCase() === name.toLowerCase()
          ? `A wholesaler named "${duplicate.name}" already exists`
          : `Phone number already used by "${duplicate.name}"`,
      );
      return;
    }
    const payload = {
      name,
      subtitle: form.subtitle.trim(),
      logoUrl: form.logoUrl,
      bannerUrl: form.bannerUrl,
      description: form.description.trim(),
      phone,
      email: form.email.trim(),
      address: form.address.trim(),
      openNow: form.openNow,
      deliveryAvailable: form.deliveryAvailable,
      pickupAvailable: form.pickupAvailable,
      paymentMethods: form.paymentMethods,
      categories: form.categories
        .map((c) => ({
          ...c,
          name: c.name.trim(),
          products: c.products
            .map((p) => ({ ...p, name: p.name.trim(), packingDetails: p.packingDetails.trim() }))
            .filter((p) => p.name),
        }))
        .filter((c) => c.name),
      active: form.active,
    };
    const result = editingId
      ? await wholesalersStore.update(editingId, payload)
      : await wholesalersStore.create(payload);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${payload.name}" ${editingId ? "updated" : "added"}`);
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15">
              <DhiposWholesalerLogo className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight">Dhipos Wholesaler</p>
              <p className="truncate text-[11px] text-primary-foreground/70">
                Connect with wholesalers and reorder inventory
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="relative gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingCart className="h-4 w-4" /> Cart
              {cartCount > 0 && (
                <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full border-2 border-primary px-1">
                  {cartCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="secondary"
              className="gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              onClick={() => setOrderHistoryOpen(true)}
            >
              <History className="h-4 w-4" /> Order History
            </Button>
            {canManage && (
              <>
                <Button
                  variant="secondary"
                  className="gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  onClick={() => {
                    openAddInventoryItem();
                    setInventoryOpen(true);
                  }}
                >
                  <Warehouse className="h-4 w-4" /> Wholesale Inventory
                </Button>
                <Button
                  variant="secondary"
                  className="gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  onClick={openAddProduct}
                >
                  <Plus className="h-4 w-4" /> Add Product
                </Button>
                <Button
                  variant="secondary"
                  className="gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  onClick={() => setProductImportOpen(true)}
                >
                  <Upload className="h-4 w-4" /> Import Products
                </Button>
                <Button
                  variant="secondary"
                  className="gap-1.5 rounded-full font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4" /> Add Wholesaler
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-foreground">Wholesalers</h2>
        </div>

        {visible.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Store className="h-8 w-8" />
            <p>
              {canManage
                ? "No wholesalers yet — add one to get started."
                : "No wholesalers are listed yet."}
            </p>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3 p-5">
              <div className="flex items-start gap-3">
                {s.logoUrl ? (
                  <img
                    src={s.logoUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
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

              <Button className="mt-1 gap-1.5" onClick={() => setCatalogueWholesalerId(s.id)}>
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
                    onClick={async () => {
                      const result = await wholesalersStore.setActive(s.id, !s.active);
                      if ("error" in result) toast.error(result.error);
                      else toast.success(`"${s.name}" ${s.active ? "disabled" : "enabled"}`);
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
                        <AlertDialogDescription>
                          This removes the wholesaler from the directory. This can't be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            const result = await wholesalersStore.remove(s.id);
                            if ("error" in result) toast.error(result.error);
                            else toast.success(`"${s.name}" deleted`);
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

        {/* Add / Edit Wholesaler */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Wholesaler" : "Add Wholesaler"}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3">
              {form.logoUrl ? (
                <img
                  src={form.logoUrl}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover"
                />
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white"
                  style={{ backgroundColor: avatarColor(form.name || "?") }}
                >
                  {initials(form.name) || "?"}
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Logo
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Optional — initials are shown otherwise.
                </p>
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
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBannerUpload}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Banner
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shown at the top of the catalogue panel.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Wholesaler Name
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
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
                  placeholder="What this wholesaler offers"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="e.g. +60123456789"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="Used to notify on new orders"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <Label className="text-xs">Open Now</Label>
                  <Switch
                    checked={form.openNow}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, openNow: v }))}
                  />
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={addCategory}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Category
                  </Button>
                </div>
                {form.categories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Shown as tiles in this wholesaler's "Shop" tab. None added yet.
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {form.categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-2 rounded-lg border border-border p-2"
                    >
                      <div className="flex items-center gap-2">
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => removeCategory(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex flex-col gap-2 border-t border-border pl-4 pt-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Products</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => addProduct(c.id)}
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Product
                          </Button>
                        </div>
                        {c.products.length === 0 && (
                          <p className="text-xs text-muted-foreground">No products added yet.</p>
                        )}
                        {c.products.map((p) => (
                          <div
                            key={p.id}
                            className="flex flex-col gap-2 rounded-md border border-border p-2"
                          >
                            <div className="flex items-center gap-2">
                              <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md bg-muted">
                                {p.imageUrl ? (
                                  <img
                                    src={p.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => productImageUpload(c.id, p.id, e)}
                                />
                              </label>
                              <Input
                                value={p.name}
                                onChange={(e) =>
                                  updateProduct(c.id, p.id, { name: e.target.value })
                                }
                                placeholder="e.g. Basmati Rice"
                                className="h-9"
                              />
                              <Input
                                type="number"
                                value={p.price || ""}
                                onChange={(e) =>
                                  updateProduct(c.id, p.id, {
                                    price: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="Price"
                                className="h-9 w-24 shrink-0"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 shrink-0"
                                onClick={() => removeProduct(c.id, p.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 pl-11">
                              <Input
                                value={p.packingDetails}
                                onChange={(e) =>
                                  updateProduct(c.id, p.id, { packingDetails: e.target.value })
                                }
                                placeholder="Packing details (e.g. Box of 12)"
                                className="h-9"
                              />
                              <Input
                                type="number"
                                value={p.size || ""}
                                onChange={(e) =>
                                  updateProduct(c.id, p.id, {
                                    size: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="Size"
                                className="h-9 w-20 shrink-0"
                              />
                              <Select
                                value={p.sizeUnit}
                                onValueChange={(v) =>
                                  updateProduct(c.id, p.id, {
                                    sizeUnit: v as WholesalerProductSizeUnit,
                                  })
                                }
                              >
                                <SelectTrigger className="h-9 w-20 shrink-0">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="kg">kg</SelectItem>
                                  <SelectItem value="ml">ml</SelectItem>
                                </SelectContent>
                              </Select>
                              <span
                                className="flex h-9 w-24 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground"
                                title="Stock is only updated from Wholesale Inventory"
                              >
                                Stock: {p.stockQty}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label>Active (visible in directory)</Label>
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
              <Button onClick={save}>{editingId ? "Save Changes" : "Add Wholesaler"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Standalone Add Product — picks a wholesaler + one of its existing categories */}
        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Wholesaler
                </Label>
                <Select
                  value={productWholesalerId}
                  onValueChange={(v) => {
                    setProductWholesalerId(v);
                    setProductCategoryId("");
                    setProductNewCategoryName("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a wholesaler" />
                  </SelectTrigger>
                  <SelectContent>
                    {wholesalers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Category
                </Label>
                <Select
                  value={productCategoryId}
                  onValueChange={setProductCategoryId}
                  disabled={!productWholesaler}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productWholesaler?.categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_CATEGORY_VALUE}>
                      <span className="flex items-center gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> New Category
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {productCategoryId === NEW_CATEGORY_VALUE && (
                  <Input
                    value={productNewCategoryName}
                    onChange={(e) => setProductNewCategoryName(e.target.value)}
                    placeholder="New category name, e.g. Snacks"
                    className="mt-1.5"
                  />
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {productImageUrl ? (
                    <img src={productImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                  <input
                    ref={productImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProductImageUpload}
                  />
                </label>
                <div className="flex-1 space-y-1.5">
                  <Label>
                    <span className="text-destructive">*</span> Product Name
                  </Label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Basmati Rice"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Packing Details</Label>
                <Input
                  value={productPackingDetails}
                  onChange={(e) => setProductPackingDetails(e.target.value)}
                  placeholder="e.g. Box of 12"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-1.5">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Size</Label>
                  <Input
                    type="number"
                    value={productSize}
                    onChange={(e) => setProductSize(e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Unit</Label>
                  <Select
                    value={productSizeUnit}
                    onValueChange={(v) => setProductSizeUnit(v as WholesalerProductSizeUnit)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Stock starts at 0 — set it afterward from Wholesale Inventory.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setProductDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitStandaloneProduct} disabled={submittingProduct}>
                {submittingProduct ? "Adding..." : "Add Product"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <WholesaleProductImportDialog
          open={productImportOpen}
          onOpenChange={setProductImportOpen}
          wholesalers={wholesalers}
        />

        {/* Cart — session-only running list built while browsing catalogues */}
        <Dialog
          open={cartOpen}
          onOpenChange={(v) => {
            setCartOpen(v);
            if (!v) setOrderNotifyGroups([]);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{orderNotifyGroups.length > 0 ? "Order Placed" : "Cart"}</DialogTitle>
            </DialogHeader>
            {orderNotifyGroups.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  Notify each wholesaler about their part of the order:
                </p>
                {orderNotifyGroups.map((group) => (
                  <div
                    key={group.wholesalerId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {group.wholesalerName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{group.phone}</p>
                    </div>
                    <div className="flex gap-2">
                      <a href={group.whatsAppUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" size="sm" className="gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </a>
                      <a href={group.viberUrl} target="_blank" rel="noopener noreferrer">
                        <Button type="button" variant="outline" size="sm" className="gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5" /> Viber
                        </Button>
                      </a>
                      <a href={group.smsUrl}>
                        <Button type="button" variant="outline" size="sm" className="gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5" /> SMS
                        </Button>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Your cart is empty. Add products from a wholesaler's catalogue.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.productName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.wholesalerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCartQty(item.productId, item.qty - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm">{item.qty}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCartQty(item.productId, item.qty + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="w-16 shrink-0 text-right text-sm font-semibold text-foreground">
                      {(item.price * item.qty).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeFromCart(item.productId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <p className="text-sm font-semibold text-foreground">Total</p>
                  <p className="text-base font-bold text-foreground">
                    {cartTotal.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              {orderNotifyGroups.length > 0 ? (
                <Button
                  onClick={() => {
                    setOrderNotifyGroups([]);
                    setCartOpen(false);
                  }}
                >
                  Done
                </Button>
              ) : (
                <>
                  {cart.length > 0 && (
                    <>
                      <Button variant="outline" onClick={clearCart}>
                        Clear Cart
                      </Button>
                      <Button onClick={placeOrder}>Make Order</Button>
                    </>
                  )}
                  <Button variant="outline" onClick={() => setCartOpen(false)}>
                    Close
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order History — read-only snapshots created by "Make Order" in the Cart */}
        <Dialog open={orderHistoryOpen} onOpenChange={setOrderHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Order History</DialogTitle>
            </DialogHeader>
            {wholesaleOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No orders placed yet.
              </p>
            ) : (
              <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
                {wholesaleOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString()} · {order.placedBy}
                      </p>
                      <p className="text-sm font-bold text-foreground">
                        {order.total.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {order.items.map((item) => (
                        <div
                          key={item.productId}
                          className="flex items-center justify-between text-xs text-muted-foreground"
                        >
                          <span className="truncate">
                            {item.qty} × {item.productName}{" "}
                            <span className="text-muted-foreground/70">
                              ({item.wholesalerName})
                            </span>
                          </span>
                          <span className="shrink-0 pl-2">
                            {(item.qty * item.price).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOrderHistoryOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Wholesale Inventory — manually-tracked list, backed by its own Supabase table */}
        <Dialog open={inventoryOpen} onOpenChange={setInventoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Wholesale Inventory</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {editingInventoryId ? "Edit Item" : "Add Item"}
              </p>
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Wholesaler
                </Label>
                <Select
                  value={inventoryWholesalerId}
                  onValueChange={(v) => {
                    setInventoryWholesalerId(v);
                    setInventoryProductPickId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a wholesaler" />
                  </SelectTrigger>
                  <SelectContent>
                    {wholesalers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(() => {
                const selectedWholesaler = wholesalers.find((w) => w.id === inventoryWholesalerId);
                const catalogueProducts =
                  selectedWholesaler?.categories.flatMap((c) =>
                    c.products.map((p) => ({ categoryName: c.name, product: p })),
                  ) ?? [];
                if (!selectedWholesaler || catalogueProducts.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label>Pick from Catalogue (optional)</Label>
                    <Select
                      value={inventoryProductPickId}
                      onValueChange={(v) => pickInventoryProduct(v, selectedWholesaler)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an existing product" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogueProducts.map(({ categoryName, product }) => (
                          <SelectItem key={product.id} value={product.id}>
                            {categoryName} — {product.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })()}
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> Product Name
                </Label>
                <Input
                  value={inventoryProductName}
                  onChange={(e) => setInventoryProductName(e.target.value)}
                  placeholder="e.g. Basmati Rice"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    value={inventoryQty}
                    onChange={(e) => setInventoryQty(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={inventoryPrice}
                    onChange={(e) => setInventoryPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingInventoryId && (
                  <Button variant="outline" onClick={openAddInventoryItem}>
                    Cancel Edit
                  </Button>
                )}
                <Button onClick={submitInventoryItem}>
                  {editingInventoryId ? "Save Changes" : "Add Item"}
                </Button>
              </div>
            </div>

            {wholesaleInventory.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No wholesale inventory items yet.
              </p>
            ) : (
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {wholesaleInventory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.productName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.wholesalerName} · Qty {item.qty} ·{" "}
                        {item.price.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEditInventoryItem(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{item.productName}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the item from Wholesale Inventory. This can't be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeInventoryItem(item.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CatalogueSheet
          wholesaler={wholesalers.find((w) => w.id === catalogueWholesalerId) ?? null}
          canManage={canManage}
          onClose={() => setCatalogueWholesalerId(null)}
          onAddToCart={addToCart}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Catalogue panel — Shop (categories) / About (status, delivery, payment)
// ---------------------------------------------------------------------------

function CatalogueSheet({
  wholesaler,
  canManage,
  onClose,
  onAddToCart,
}: {
  wholesaler: Wholesaler | null;
  canManage: boolean;
  onClose: () => void;
  onAddToCart: (wholesaler: Wholesaler, product: WholesalerProduct) => void;
}) {
  const navigate = useNavigate();
  const currentUser = useCurrentUser();
  const [query, setQuery] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<{
    categoryId: string;
    product: WholesalerProduct;
  } | null>(null);
  const [editForm, setEditForm] = useState<WholesalerProduct | null>(null);

  // Reaching this page at all requires being logged in already (see WholesalerHomePage),
  // so "Login" here means switching accounts — log out first, then land on the actual
  // login form, since /login auto-redirects away if a session is still active.
  async function handleLoginClick() {
    if (currentUser) logAudit(currentUser.name, "logout", "Session");
    await authStore.logout();
    navigate({ to: "/login" });
  }

  const categories = (wholesaler?.categories ?? []).filter(
    (c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.products.some((p) => p.name.toLowerCase().includes(query.toLowerCase())),
  );

  function openEditProduct(categoryId: string, product: WholesalerProduct) {
    setEditingProduct({ categoryId, product });
    setEditForm({ ...product });
  }

  async function saveEditProduct() {
    if (!wholesaler || !editingProduct || !editForm) return;
    if (!editForm.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const categories = wholesaler.categories.map((c) =>
      c.id === editingProduct.categoryId
        ? {
            ...c,
            products: c.products.map((p) =>
              p.id === editingProduct.product.id ? { ...editForm, name: editForm.name.trim() } : p,
            ),
          }
        : c,
    );
    const result = await wholesalersStore.update(wholesaler.id, { categories });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${editForm.name.trim()}" updated`);
    setEditingProduct(null);
    setEditForm(null);
  }

  async function deleteProduct(categoryId: string, productId: string) {
    if (!wholesaler) return;
    const categories = wholesaler.categories.map((c) =>
      c.id === categoryId ? { ...c, products: c.products.filter((p) => p.id !== productId) } : c,
    );
    const result = await wholesalersStore.update(wholesaler.id, { categories });
    if ("error" in result) toast.error(result.error);
    else toast.success("Product deleted");
  }

  return (
    <>
      <Sheet
        open={!!wholesaler}
        onOpenChange={(v) => {
          if (!v) {
            onClose();
            setFullScreen(false);
          }
        }}
      >
        <SheetContent
          side="right"
          className={cn(
            "w-full overflow-y-auto p-0",
            fullScreen ? "max-w-none sm:max-w-none" : "sm:max-w-3xl",
          )}
        >
          {wholesaler && (
            <>
              <div className="relative h-36 w-full">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute left-4 top-4 z-10 gap-1.5"
                  onClick={handleLoginClick}
                >
                  <LogIn className="h-4 w-4" /> Login
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-14 top-4 z-10 h-8 w-8"
                  onClick={() => setFullScreen((v) => !v)}
                  title={fullScreen ? "Exit full screen" : "Full screen"}
                >
                  {fullScreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
                {wholesaler.bannerUrl ? (
                  <img src={wholesaler.bannerUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: avatarColor(wholesaler.name) }}
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent p-4 pt-10">
                  {wholesaler.logoUrl ? (
                    <img
                      src={wholesaler.logoUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-white/40 object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                      style={{ backgroundColor: avatarColor(wholesaler.name) }}
                    >
                      {initials(wholesaler.name) || "?"}
                    </div>
                  )}
                  <div>
                    <p className="font-bold leading-tight text-white">{wholesaler.name}</p>
                    <span className="flex items-center gap-1 text-xs text-white/90">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          wholesaler.openNow ? "bg-emerald-400" : "bg-white/50",
                        )}
                      />
                      {wholesaler.openNow ? "Open now" : "Currently closed"}
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
                    placeholder={`Search ${wholesaler.name}...`}
                    className="pl-9"
                  />
                </div>

                <Tabs defaultValue="shop">
                  <TabsList>
                    <TabsTrigger value="shop">Shop</TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                  </TabsList>

                  <TabsContent value="shop" className="mt-4">
                    <p className="mb-3 text-sm font-semibold text-foreground">Shop by category</p>
                    {categories.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        {wholesaler.categories.length === 0
                          ? "This wholesaler hasn't published a catalogue yet. Contact them directly using the About tab."
                          : "No categories match your search."}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {categories.map((c) => (
                          <div key={c.id} className="flex flex-col gap-3">
                            <div className="flex items-center gap-2.5 border-b border-border pb-2">
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {c.imageUrl ? (
                                  <img
                                    src={c.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <ImageIcon className="h-4 w-4" />
                                  </div>
                                )}
                              </div>
                              <p className="text-sm font-bold text-foreground">{c.name}</p>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {c.products.length} item{c.products.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            {c.products.length === 0 ? (
                              <p className="pl-11 text-xs text-muted-foreground">
                                No products listed in this category yet.
                              </p>
                            ) : (
                              <div
                                className={cn(
                                  "grid grid-cols-2 gap-3 sm:grid-cols-3",
                                  fullScreen && "lg:grid-cols-4 xl:grid-cols-6",
                                )}
                              >
                                {c.products.map((p) => (
                                  <div
                                    key={p.id}
                                    className="flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
                                  >
                                    <div className="aspect-square overflow-hidden rounded-lg bg-muted">
                                      {p.imageUrl ? (
                                        <img
                                          src={p.imageUrl}
                                          alt=""
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                          <ImageIcon className="h-6 w-6" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      <p className="truncate text-sm font-semibold leading-tight text-foreground">
                                        {p.name}
                                      </p>
                                      {(p.size > 0 || p.packingDetails) && (
                                        <p className="truncate text-xs text-muted-foreground">
                                          {p.size > 0 && `${p.size}${p.sizeUnit}`}
                                          {p.size > 0 && p.packingDetails && " · "}
                                          {p.packingDetails}
                                        </p>
                                      )}
                                      <p className="mt-0.5 text-sm font-bold text-primary">
                                        {p.price.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        })}
                                      </p>
                                      <p
                                        className={cn(
                                          "text-xs font-medium",
                                          p.stockQty > 0 ? "text-emerald-600" : "text-destructive",
                                        )}
                                      >
                                        {p.stockQty > 0 ? `${p.stockQty} in stock` : "Out of stock"}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="gap-1.5"
                                      disabled={p.stockQty <= 0}
                                      onClick={() => onAddToCart(wholesaler, p)}
                                    >
                                      <ShoppingCart className="h-3.5 w-3.5" />
                                      {p.stockQty <= 0 ? "Out of Stock" : "Add to Cart"}
                                    </Button>
                                    {canManage && (
                                      <div className="flex gap-1.5 border-t border-border pt-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 flex-1 text-muted-foreground hover:text-foreground"
                                          onClick={() => openEditProduct(c.id, p)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7 flex-1 text-muted-foreground hover:text-destructive"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                Delete "{p.name}"?
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                This removes the product from this category. This
                                                can't be undone.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() => deleteProduct(c.id, p.id)}
                                              >
                                                Delete
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="about" className="mt-4 flex flex-col gap-3">
                    {wholesaler.description && (
                      <p className="text-sm text-muted-foreground">{wholesaler.description}</p>
                    )}

                    <AboutRow
                      icon={<CircleCheck className="h-4 w-4" />}
                      label="Status"
                      value={wholesaler.openNow ? "Open now" : "Currently closed"}
                      tone={wholesaler.openNow ? "positive" : "neutral"}
                    />
                    <AboutRow
                      icon={<Truck className="h-4 w-4" />}
                      label="Delivery"
                      value={wholesaler.deliveryAvailable ? "Available" : "Not available"}
                      tone={wholesaler.deliveryAvailable ? "positive" : "neutral"}
                    />
                    <AboutRow
                      icon={<Store className="h-4 w-4" />}
                      label="Pickup"
                      value={wholesaler.pickupAvailable ? "Available" : "Not available"}
                      tone={wholesaler.pickupAvailable ? "positive" : "neutral"}
                    />
                    <AboutRow
                      icon={<CreditCard className="h-4 w-4" />}
                      label="Payment"
                      value={
                        wholesaler.paymentMethods.length > 0
                          ? wholesaler.paymentMethods.join(" · ")
                          : "Not specified"
                      }
                      tone="neutral"
                    />

                    <div className="space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                      {wholesaler.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" /> {wholesaler.phone}
                        </p>
                      )}
                      {wholesaler.address && (
                        <p className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 shrink-0" /> {wholesaler.address}
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

      {editForm && (
        <Dialog
          open={!!editingProduct}
          onOpenChange={(v) => {
            if (!v) {
              setEditingProduct(null);
              setEditForm(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {editForm.imageUrl ? (
                    <img src={editForm.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () =>
                        setEditForm((f) => (f ? { ...f, imageUrl: reader.result as string } : f));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <div className="flex-1 space-y-1.5">
                  <Label>
                    <span className="text-destructive">*</span> Product Name
                  </Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Packing Details</Label>
                <Input
                  value={editForm.packingDetails}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, packingDetails: e.target.value } : f))
                  }
                  placeholder="e.g. Box of 12"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-1.5">
                  <Label>Price</Label>
                  <Input
                    type="number"
                    value={editForm.price || ""}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, price: parseFloat(e.target.value) || 0 } : f))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Size</Label>
                  <Input
                    type="number"
                    value={editForm.size || ""}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, size: parseFloat(e.target.value) || 0 } : f))
                    }
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Unit</Label>
                  <Select
                    value={editForm.sizeUnit}
                    onValueChange={(v) =>
                      setEditForm((f) =>
                        f ? { ...f, sizeUnit: v as WholesalerProductSizeUnit } : f,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="ml">ml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Stock: {editForm.stockQty} — only updated from Wholesale Inventory.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingProduct(null);
                  setEditForm(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveEditProduct}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
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
          tone === "positive"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-muted text-muted-foreground",
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
