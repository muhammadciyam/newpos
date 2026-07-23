import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { createOutboxStore, createSyncScheduler } from "@/lib/offline-store";
import {
  fetchWholesalers,
  createWholesalerOnServer,
  updateWholesalerOnServer,
  removeWholesalerOnServer,
  setWholesalerActiveOnServer,
} from "@/lib/wholesalers-api";

// Free text (not a fixed list) — the Wholesale page lets you type any unit (e.g. "kg", "pcs",
// "box", "dozen") and remembers it for future products by suggesting whatever units are
// already in use across all wholesalers' catalogues (see supply.home.tsx's knownUnits).
export type WholesalerProductSizeUnit = string;

export type WholesalerProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  packingDetails: string; // e.g. "Box of 12", "Carton"
  size: number; // paired with sizeUnit, e.g. 5 + "kg" = "5kg"
  sizeUnit: WholesalerProductSizeUnit;
  stockQty: number; // available quantity the wholesaler currently has on hand
  // Manually toggled (Add/Edit Product) — shows a "New" badge on the catalogue card so
  // buyers can spot recently added or freshly restocked items. Doesn't clear on its own.
  isNewStock: boolean;
};

export type WholesalerCategory = {
  id: string;
  name: string;
  imageUrl: string;
  products: WholesalerProduct[];
};

export type BannerAnimation = "none" | "fade" | "slide" | "flash";

export type Wholesaler = {
  id: string;
  name: string;
  subtitle: string; // e.g. "by RED BROTHERS"
  logoUrl: string; // optional uploaded logo; falls back to an initials badge
  bannerUrls: string[]; // cover image(s) shown at the top of the catalogue panel
  // How multiple banners cycle over time — irrelevant with 0-1 banners, since there's
  // nothing to transition to/from.
  bannerAnimation: BannerAnimation;
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
  bannerUrls: [] as string[],
  bannerAnimation: "fade" as BannerAnimation,
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

function callerRole() {
  return authStore.getCurrentUser()?.role ?? "";
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
        isNewStock: false,
        ...p,
      }),
    ),
  }));
}

// Backfill for records persisted before `bannerUrls` (plural) existed — older records only
// ever had a single `bannerUrl` string, so wrap it into the new array shape.
function backfillWholesaler(
  w: Partial<Wholesaler> & { bannerUrl?: string } & Pick<Wholesaler, "id" | "name">,
): Wholesaler {
  return {
    ...defaults,
    ...w,
    bannerUrls: w.bannerUrls ?? (w.bannerUrl ? [w.bannerUrl] : []),
    categories: backfillCategories(w.categories),
  } as Wholesaler;
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchWholesalers());
  if (!("networkError" in result)) {
    setWholesalers(result.map(backfillWholesaler));
  }
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// ---------------------------------------------------------------------------
// Local-first add/edit: create() and update() apply to this device's own copy of the
// wholesaler directory (and, via update()'s `categories` patch, each wholesaler's product
// catalogue — see "Add Product" in supply.home.tsx) immediately, and queue the change to sync
// to Supabase in the background — same model as products-store.ts/customers-store.ts. See
// offline-store.ts. remove()/setActive() stay immediate/online-only: both are already
// Super-Admin-only, structural actions (see wholesalers-api.ts) better served by an
// authoritative answer right away than an optimistic queue.
// ---------------------------------------------------------------------------

type WholesalerInput = Omit<Wholesaler, "id" | "createdAt">;

const outbox = createOutboxStore<WholesalerInput>("dhipos-wholesalers-outbox");

// Once a locally-created wholesaler's real, server-assigned id lands, this remembers
// "local-xxx now means sup-1234" — see resolveProductId's identical reasoning. Exported so
// wholesale-inventory-store.ts can resolve a still-pending wholesalerId before syncing an
// inventory item that references it.
const wholesalerIdRedirects = new Map<string, string>();

export function resolveWholesalerId(id: string): string {
  let current = id;
  while (wholesalerIdRedirects.has(current)) current = wholesalerIdRedirects.get(current)!;
  return current;
}

const inFlight = new Set<string>();

