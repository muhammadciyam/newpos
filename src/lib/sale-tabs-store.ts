import { useEffect } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import type { Product } from "@/lib/pos-data";
import {
  useRegister,
  ensureRegistersFetched,
  getServerRegisters,
  type RegisterName,
} from "@/lib/register-store";
import { saveHeldBillOnServer } from "@/lib/register-api";
import { safeServerCall } from "@/lib/server-fn-helpers";
import { authStore } from "@/lib/auth-store";

function caller() {
  const user = authStore.getCurrentUser();
  return { role: user?.role ?? "", callerOutletId: user?.outletId ?? null };
}

export type CartLine = { product: Product; qty: number; priceOverride?: number };

export type SaleTab = {
  id: number;
  items: CartLine[];
  cashReceived: string;
  customerId: string | null;
  payMethod: string;
  transferSlip: string;
  recipientNumber: string;
  cardSlipNumber: string;
  // Required reference for any custom payment method (anything other than the 4
  // built-ins) — those have no other collection fields of their own, so this is the one
  // thing tying the sale to proof of payment (e.g. a mobile wallet transaction ID).
  customReceiptNumber: string;
  note: string;
  foc: boolean;
  noDelivery: boolean;
  bagEnabled: boolean;
  bagQty: string;
  tags: string[];
  currency: string | null;
  currencyRate: number | null;
  // Manually-applied discount (via the Discount quick action) — null/empty means none.
  // Ignored while `foc` is on, since FOC already zeroes the whole bill out.
  discountType: "percent" | "amount" | null;
  discountValue: string;
  // Set when this tab's items were loaded in via Quotations' "Convert to Sale" — the
  // quotation was already marked Converted at that point (see quotations-store.ts), so if
  // this tab gets discarded instead of actually saved as a bill, that conversion needs to be
  // undone (back to Accepted) rather than silently leaving a "Converted" quotation with no
  // bill behind it. Cleared once this tab's outcome (saved or discarded) is settled either way.
  fromQuotation: string | null;
};

export function emptySaleTab(id: number): SaleTab {
  return {
    id,
    items: [],
    cashReceived: "0.00",
    customerId: null,
    payMethod: "Cash",
    transferSlip: "",
    recipientNumber: "",
    cardSlipNumber: "",
    customReceiptNumber: "",
    note: "",
    foc: false,
    noDelivery: false,
    bagEnabled: false,
    bagQty: "1",
    tags: [],
    currency: null,
    currencyRate: null,
    discountType: null,
    discountValue: "",
    fromQuotation: null,
  };
}

type SaleTabsState = { tabs: SaleTab[]; activeTab: number; nextTabId: number };

function emptySaleTabsState(): SaleTabsState {
  return { tabs: [emptySaleTab(0)], activeTab: 0, nextTabId: 1 };
}

// Minimal shape check before trusting data that came back from the server as `unknown`.
function isSaleTabsState(x: unknown): x is SaleTabsState {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<SaleTabsState>;
  return (
    Array.isArray(s.tabs) && typeof s.activeTab === "number" && typeof s.nextTabId === "number"
  );
}

// Backfills the Note/FOC/No Delivery/Tags/Currency fields onto a held bill saved before
// those existed, so an older held sale doesn't crash the UI with `undefined` fields.
function normalizeState(s: SaleTabsState): SaleTabsState {
  return {
    ...s,
    tabs: s.tabs.map((t) => ({ ...emptySaleTab(t.id), ...t })),
  };
}

// Persisted (per-TAB — sessionStorage, not shared across the browser, so two tabs can hold
// two different outlets' carts at once) so a held sale (items added but not yet saved as a
// bill) survives a refresh — nothing is lost by holding. This is the LOCAL mirror; the source
// of truth for "what's held on register X" lives server-side on the register record itself
// (see useSaleTabs below), so a held bill survives moving to a different tab/device too, not
// just a refresh — closing this tab only loses the local mirror, not the actual held sale.
const store = createPersistedStore<SaleTabsState>(
  "dhipos-sale-tabs",
  emptySaleTabsState(),
  "session",
);

export const saleTabsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  set: store.set,
  newTab() {
    let newId = 0;
    store.set((s) => {
      newId = s.nextTabId;
      return {
        tabs: [...s.tabs, emptySaleTab(newId)],
        activeTab: newId,
        nextTabId: s.nextTabId + 1,
      };
    });
    return newId;
  },
  // There must always be at least one sale window open — closing the last remaining tab
  // just resets it in place instead, same as discarding it.
  closeTab(id: number) {
    store.set((s) => {
      if (s.tabs.length <= 1) {
        return { ...s, tabs: s.tabs.map((t) => (t.id === id ? emptySaleTab(t.id) : t)) };
      }
      const remaining = s.tabs.filter((t) => t.id !== id);
      const activeTab = s.activeTab === id ? remaining[remaining.length - 1].id : s.activeTab;
      return { ...s, tabs: remaining, activeTab };
    });
  },
};

