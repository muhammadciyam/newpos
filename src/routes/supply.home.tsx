import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
  Image as ImageIcon,
  Check,
  Sparkles,
  X,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import {
  useWholesalers,
  wholesalersStore,
  type Wholesaler,
  type WholesalerCategory,
  type WholesalerProduct,
  type WholesalerProductSizeUnit,
  type BannerAnimation,
} from "@/lib/wholesalers-store";
import {
  useWholesaleInventory,
  wholesaleInventoryStore,
  type WholesaleInventoryItem,
} from "@/lib/wholesale-inventory-store";
import { useCart, cartStore, type CartItem } from "@/lib/cart-store";
import { useWholesaleOrders, wholesaleOrdersStore } from "@/lib/wholesale-orders-store";
import { useCurrentUser } from "@/lib/auth-store";
import { findProductPhoto } from "@/lib/product-photo-search";
import { logAudit } from "@/lib/audit-log-store";
import { settingsStore, useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

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
  bannerUrls: [] as string[],
  bannerAnimation: "fade" as BannerAnimation,
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

// Shared stock-status labeling for a WholesalerProduct — 0 is always "Out of Stock";
// anything at or below the configured threshold (Wholesale Settings) is "Low Stock" so
// it's visible at a glance without opening Wholesale Inventory.
function stockStatus(qty: number, lowStockThreshold: number) {
  if (qty <= 0) return { label: "Out of Stock", className: "text-destructive" };
  if (qty <= lowStockThreshold)
    return { label: `Low Stock — ${qty} left`, className: "text-amber-600" };
  return { label: `${qty} in stock`, className: "text-emerald-600" };
}

const ADD_UNIT_VALUE = "__add_unit__";

// Unit picker used everywhere a WholesalerProduct's sizeUnit is set (Add Product, Edit
// Product, and the inline product-row editor) — a dropdown of known units plus an
// "+ Add New Unit" option that reveals a text input for typing a brand new one.
function UnitSelect({
  value,
  onChange,
  units,
  triggerClassName,
}: {
  value: string;
  onChange: (unit: string) => void;
  units: string[];
  triggerClassName?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function confirmDraft() {
    const trimmed = draft.trim();
    if (trimmed) onChange(trimmed);
    setAdding(false);
    setDraft("");
  }

  if (adding) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmDraft();
            } else if (e.key === "Escape") {
              setAdding(false);
              setDraft("");
            }
          }}
          placeholder="e.g. pcs"
          className={triggerClassName ?? "h-9 w-24"}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={confirmDraft}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // The current value might not be in the known-units list yet (e.g. a custom unit just
  // typed for this product before the store round-trips) — always include it so Select
  // doesn't fall back to a blank display.
  const options = Array.from(new Set([value, ...units].map((u) => u?.trim()).filter(Boolean)));

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === ADD_UNIT_VALUE) {
          setAdding(true);
          return;
        }
        onChange(v);
      }}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u} value={u}>
            {u}
          </SelectItem>
        ))}
        <SelectItem value={ADD_UNIT_VALUE} className="font-medium text-primary">
          + Add New Unit
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function WholesalerHomePage() {
  const currentUser = useCurrentUser();
  // Every wholesale management action — creating/editing a wholesaler shop (including its
  // catalogue), deleting or disabling one, adding a product, and Wholesale Inventory — is
  // Super Admin only (enforced again server-side, see wholesalers-api.ts/
  // wholesale-inventory-api.ts).
  const canManage = currentUser?.role === "Super Admin";
  const wholesalers = useWholesalers();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [catalogueWholesalerId, setCatalogueWholesalerId] = useState<string | null>(null);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
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

  // The Unit field isn't a fixed list — anyone can type a new one (e.g. "pcs", "box",
  // "dozen") and it's remembered by suggesting whatever units are already used somewhere
  // across every wholesaler's catalogue, on top of a small starter list.
  const settings = useSettings();
  const [lowStockThresholdDraft, setLowStockThresholdDraft] = useState(
    String(settings.wholesale.lowStockThreshold),
  );

  const knownUnits = useMemo(() => {
    const starter = ["kg", "g", "l", "ml", "pcs", "box", "dozen", "carton"];
    const used = wholesalers.flatMap((w) =>
      w.categories.flatMap((c) => c.products.map((p) => p.sizeUnit)),
    );
    return Array.from(new Set([...starter, ...used].map((u) => u.trim()).filter(Boolean))).sort();
  }, [wholesalers]);

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
  const [inventoryIsNewStock, setInventoryIsNewStock] = useState(false);

  if (!currentUser) return <RestrictedPage />;

  const visible = canManage ? wholesalers : wholesalers.filter((s) => s.active);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  const currency = settings.general.currency;
  // Grouped by wholesaler so a cart spanning more than one shows a clear section per
  // supplier, same grouping placeOrder() already relies on for the notify-by-wholesaler step.
  // Plain derived value (not useMemo) — this runs after the early `if (!currentUser)` return
  // above, where a hook can't safely live.
  const cartGroupsMap = new Map<string, { wholesalerName: string; items: CartItem[] }>();
  for (const item of cart) {
    const group = cartGroupsMap.get(item.wholesalerId);
    if (group) group.items.push(item);
    else
      cartGroupsMap.set(item.wholesalerId, { wholesalerName: item.wholesalerName, items: [item] });
  }
  const cartGroups = Array.from(cartGroupsMap.entries()).map(([wholesalerId, group]) => ({
    wholesalerId,
    ...group,
    subtotal: group.items.reduce((sum, i) => sum + i.qty * i.price, 0),
  }));

  async function addToCart(wholesaler: Wholesaler, product: WholesalerProduct) {
    const result = await cartStore.addToCart(wholesaler, product);
    if ("error" in result) toast.error(result.error);
    else toast.success(`"${product.name}" added to cart`);
  }

  async function setCartQty(productId: string, outletId: string | null, qty: number) {
    const result = await cartStore.setQty(productId, outletId, qty);
    if ("error" in result) toast.error(result.error);
  }

  async function removeFromCart(productId: string, outletId: string | null) {
    const result = await cartStore.remove(productId, outletId);
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
    setInventoryIsNewStock(false);
  }

  function openEditInventoryItem(item: WholesaleInventoryItem) {
    setEditingInventoryId(item.id);
    setInventoryWholesalerId(item.wholesalerId);
    setInventoryProductPickId(item.productId ?? "");
    setInventoryProductName(item.productName);
    setInventoryQty(String(item.qty));
    setInventoryPrice(String(item.price));
    const linkedProduct = wholesalers
      .find((w) => w.id === item.wholesalerId)
      ?.categories.flatMap((c) => c.products)
      .find((p) => p.id === item.productId);
    setInventoryIsNewStock(linkedProduct?.isNewStock ?? false);
  }

  function pickInventoryProduct(productId: string, wholesaler: Wholesaler) {
    setInventoryProductPickId(productId);
    for (const category of wholesaler.categories) {
      const product = category.products.find((p) => p.id === productId);
      if (product) {
        setInventoryProductName(product.name);
        setInventoryPrice(String(product.price));
        setInventoryIsNewStock(product.isNewStock);
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
    if (editingInventoryId) {
      const result = await wholesaleInventoryStore.update(editingInventoryId, payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
    } else {
      await wholesaleInventoryStore.create(payload);
    }

    // Wholesale Inventory is the only place a product's stockQty/isNewStock is ever set —
    // when this entry is linked to an existing catalogue product, push both onto it directly.
    if (inventoryProductPickId) {
      const categories = wholesaler.categories.map((c) => ({
        ...c,
        products: c.products.map((p) =>
          p.id === inventoryProductPickId
            ? { ...p, stockQty: payload.qty, isNewStock: inventoryIsNewStock }
            : p,
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
      bannerUrls: s.bannerUrls,
      bannerAnimation: s.bannerAnimation,
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

  // Accepts multiple files at once (input has `multiple`) — each gets appended to the
  // banner list rather than replacing it, since a wholesaler can now have several banners
  // that cycle (see bannerAnimation).
  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () =>
        setForm((f) => ({ ...f, bannerUrls: [...f.bannerUrls, reader.result as string] }));
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  }

  function removeBanner(index: number) {
    setForm((f) => ({ ...f, bannerUrls: f.bannerUrls.filter((_, i) => i !== index) }));
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
                  isNewStock: false,
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
  const productCategory =
    productWholesaler?.categories.find((c) => c.id === productCategoryId) ?? null;

  // Lets a category be deleted right from the Add Product picker, same effect as deleting it
  // from the full wholesaler edit form — no need to leave this dialog to do it.
  async function deleteProductCategory() {
    if (!productWholesaler || !productCategory) return;
    const result = await wholesalersStore.update(productWholesaler.id, {
      categories: productWholesaler.categories.filter((c) => c.id !== productCategory.id),
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${productCategory.name}" deleted`);
    setProductCategoryId("");
  }

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
      // Not settable here — New Stock marking is managed from Wholesale Inventory once the
      // product exists (and, since it's ultimately a stock concept, so is stockQty itself).
      isNewStock: false,
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
      bannerUrls: form.bannerUrls,
      bannerAnimation: form.bannerAnimation,
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
    if (editingId) {
      const result = await wholesalersStore.update(editingId, payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
    } else {
      await wholesalersStore.create(payload);
    }
    toast.success(`"${payload.name}" ${editingId ? "updated" : "added"}`);
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-primary/85 px-4 py-3.5 text-primary-foreground shadow-md shadow-primary/20">
          <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary-foreground/10 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15 ring-1 ring-inset ring-primary-foreground/20">
              <DhiposWholesalerLogo className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight">Dhipos Wholesaler</p>
              <p className="truncate text-xs text-primary-foreground/75">
                Connect with wholesalers and reorder inventory
              </p>
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
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
              <Label>Catalogue Banner{form.bannerUrls.length > 1 ? "s" : ""}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {form.bannerUrls.map((url, i) => (
                  <div
                    key={i}
                    className="group relative h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          title="Remove banner"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove this banner image?</AlertDialogTitle>
                          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => removeBanner(i)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
                {form.bannerUrls.length === 0 && (
                  <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    multiple
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
                    <Upload className="h-3.5 w-3.5" />
                    {form.bannerUrls.length > 0 ? "Add More" : "Upload Banner"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Shown at the top of the catalogue panel — upload more than one and they'll cycle
                automatically.
              </p>
              {form.bannerUrls.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  <Label>Banner Animation</Label>
                  <Select
                    value={form.bannerAnimation}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, bannerAnimation: v as BannerAnimation }))
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (first only)</SelectItem>
                      <SelectItem value="fade">Fade</SelectItem>
                      <SelectItem value="slide">Slide</SelectItem>
                      <SelectItem value="flash">Flash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete category "{c.name || "this category"}"?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the category and all {c.products.length} product
                                {c.products.length === 1 ? "" : "s"} in it. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeCategory(c.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete "{p.name || "this product"}"?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This can't be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => removeProduct(c.id, p.id)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
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
                              <UnitSelect
                                value={p.sizeUnit}
                                onChange={(v) => updateProduct(c.id, p.id, { sizeUnit: v })}
                                units={knownUnits}
                                triggerClassName="h-9 w-20 shrink-0"
                              />
                              <span
                                className={cn(
                                  "flex h-9 w-24 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-medium",
                                  stockStatus(p.stockQty, settings.wholesale.lowStockThreshold)
                                    .className,
                                )}
                                title="Stock is only updated from Wholesale Inventory"
                              >
                                {p.stockQty <= 0
                                  ? "No Stock"
                                  : p.stockQty <= settings.wholesale.lowStockThreshold
                                    ? `Low: ${p.stockQty}`
                                    : `Stock: ${p.stockQty}`}
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
                <div className="flex gap-2">
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
                  {productCategory && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete category "{productCategory.name}"?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the category and all {productCategory.products.length}{" "}
                            product
                            {productCategory.products.length === 1 ? "" : "s"} in it. This can't be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={deleteProductCategory}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
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
                  <UnitSelect
                    value={productSizeUnit}
                    onChange={setProductSizeUnit}
                    units={knownUnits}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Stock starts at 0 — set it (and New Stock marking) afterward from Wholesale
                Inventory.
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

        {/* Cart — session-only running list built while browsing catalogues */}
        <Dialog
          open={cartOpen}
          onOpenChange={(v) => {
            setCartOpen(v);
            if (!v) setOrderNotifyGroups([]);
          }}
        >
          <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {orderNotifyGroups.length > 0
                  ? "Order Placed"
                  : `${cartCount} Item${cartCount === 1 ? "" : "s"}`}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
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
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <PackageOpen className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground">
                    Add products from a wholesaler's catalogue to get started.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {cartGroups.map((group) => (
                    <div
                      key={group.wholesalerId}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <div className="bg-muted px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {group.wholesalerName}
                      </div>
                      <div className="divide-y divide-border">
                        {group.items.map((item) => (
                          <div key={item.productId} className="flex items-center gap-3 p-3">
                            <div className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-1.5">
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center text-foreground hover:text-primary"
                                onClick={() =>
                                  setCartQty(item.productId, item.outletId, item.qty + 1)
                                }
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-sm font-semibold text-foreground">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                className="flex h-5 w-5 items-center justify-center text-foreground hover:text-destructive"
                                onClick={() =>
                                  setCartQty(item.productId, item.outletId, item.qty - 1)
                                }
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-md border border-border object-cover"
                              />
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold uppercase text-foreground">
                                {item.productName}
                              </p>
                              <p className="text-sm font-semibold text-primary">
                                {currency} {item.price.toFixed(2)}
                              </p>
                              {(item.packingDetails || item.size) && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {[
                                    item.packingDetails,
                                    item.size ? `${item.size}${item.sizeUnit ?? ""}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <p className="text-sm font-bold text-foreground">
                                {(item.price * item.qty).toFixed(2)}
                              </p>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-destructive hover:text-destructive/70"
                                    title="Remove"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Remove "{item.productName}" from cart?
                                    </AlertDialogTitle>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => removeFromCart(item.productId, item.outletId)}
                                    >
                                      Remove
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        ))}
                      </div>
                      {group.items.length > 1 && (
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5 text-xs">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-semibold text-foreground">
                            {currency} {group.subtotal.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {orderNotifyGroups.length > 0 ? (
              <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
                <Button
                  className="w-full rounded-full"
                  onClick={() => {
                    setOrderNotifyGroups([]);
                    setCartOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            ) : cart.length > 0 ? (
              <DialogFooter className="flex-col gap-3 shrink-0 border-t border-border px-5 py-4 sm:flex-col">
                <div className="flex w-full items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Total</p>
                  <p className="text-lg font-bold text-foreground">
                    {currency} {cartTotal.toFixed(2)}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full rounded-full text-base font-semibold"
                  onClick={placeOrder}
                >
                  Checkout
                </Button>
                <div className="flex w-full items-center justify-center gap-4 text-xs">
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-muted-foreground hover:text-destructive hover:underline"
                  >
                    Clear Cart
                  </button>
                  <span className="text-border">·</span>
                  <button
                    type="button"
                    onClick={() => setCartOpen(false)}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    Continue Shopping
                  </button>
                </div>
              </DialogFooter>
            ) : (
              <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
                <Button variant="outline" className="w-full" onClick={() => setCartOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Order History — read-only snapshots created by "Make Order" in the Cart */}
        <Dialog open={orderHistoryOpen} onOpenChange={setOrderHistoryOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Order History
                {wholesaleOrders.length > 0 && (
                  <Badge variant="outline" className="ml-1 font-normal">
                    {wholesaleOrders.length}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {wholesaleOrders.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-14 text-center">
                  <History className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">No orders yet</p>
                  <p className="text-xs text-muted-foreground">
                    Orders you place from the Cart will show up here.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {wholesaleOrders.map((order) => {
                    const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
                    const wholesalerNames = Array.from(
                      new Set(order.items.map((i) => i.wholesalerName)),
                    );
                    return (
                      <div
                        key={order.id}
                        className="overflow-hidden rounded-lg border border-border"
                      >
                        <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {wholesalerNames.join(", ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(order.createdAt).toLocaleString()} · {order.placedBy}
                            </p>
                          </div>
                          <Badge className="shrink-0 gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <Check className="h-3 w-3" /> Placed
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-1.5 px-3 py-2.5">
                          {order.items.map((item) => (
                            <div
                              key={item.productId}
                              className="flex items-center justify-between text-xs"
                            >
                              <span className="truncate text-muted-foreground">
                                <span className="font-medium text-foreground">{item.qty}×</span>{" "}
                                {item.productName}
                              </span>
                              <span className="shrink-0 pl-2 text-foreground">
                                {currency} {(item.qty * item.price).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between border-t border-border px-3 py-2">
                          <span className="text-xs text-muted-foreground">
                            {itemCount} item{itemCount === 1 ? "" : "s"}
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            {currency} {order.total.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={() => setOrderHistoryOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Wholesale Inventory — manually-tracked list, backed by its own Supabase table */}
        <Dialog open={inventoryOpen} onOpenChange={setInventoryOpen}>
          <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
              <DialogTitle>Wholesale Inventory</DialogTitle>
            </DialogHeader>
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="flex items-end gap-2 rounded-lg border border-border p-3">
                <div className="flex-1 space-y-1.5">
                  <Label>Low Stock Threshold</Label>
                  <Input
                    type="number"
                    min="0"
                    value={lowStockThresholdDraft}
                    onChange={(e) => setLowStockThresholdDraft(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <p className="text-xs text-muted-foreground">
                    A product shows as "Low Stock" once its stock falls to this number or below (0
                    is always "Out of Stock").
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const parsed = parseInt(lowStockThresholdDraft, 10);
                    settingsStore.updateSection("wholesale", {
                      lowStockThreshold: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
                    });
                    toast.success("Low stock threshold saved");
                  }}
                >
                  Save
                </Button>
              </div>
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
                  const selectedWholesaler = wholesalers.find(
                    (w) => w.id === inventoryWholesalerId,
                  );
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
                {inventoryProductPickId && (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Checkbox
                      checked={inventoryIsNewStock}
                      onCheckedChange={(v) => setInventoryIsNewStock(v === true)}
                    />
                    Mark as New Stock — shows a "New" badge on the catalogue card
                  </label>
                )}
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
                <div className="flex flex-col gap-2">
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
                          {item.wholesalerName} ·{" "}
                          <span
                            className={cn(
                              "font-medium",
                              stockStatus(item.qty, settings.wholesale.lowStockThreshold).className,
                            )}
                          >
                            {stockStatus(item.qty, settings.wholesale.lowStockThreshold).label}
                          </span>{" "}
                          ·{" "}
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
            </div>
            <DialogFooter className="shrink-0 border-t border-border px-6 py-4">
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
          knownUnits={knownUnits}
          lowStockThreshold={settings.wholesale.lowStockThreshold}
          cartCount={cartCount}
          onOpenCart={() => setCartOpen(true)}
          onOpenOrderHistory={() => setOrderHistoryOpen(true)}
        />
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Catalogue panel — Shop (categories) / About (status, delivery, payment)
// ---------------------------------------------------------------------------

const BANNER_ROTATE_MS = 4500;

// Cycles through a wholesaler's banner images (Add/Edit Wholesaler > Catalogue Banner).
// With 0-1 images or animation "none" it just shows the first one, static. "flash" needs a
// one-shot keyframe the Tailwind build doesn't ship, so it's declared inline once here
// rather than touching the global stylesheet for a single component's effect.
function BannerCarousel({ urls, animation }: { urls: string[]; animation: BannerAnimation }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [urls]);

  useEffect(() => {
    if (animation === "none" || urls.length <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % urls.length), BANNER_ROTATE_MS);
    return () => clearInterval(id);
  }, [animation, urls.length]);

  if (urls.length === 0) return null;

  const frames = animation === "none" ? [urls[0]] : urls;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <style>{`
        @keyframes banner-flash {
          0% { opacity: 0; filter: brightness(2.5); }
          40% { opacity: 1; filter: brightness(1.3); }
          100% { opacity: 1; filter: brightness(1); }
        }
      `}</style>
      {frames.map((url, i) => (
        <img
          key={url + i}
          src={url}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            i === index ? "opacity-100" : "opacity-0",
            animation === "fade" && "transition-opacity duration-1000",
            animation === "slide" &&
              cn(
                "transition-transform duration-700",
                i === index ? "translate-x-0" : "translate-x-full",
              ),
          )}
          style={
            animation === "flash" && i === index
              ? { animation: "banner-flash 0.6s ease-out" }
              : undefined
          }
        />
      ))}
    </div>
  );
}

function CatalogueSheet({
  wholesaler,
  canManage,
  onClose,
  onAddToCart,
  knownUnits,
  lowStockThreshold,
  cartCount,
  onOpenCart,
  onOpenOrderHistory,
}: {
  wholesaler: Wholesaler | null;
  canManage: boolean;
  onClose: () => void;
  onAddToCart: (wholesaler: Wholesaler, product: WholesalerProduct) => void;
  knownUnits: string[];
  lowStockThreshold: number;
  cartCount: number;
  onOpenCart: () => void;
  onOpenOrderHistory: () => void;
}) {
  const [query, setQuery] = useState("");
  const [fullScreen, setFullScreen] = useState(true);
  const [editingProduct, setEditingProduct] = useState<{
    categoryId: string;
    product: WholesalerProduct;
  } | null>(null);
  const [editForm, setEditForm] = useState<WholesalerProduct | null>(null);

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
                {wholesaler.bannerUrls.length > 0 ? (
                  <BannerCarousel
                    urls={wholesaler.bannerUrls}
                    animation={wholesaler.bannerAnimation}
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ backgroundColor: avatarColor(wholesaler.name) }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-between gap-3 bg-black/35 p-4">
                  <div className="flex min-w-0 items-center gap-3">
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
                    <div className="min-w-0">
                      <p className="truncate font-bold leading-tight text-white">
                        {wholesaler.name}
                      </p>
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
                  <div className="flex shrink-0 flex-wrap items-end justify-end gap-1.5 self-end pb-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="relative gap-1.5 border border-white/30 bg-primary/30 text-white backdrop-blur-md hover:bg-primary/40"
                      onClick={onOpenCart}
                    >
                      <ShoppingCart className="h-4 w-4" /> Cart
                      {cartCount > 0 && (
                        <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center rounded-full border-2 border-background bg-primary px-1">
                          {cartCount}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-1.5 border border-white/30 bg-primary/30 text-white backdrop-blur-md hover:bg-primary/40"
                      onClick={onOpenOrderHistory}
                    >
                      <History className="h-4 w-4" /> Order History
                    </Button>
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
                                    className="relative flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-2.5 shadow-sm transition-shadow hover:shadow-md"
                                  >
                                    {p.isNewStock && (
                                      <Badge className="absolute left-2 top-2 z-10 gap-1 bg-emerald-500 text-white hover:bg-emerald-500">
                                        <Sparkles className="h-3 w-3" /> New
                                      </Badge>
                                    )}
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
                                          stockStatus(p.stockQty, lowStockThreshold).className,
                                        )}
                                      >
                                        {stockStatus(p.stockQty, lowStockThreshold).label}
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
                  <UnitSelect
                    value={editForm.sizeUnit}
                    onChange={(v) => setEditForm((f) => (f ? { ...f, sizeUnit: v } : f))}
                    units={knownUnits}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Stock: {editForm.stockQty} — stock and New Stock marking are only updated from
                Wholesale Inventory.
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
