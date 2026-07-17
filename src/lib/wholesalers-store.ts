import { useEffect, useSyncExternalStore } from "react";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import {
  fetchWholesalers,
  createWholesalerOnServer,
  updateWholesalerOnServer,
  removeWholesalerOnServer,
  setWholesalerActiveOnServer,
} from "@/lib/wholesalers-api";

export type WholesalerProductSizeUnit = "kg" | "ml";

export type WholesalerProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  packingDetails: string; // e.g. "Box of 12", "Carton"
  size: number; // paired with sizeUnit, e.g. 5 + "kg" = "5kg"
  sizeUnit: WholesalerProductSizeUnit;
  stockQty: number; // available quantity the wholesaler currently has on hand
};

export type WholesalerCategory = {
  id: string;
  name: string;
  imageUrl: string;
  products: WholesalerProduct[];
};

export type Wholesaler = {
  id: string;
  name: string;
  subtitle: string; // e.g. "by RED BROTHERS"
  logoUrl: string; // optional uploaded logo; falls back to an initials badge
  bannerUrl: string; // optional cover image shown at the top of the catalogue panel
  description: string;
  phone: string;
  email: string; // used to notify this wholesaler when an order is placed
  address: string;
  openNow: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  paymentMethods: string[]; // e.g. ["Cash On Delivery", "Card On Delivery", "Pay on Pickup"]
  categories: WholesalerCategory[]; // shown as tiles in the catalogue panel's Shop tab
  active: boolean;
  createdAt: string;
};

const defaults = {
  bannerUrl: "",
  email: "",
  openNow: true,
  deliveryAvailable: false,
  pickupAvailable: false,
  paymentMethods: [] as string[],
  categories: [] as WholesalerCategory[],
};

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let wholesalers: Wholesaler[] = [];
const listeners = new Set<() => void>();

function setWholesalers(next: Wholesaler[]) {
  wholesalers = next;
  listeners.forEach((l) => l());
}

// Backfill for records persisted before `products` existed on a category, and before
// packingDetails/size/sizeUnit/stockQty existed on a product — createServerFn round-trips
// whatever was in Supabase as-is, it doesn't deep-merge with new defaults.
function backfillCategories(categories: WholesalerCategory[] | undefined): WholesalerCategory[] {
  return (categories ?? []).map((c) => ({
    ...c,
    products: (c.products ?? []).map(
      (
        p: Partial<WholesalerProduct> &
          Pick<WholesalerProduct, "id" | "name" | "price" | "imageUrl">,
      ) => ({
        packingDetails: "",
        size: 0,
        sizeUnit: "kg" as const,
        stockQty: 0,
        ...p,
      }),
    ),
  }));
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchWholesalers());
  if (!("networkError" in result)) {
    setWholesalers(
      result.map((w) => ({ ...defaults, ...w, categories: backfillCategories(w.categories) })),
    );
  }
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

export const wholesalersStore = {
  get: () => wholesalers,

  async create(
    input: Omit<Wholesaler, "id" | "createdAt">,
  ): Promise<Wholesaler | { error: string }> {
    const result = await safeServerCall(() => createWholesalerOnServer({ data: input }));
    if ("networkError" in result) return { error: result.error };
    setWholesalers([result.wholesaler, ...wholesalers]);
    logAudit(actor(), "create", `Wholesaler / ${result.wholesaler.name}`);
    return result.wholesaler;
  },

  async update(
    id: string,
    patch: Partial<Omit<Wholesaler, "id" | "createdAt">>,
  ): Promise<{ ok: true } | { error: string }> {
    const existing = wholesalers.find((w) => w.id === id);
    const result = await safeServerCall(() => updateWholesalerOnServer({ data: { id, patch } }));
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setWholesalers(wholesalers.map((w) => (w.id === id ? { ...w, ...patch } : w)));
    logAudit(actor(), "update", `Wholesaler / ${patch.name ?? existing?.name ?? id}`);
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const existing = wholesalers.find((w) => w.id === id);
    const result = await safeServerCall(() => removeWholesalerOnServer({ data: { id } }));
    if ("networkError" in result) return { error: result.error };
    setWholesalers(wholesalers.filter((w) => w.id !== id));
    logAudit(actor(), "delete", `Wholesaler / ${existing?.name ?? id}`);
    return { ok: true };
  },

  async setActive(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
    const existing = wholesalers.find((w) => w.id === id);
    const result = await safeServerCall(() =>
      setWholesalerActiveOnServer({ data: { id, active } }),
    );
    if ("networkError" in result) return { error: result.error };
    setWholesalers(wholesalers.map((w) => (w.id === id ? { ...w, active } : w)));
    logAudit(
      actor(),
      "update",
      `Wholesaler / ${existing?.name ?? id} ${active ? "enabled" : "disabled"}`,
    );
    return { ok: true };
  },
};

export function useWholesalers(): Wholesaler[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => wholesalers,
    () => wholesalers,
  );
}