// Which register the local `store` is currently known to mirror — module-level (not a
// per-component ref) so that more than one component can call useSaleTabs() for the same
// register (e.g. the Sell page and the register-closing screen both mounted at once)
// without each one's own first mount re-hydrating from the server and clobbering local
// changes the other hasn't saved yet.
let linkedRegister: RegisterName | null = null;

// A quotation's items, queued by Quotations' "Convert to Sale" to land in a fresh Sell page
// tab. Deliberately NOT written straight into `store` at queue time — the Sell page's own
// mount effect below re-hydrates `store` from whatever's held on the target register (async,
// runs after navigation), which would otherwise silently overwrite a tab added just before
// it. Queuing here and draining it only once that hydration (or the "already linked, no
// hydration needed" fast path) has had its say keeps the import from ever getting clobbered.
let pendingQuotationImport: {
  items: CartLine[];
  customerId: string | null;
  quotationNumber: string;
} | null = null;

export function queueQuotationImport(
  items: CartLine[],
  customerId: string | null,
  quotationNumber: string,
) {
  pendingQuotationImport = { items, customerId, quotationNumber };
}

function applyPendingQuotationImport() {
  const pending = pendingQuotationImport;
  if (!pending) return;
  pendingQuotationImport = null;
  store.set((s) => {
    const newId = s.nextTabId;
    return {
      tabs: [
        ...s.tabs,
        {
          ...emptySaleTab(newId),
          items: pending.items,
          customerId: pending.customerId,
          fromQuotation: pending.quotationNumber,
        },
      ],
      activeTab: newId,
      nextTabId: newId + 1,
    };
  });
}

// Ties the held/parked sale(s) to whichever register is currently open on this device:
// switching to a register loads whatever was already held on it (possibly from a
// different device, if it was force-closed and reopened here), and every change while a
// register is open is saved back to that register (debounced) so it's never stuck only
// in this one browser's storage.
export function useSaleTabs(): SaleTabsState {
  const localState = usePersistedStore(store);
  const register = useRegister();
  const registerName = register.register;

  useEffect(() => {
    if (!registerName) {
      linkedRegister = null;
      return;
    }
    if (linkedRegister === registerName) {
      // Already mirroring this register this session, so nothing is about to overwrite
      // `store` out from under a queued import — safe to apply immediately.
      applyPendingQuotationImport();
      return;
    }
    linkedRegister = registerName;
    let cancelled = false;
    // Must wait for the registers fetch to actually land before deciding whether to
    // hydrate from a held bill or reset to empty — on a fresh page load (e.g. right after
    // a refresh) the server snapshot starts out as an empty placeholder, and deciding
    // against that would silently wipe out a held bill that was saved just before the
    // reload, then (via the debounced save effect below) overwrite it server-side too.
    void ensureRegistersFetched().then(() => {
      if (cancelled || linkedRegister !== registerName) return;
      const heldBill = getServerRegisters()[registerName]?.heldBill;
      store.set(isSaleTabsState(heldBill) ? normalizeState(heldBill) : emptySaleTabsState());
      applyPendingQuotationImport();
    });
    return () => {
      cancelled = true;
    };
  }, [registerName]);

  useEffect(() => {
    if (!registerName) return;
    const id = setTimeout(() => {
      void safeServerCall(() =>
        saveHeldBillOnServer({ data: { name: registerName, heldBill: localState, ...caller() } }),
      );
    }, 800);
    return () => clearTimeout(id);
  }, [registerName, localState]);

  return localState;
}

// Read-only local mirror for UI that just wants to preview what's currently held (e.g. a
// "N held sales" note on the register-closing screen) without owning the hydrate/save
// side effects itself — those belong solely to the Sell page's useSaleTabs() call.
export function useHeldTabsPreview(): SaleTabsState {
  return usePersistedStore(store);
}

// Forces an immediate (non-debounced) save of whatever's currently held for `registerName`
// — called right before closing a register so a cart change made in the last 800ms can't
// be lost to the debounce timer. A no-op unless the local store is actually linked to this
// register (i.e. this device visited Sell for it this session) — otherwise there's nothing
// fresher locally than what the server already has, and flushing would overwrite it with
// an unrelated/stale local snapshot.
export async function flushHeldBill(registerName: RegisterName): Promise<void> {
  if (linkedRegister !== registerName) return;
  await safeServerCall(() =>
    saveHeldBillOnServer({ data: { name: registerName, heldBill: store.get(), ...caller() } }),
  );
}