async function trySyncEntry(
  id: string,
): Promise<"synced" | "failed-network" | "rejected" | "skipped"> {
  if (inFlight.has(id)) return "skipped";
  const entry = outbox.get()[id];
  if (!entry) return "skipped";
  inFlight.add(id);
  try {
    if (entry.op === "create") {
      const result = await safeServerCall(() =>
        createWholesalerOnServer({ data: { ...entry.payload, callerRole: callerRole() } }),
      );
      if ("networkError" in result) {
        outbox.markFailed(id, result.error);
        return "failed-network";
      }
      if ("error" in result) {
        // The placeholder never really existed anywhere but here — just drop it.
        setWholesalers(wholesalers.filter((w) => w.id !== id));
        outbox.resolve(id);
        toast.error(`"${entry.payload.name}" couldn't be saved: ${result.error}`);
        return "rejected";
      }
      const synced = backfillWholesaler(result.wholesaler);
      wholesalerIdRedirects.set(id, synced.id);
      setWholesalers([synced, ...wholesalers.filter((w) => w.id !== id)]);
      outbox.resolve(id);
      logAudit(actor(), "create", `Wholesaler / ${synced.name} (synced)`);
      return "synced";
    }

    // update — this store never queues a "remove" entry (see remove() below, which stays
    // immediate/online), so this is the only other op create() can produce.
    if (entry.op !== "update") return "skipped";
    const result = await safeServerCall(() =>
      updateWholesalerOnServer({ data: { id, patch: entry.patch, callerRole: callerRole() } }),
    );
    if ("networkError" in result) {
      outbox.markFailed(id, result.error);
      return "failed-network";
    }
    outbox.resolve(id);
    if ("error" in result) {
      toast.error(`A change couldn't be saved: ${result.error}`);
      await refreshFromServer(); // this device's optimistic patch is now known-wrong
      return "rejected";
    }
    return "synced";
  } finally {
    inFlight.delete(id);
  }
}

const scheduler = createSyncScheduler(async () => {
  for (const id of Object.keys(outbox.get())) {
    const outcome = await trySyncEntry(id);
    if (outcome === "failed-network") break;
  }
});

// Mounted once via AppShell, alongside usePendingBills/useProductsSync/useCustomersSync.
export const useWholesalersSync = scheduler.usePendingSync;
export const syncPendingWholesalers = scheduler.run;

// For the header's combined "pending sync" indicator (see AppShell).
export function usePendingWholesalersCount(): number {
  return Object.keys(outbox.useOutbox()).length;
}

export const wholesalersStore = {
  get: () => wholesalers,

  async create(input: WholesalerInput): Promise<Wholesaler> {
    const id = `local-${crypto.randomUUID().slice(0, 8)}`;
    const wholesaler: Wholesaler = { ...input, id, createdAt: new Date().toISOString() };
    setWholesalers([wholesaler, ...wholesalers]);
    outbox.queueCreate(id, input);
    logAudit(actor(), "create", `Wholesaler / ${wholesaler.name} (saved on device)`);
    void scheduler.run();
    return wholesaler;
  },

  async update(
    id: string,
    patch: Partial<Omit<Wholesaler, "id" | "createdAt">>,
  ): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveWholesalerId(id);
    const existing = wholesalers.find((w) => w.id === targetId);
    if (!existing) return { error: "Wholesaler not found" };
    setWholesalers(wholesalers.map((w) => (w.id === targetId ? { ...w, ...patch } : w)));
    outbox.queueUpdate(targetId, patch);
    logAudit(actor(), "update", `Wholesaler / ${patch.name ?? existing.name}`);
    void scheduler.run();
    return { ok: true };
  },

  async remove(id: string): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveWholesalerId(id);
    const existing = wholesalers.find((w) => w.id === targetId);
    const result = await safeServerCall(() =>
      removeWholesalerOnServer({ data: { id: targetId, callerRole: callerRole() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setWholesalers(wholesalers.filter((w) => w.id !== targetId));
    logAudit(actor(), "delete", `Wholesaler / ${existing?.name ?? targetId}`);
    return { ok: true };
  },

  async setActive(id: string, active: boolean): Promise<{ ok: true } | { error: string }> {
    const targetId = resolveWholesalerId(id);
    const existing = wholesalers.find((w) => w.id === targetId);
    const result = await safeServerCall(() =>
      setWholesalerActiveOnServer({ data: { id: targetId, active, callerRole: callerRole() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    setWholesalers(wholesalers.map((w) => (w.id === targetId ? { ...w, active } : w)));
    logAudit(
      actor(),
      "update",
      `Wholesaler / ${existing?.name ?? targetId} ${active ? "enabled" : "disabled"}`,
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
