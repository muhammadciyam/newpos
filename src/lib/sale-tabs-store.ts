import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import type { Product } from "@/lib/pos-data";

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
  };
}

type SaleTabsState = { tabs: SaleTab[]; activeTab: number; nextTabId: number };

// Persisted so a held sale (items added but not yet saved as a bill) survives a
// refresh or the browser being closed and reopened — nothing is lost by holding.
const store = createPersistedStore<SaleTabsState>("dhipos-sale-tabs", {
  tabs: [emptySaleTab(0)],
  activeTab: 0,
  nextTabId: 1,
});

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
};

export function useSaleTabs() {
  return usePersistedStore(store);
}
