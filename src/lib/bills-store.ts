import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { type Bill } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

const store = createPersistedStore<Bill[]>("dhipos-bills", []);

function formatNow() {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${month}-${year}, ${hours}:${mins}`;
}

export const billsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(input: { customer: string; location: string; register: string; total: number; by: string }) {
    const existing = store.get();
    const maxSeq = existing.reduce((max, b) => {
      const seq = parseInt(b.number.split("/")[1] ?? "0", 10);
      return Number.isFinite(seq) ? Math.max(max, seq) : max;
    }, 0);
    const bill: Bill = {
      number: `1/${maxSeq + 1}`,
      customer: input.customer,
      location: input.location,
      register: input.register,
      status: "Sale",
      total: input.total,
      created: formatNow(),
      by: input.by,
    };
    store.set((bs) => [bill, ...bs]);
    logAudit(authStore.getCurrentUser()?.name ?? input.by, "create", `Bill / ${bill.number}`);
    return bill;
  },
};

export function useBills() {
  return usePersistedStore(store);
}
