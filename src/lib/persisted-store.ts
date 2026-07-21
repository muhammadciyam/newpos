import { useEffect, useSyncExternalStore } from "react";

export type PersistedStore<T> = {
  subscribe(cb: () => void): () => void;
  get(): T;
  set(updater: T | ((state: T) => T)): void;
  hydrate(): void;
};

// "local" (the default) is shared across every tab of the same browser, same as always.
// "session" is sessionStorage instead — unique to the one tab it was set in, and gone when
// that tab closes — used for state that should let one browser run two genuinely independent
// sessions side by side in two tabs (see auth-store.ts's login session, register-store.ts's
// locally-open register, and sale-tabs-store.ts's held cart), rather than the second tab's
// activity silently overwriting what the first tab thinks is still true.
export function createPersistedStore<T>(
  key: string,
  initial: T,
  storage: "local" | "session" = "local",
): PersistedStore<T> {
  let state: T = initial;
  let hydrated = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function backingStorage(): Storage | null {
    if (typeof window === "undefined") return null;
    return storage === "session" ? window.sessionStorage : window.localStorage;
  }

  function readFromStorage(): boolean {
    const backing = backingStorage();
    if (!backing) return false;
    try {
      const raw = backing.getItem(key);
      if (raw) {
        state = JSON.parse(raw) as T;
        return true;
      }
    } catch {
      // ignore malformed/unavailable storage
    }
    return false;
  }

  function persist() {
    const backing = backingStorage();
    if (!backing) return;
    try {
      backing.setItem(key, JSON.stringify(state));
    } catch {
      // storage unavailable (private mode, quota, etc.) — in-memory state still works
    }
  }

  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get() {
      return state;
    },
    set(updater) {
      // If nothing has hydrated this store yet in the current page load, pull in
      // whatever is already persisted first. Otherwise a mutation fired from a
      // page that never reads this store (e.g. an audit-log write triggered from
      // a page that doesn't render the audit log) would overwrite localStorage
      // with stale in-memory state and silently wipe out earlier entries.
      if (!hydrated) {
        readFromStorage();
        hydrated = true;
      }
      state = typeof updater === "function" ? (updater as (s: T) => T)(state) : updater;
      persist();
      emit();
    },
    hydrate() {
      // Runs once on the client after mount so the first client render still
      // matches the server-rendered snapshot (avoids hydration mismatches).
      if (hydrated || typeof window === "undefined") return;
      hydrated = true;
      if (readFromStorage()) emit();
    },
  };
}

export function usePersistedStore<T>(store: PersistedStore<T>): T {
  useEffect(() => {
    store.hydrate();
  }, [store]);
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
