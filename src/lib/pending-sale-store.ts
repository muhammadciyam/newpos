import { useSyncExternalStore } from "react";

// Deliberately NOT a createPersistedStore: the Sell page's cart is component-local
// state that's already lost on refresh. If this flag were written to localStorage
// it would outlive a page refresh even though the cart didn't, permanently and
// incorrectly blocking logout. A plain in-memory module store avoids that.
let hasUnsavedItems = false;
const listeners = new Set<() => void>();

export const pendingSaleStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: () => hasUnsavedItems,
  set(value: boolean) {
    if (hasUnsavedItems === value) return;
    hasUnsavedItems = value;
    listeners.forEach((l) => l());
  },
};

export function useHasPendingSale(): boolean {
  return useSyncExternalStore(pendingSaleStore.subscribe, pendingSaleStore.get, () => false);
}
