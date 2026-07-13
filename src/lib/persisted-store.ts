import { useEffect, useSyncExternalStore } from "react";

export type PersistedStore<T> = {
  subscribe(cb: () => void): () => void;
  get(): T;
  set(updater: T | ((state: T) => T)): void;
  hydrate(): void;
};

export function createPersistedStore<T>(key: string, initial: T): PersistedStore<T> {
  let state: T = initial;
  let hydrated = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function readFromStorage(): boolean {
    if (typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(key);
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
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
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
