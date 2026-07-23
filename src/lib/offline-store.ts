import { useEffect } from "react";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";

// A single pending change to one record, keyed by that record's id (its real server id, or —
// while a `create` hasn't synced yet — a temporary local id). Later actions on the same
// record REPLACE the earlier queued one instead of piling up as a history to replay in
// order: editing a record you haven't even synced yet just updates its still-pending
// `create` payload in place, and deleting it removes the slot outright — the server never
// needs to hear about a record that was created and deleted again before it ever left this
// device. Only the final state has to reach Supabase, not every intermediate edit.
export type OutboxEntry<TPayload> =
  | { op: "create"; payload: TPayload; queuedAt: string; attempts: number; lastError?: string }
  | {
      op: "update";
      patch: Partial<TPayload>;
      queuedAt: string;
      attempts: number;
      lastError?: string;
    }
  | { op: "remove"; queuedAt: string; attempts: number; lastError?: string };

export type Outbox<TPayload> = Record<string, OutboxEntry<TPayload>>;

function isValidOutbox(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object" && !Array.isArray(raw);
}

// Backs one resource's (products/customers/expenses/...) queue of not-yet-synced
// add/edit/delete actions — persisted so it survives a reload while still offline.
export function createOutboxStore<TPayload>(storageKey: string) {
  const store = createPersistedStore<Outbox<TPayload>>(storageKey, {});

  // createPersistedStore trusts whatever's in localStorage as-is — guard against a
  // corrupted or pre-this-feature value crashing every reader instead of just dropping it,
  // same precaution bills-store.ts's isValidPendingBill takes.
  function sanitize(raw: unknown): Outbox<TPayload> {
    return isValidOutbox(raw) ? (raw as Outbox<TPayload>) : {};
  }

  return {
    get: () => sanitize(store.get()),
    useOutbox(): Outbox<TPayload> {
      return sanitize(usePersistedStore(store));
    },

    queueCreate(id: string, payload: TPayload) {
      store.set((o) => ({
        ...sanitize(o),
        [id]: { op: "create", payload, queuedAt: new Date().toISOString(), attempts: 0 },
      }));
    },

    // Folds into a still-pending create/update rather than layering a separate entry.
    queueUpdate(id: string, patch: Partial<TPayload>) {
      store.set((o) => {
        const outbox = sanitize(o);
        const existing = outbox[id];
        if (existing?.op === "create") {
          return { ...outbox, [id]: { ...existing, payload: { ...existing.payload, ...patch } } };
        }
        const mergedPatch = existing?.op === "update" ? { ...existing.patch, ...patch } : patch;
        return {
          ...outbox,
          [id]: {
            op: "update",
            patch: mergedPatch,
            queuedAt: new Date().toISOString(),
            attempts: 0,
          },
        };
      });
    },

    queueRemove(id: string) {
      store.set((o) => {
        const outbox = sanitize(o);
        // Never made it to the server in the first place — nothing to tell it anymore.
        if (outbox[id]?.op === "create") {
          const next = { ...outbox };
          delete next[id];
          return next;
        }
        return {
          ...outbox,
          [id]: { op: "remove", queuedAt: new Date().toISOString(), attempts: 0 },
        };
      });
    },

    // Clears a queue entry once it's synced (or been rejected for a reason retrying won't fix).
    resolve(id: string) {
      store.set((o) => {
        const outbox = sanitize(o);
        if (!(id in outbox)) return outbox;
        const next = { ...outbox };
        delete next[id];
        return next;
      });
    },

    // Renames a queued entry's key — used once a pending `create`'s temporary local id is
    // replaced by the server-assigned real id.
    rekey(fromId: string, toId: string) {
      store.set((o) => {
        const outbox = sanitize(o);
        const entry = outbox[fromId];
        if (!entry) return outbox;
        const next = { ...outbox };
        delete next[fromId];
        next[toId] = entry;
        return next;
      });
    },

    markFailed(id: string, error: string) {
      store.set((o) => {
        const outbox = sanitize(o);
        const existing = outbox[id];
        if (!existing) return outbox;
        return {
          ...outbox,
          [id]: { ...existing, attempts: existing.attempts + 1, lastError: error },
        };
      });
    },
  };
}

// Serialized, retrying background sync — the same shape as bills-store.ts's own pending-bill
// loop: attempt each queued entry, stop at the first one that fails to even reach the server
// (assume the connection's down rather than hammering it), retry on an interval and whenever
// the browser comes back online.
export function createSyncScheduler(sync: () => Promise<void>, intervalMs = 15000) {
  let syncing = false;

  async function run() {
    if (syncing) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    syncing = true;
    try {
      await sync();
    } finally {
      syncing = false;
    }
  }

  // Mounted once via AppShell (see usePendingBills for the established pattern) so background
  // retry happens automatically without every page needing to remember to trigger it.
  function usePendingSync() {
    useEffect(() => {
      void run();
      const id = setInterval(() => void run(), intervalMs);
      const onOnline = () => void run();
      window.addEventListener("online", onOnline);
      return () => {
        clearInterval(id);
        window.removeEventListener("online", onOnline);
      };
    }, []);
  }

  return { run, usePendingSync };
}
