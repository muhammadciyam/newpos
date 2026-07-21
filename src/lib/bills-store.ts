import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type Bill, type BillLineItem } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";
import { settingsStore } from "@/lib/settings-store";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { useScopeOutletId } from "@/lib/outlet-scope";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import {
  fetchBills,
  createBillOnServer,
  updateBillOnServer,
  voidBillOnServer,
  refundBillOnServer,
  settleCreditOnServer,
  recordPrintOnServer,
} from "@/lib/bills-api";

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

let bills: Bill[] = [];
const listeners = new Set<() => void>();

function setBills(next: Bill[]) {
  bills = next;
  listeners.forEach((l) => l());
}

export type CreateBillInput = {
  customer: string;
  customerId?: string | null;
  location: string;
  register: string;
  outletId: string | null;
  items: BillLineItem[];
  subtotal: number;
  discount: number;
  gst: number;
  bagQty?: number;
  bagCharge?: number;
  total: number;
  by: string;
  paymentMethod: Bill["paymentMethod"];
  paymentStatus: Bill["paymentStatus"];
  cashGiven?: number;
  changeGiven?: number;
  transferSlip?: string;
  recipientNumber?: string;
  cardSlipNumber?: string;
  customReceiptNumber?: string;
  note?: string;
  foc?: boolean;
  noDelivery?: boolean;
  tags?: string[];
  currency?: string;
  currencyRate?: number;
  currencyTotal?: number;
};

// Same "DD-Mon-YY, HH:MM" format the server stamps real bills with (see formatBillTimestamp
// in bills-server-store.ts) — duplicated here (rather than imported) since that file is
// server-only and can't be pulled into the client bundle.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatLocalTimestamp(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

// `customerId` narrowed from optional to required-but-nullable — every input is normalized
// to this shape before it's sent to the server or queued, so a queued retry never has to
// re-derive the `?? null` fallback.
type NormalizedBillInput = Omit<CreateBillInput, "customerId"> & { customerId: string | null };

// A bill rung up while Supabase was unreachable — saved on this device immediately (with a
// placeholder number) so the sale is never lost, and retried in the background until it
// syncs. See syncPendingBills below.
export type PendingBill = {
  bill: Bill;
  input: NormalizedBillInput;
  queuedAt: string;
  attempts: number;
  lastError?: string;
};

const pendingStore = createPersistedStore<PendingBill[]>("dhipos-pending-bills", []);

function buildPlaceholderBill(input: NormalizedBillInput): Bill {
  return {
    number: `PENDING-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    customer: input.customer,
    customerId: input.customerId ?? null,
    location: input.location,
    register: input.register,
    outletId: input.outletId,
    status: "Sale",
    items: input.items,
    subtotal: input.subtotal,
    discount: input.discount,
    gst: input.gst,
    bagQty: input.bagQty,
    bagCharge: input.bagCharge,
    total: input.total,
    created: formatLocalTimestamp(),
    by: input.by,
    paymentMethod: input.paymentMethod,
    paymentStatus: input.paymentStatus,
    cashGiven: input.cashGiven,
    changeGiven: input.changeGiven,
    transferSlip: input.transferSlip,
    recipientNumber: input.recipientNumber,
    cardSlipNumber: input.cardSlipNumber,
    customReceiptNumber: input.customReceiptNumber,
    note: input.note,
    foc: input.foc,
    noDelivery: input.noDelivery,
    tags: input.tags,
    currency: input.currency,
    currencyRate: input.currencyRate,
    currencyTotal: input.currencyTotal,
    pendingSync: true,
  };
}

// Optimistic-only (not authoritative) so this device's own "Not enough stock" checks stay
// sensible while offline — overwritten by the server's real numbers the moment this bill (or
// any refresh) syncs, so it can never compound into a wrong absolute value.
function applyOptimisticStock(items: BillLineItem[]) {
  const current = productsStore.get();
  const patches = items
    .map((i) => {
      const product = current.find((p) => p.id === i.productId);
      return product ? { productId: i.productId, stock: product.stock - i.qty } : null;
    })
    .filter((p): p is { productId: string; stock: number } => p !== null);
  productsStore.applyStockPatches(patches);
}

// Once a placeholder's real bill lands, this remembers "PENDING-xxx now means 1/234" — so
// anything still holding onto the placeholder number (e.g. the Sell page's Print dialog,
// opened the instant Save Bill was clicked) can resolve to the live bill via
// resolveBillNumber below instead of looking up a number that no longer exists.
const billNumberRedirects = new Map<string, string>();

export function resolveBillNumber(number: string): string {
  let current = number;
  while (billNumberRedirects.has(current)) current = billNumberRedirects.get(current)!;
  return current;
}

// Guards a single pending bill against being synced twice at once — e.g. the immediate
// fire-and-forget attempt right after Save Bill racing the periodic background loop, both
// picking up the same still-queued entry. Without this, both requests would reach
// createBillOnServer and create two real bills for one sale.
const inFlight = new Set<string>();

async function trySyncOne(pending: PendingBill): Promise<"synced" | "failed" | "skipped"> {
  if (inFlight.has(pending.bill.number)) return "skipped";
  inFlight.add(pending.bill.number);
  try {
    const result = await safeServerCall(() => createBillOnServer({ data: pending.input }));
    if ("networkError" in result) {
      pendingStore.set((queue) =>
        queue.map((p) =>
          p.bill.number === pending.bill.number
            ? { ...p, attempts: p.attempts + 1, lastError: result.error }
            : p,
        ),
      );
      return "failed";
    }
    billNumberRedirects.set(pending.bill.number, result.bill.number);
    setBills([result.bill, ...bills.filter((b) => b.number !== pending.bill.number)]);
    productsStore.applyStockPatches(result.updatedStock);
    logAudit(actor(), "create", `Bill / ${result.bill.number} (synced)`);
    pendingStore.set((queue) => queue.filter((p) => p.bill.number !== pending.bill.number));
    return "synced";
  } finally {
    inFlight.delete(pending.bill.number);
  }
}

let syncing = false;

// Pushes every queued bill to Supabase, oldest first. Stops at the first one that fails
// (network's presumably down) rather than reordering later ones ahead of it. Safe to call as
// often as needed — no-ops while empty or already running.
export async function syncPendingBills(): Promise<void> {
  if (syncing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  if (pendingStore.get().length === 0) return;
  syncing = true;
  try {
    for (const pending of pendingStore.get()) {
      const outcome = await trySyncOne(pending);
      if (outcome === "failed") break;
    }
  } finally {
    syncing = false;
  }
}

// Mounted once via AppShell's header (always on-screen while logged in) — drives automatic
// background retry so nobody has to remember to come back and resync manually.
export function usePendingBills(): PendingBill[] {
  const pending = usePersistedStore(pendingStore);
  useEffect(() => {
    void syncPendingBills();
    const id = setInterval(() => void syncPendingBills(), 15000);
    const onOnline = () => void syncPendingBills();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return pending;
}

function patchBill(number: string, patch: Partial<Bill>) {
  setBills(bills.map((b) => (b.number === number ? { ...b, ...patch } : b)));
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchBills());
  // Overlays any still-unsynced local bills on top of the server list — otherwise a page
  // reload while offline would make an already-queued sale briefly vanish from Bill History
  // (it's still safe in pendingStore, but this keeps what's on screen consistent with it)
  // until the next successful sync swaps in the real, server-assigned bill.
  if (!("networkError" in result)) {
    setBills([...pendingStore.get().map((p) => p.bill), ...result]);
  }
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// Actively refetches on mount and every `intervalMs` — call this from Bill History so
// sales rung up on other devices/registers show up without a manual refresh.
export function useBillsPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshFromServer();
    const id = setInterval(() => void refreshFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export const billsStore = {
  get: () => bills,

  // Always saves on this device first and returns immediately — Save Bill never waits on
  // Supabase. The real, server-assigned bill number is filled in moments later by the
  // background sync below (see trySyncOne), which is normally well under a second: anything
  // reading the bill reactively (useBills(), resolveBillNumber()) picks up the swap
  // automatically, so by the time a cashier actually hits Print it's almost always already
  // showing the real number rather than the placeholder.
  async create(input: CreateBillInput): Promise<Bill> {
    const normalized: NormalizedBillInput = { ...input, customerId: input.customerId ?? null };
    const placeholder = buildPlaceholderBill(normalized);
    setBills([placeholder, ...bills]);
    applyOptimisticStock(normalized.items);
    const pendingEntry: PendingBill = {
      bill: placeholder,
      input: normalized,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };
    pendingStore.set((queue) => [...queue, pendingEntry]);
    logAudit(actor(), "create", `Bill / ${placeholder.number} (saved on device)`);
    if (typeof navigator === "undefined" || navigator.onLine !== false) {
      void trySyncOne(pendingEntry);
    }
    return placeholder;
  },

  // Full edit of a sale's line items. Recomputes subtotal/GST/total from the current GST
  // rate and reconciles stock by the delta between old and new quantities per product (an
  // increase sells more stock, a decrease returns it) — done atomically on the server.
  async update(number: string, items: BillLineItem[]): Promise<{ ok: true } | { error: string }> {
    const gstPercent = settingsStore.get().tax.gstPercent;
    const result = await safeServerCall(() =>
      updateBillOnServer({ data: { number, items, actor: actor(), gstPercent } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} edited`);
    return { ok: true };
  },

  // Soft-delete: keeps the row for audit purposes, restores any stock that hadn't already
  // been refunded, and marks the bill Void.
  async void(number: string, reason?: string): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      voidBillOnServer({ data: { number, reason, actor: actor() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} voided`);
    return { ok: true };
  },

  // Partial or full refund. `lines` specifies how much of each product to refund now;
  // stock for the refunded quantity is restored immediately.
  async refund(
    number: string,
    lines: { productId: string; qty: number }[],
    reason?: string,
  ): Promise<{ ok: true } | { error: string }> {
    const result = await safeServerCall(() =>
      refundBillOnServer({ data: { number, lines, reason, actor: actor() } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    productsStore.applyStockPatches(result.updatedStock);
    await refreshFromServer();
    logAudit(actor(), "update", `Bill / ${number} refunded ${result.amount.toFixed(2)}`);
    return { ok: true };
  },

  // Records a payment (full or partial) toward a Credit sale's outstanding balance —
  // paymentStatus only flips to "Paid" once enough of these add up to cover the total.
  // Available to any user — recording a customer's payment is routine, not a correction.
  async settleCredit(
    number: string,
    amount: number,
    method: string,
  ): Promise<{ ok: true; remaining: number } | { error: string }> {
    const result = await safeServerCall(() =>
      settleCreditOnServer({ data: { number, actor: actor(), amount, method } }),
    );
    if ("networkError" in result) return { error: result.error };
    if ("error" in result) return result;
    await refreshFromServer();
    logAudit(
      actor(),
      "update",
      `Bill / ${number} payment of ${amount.toFixed(2)} recorded via ${method}`,
    );
    return { ok: true, remaining: result.remaining };
  },

  // Silent — just remembers which template a bill was last printed with.
  async recordPrint(number: string, templateId: string): Promise<void> {
    const result = await safeServerCall(() =>
      recordPrintOnServer({ data: { number, templateId } }),
    );
    if (!("networkError" in result)) patchBill(number, { printTemplateId: templateId });
  },
};

export function useBills(): Bill[] {
  useEffect(() => ensureInitialFetch(), []);
  const allBills = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => bills,
    () => bills,
  );
  // Restricted to the current user's own outlet everywhere (Bill History, every Report and
  // Analytics page) — Super Admin sees every outlet's bills combined, unrestricted.
  const scopeOutletId = useScopeOutletId();
  return useMemo(
    () => (scopeOutletId ? allBills.filter((b) => b.outletId === scopeOutletId) : allBills),
    [allBills, scopeOutletId],
  );
}
