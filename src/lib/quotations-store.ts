import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type Quotation = {
  number: string;
  location: string;
  customer: string;
  status: "Pending" | "Accepted" | "Declined";
  total: number;
  created: string;
};

const store = createPersistedStore<Quotation[]>("dhipos-quotations", []);

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

export const quotationsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(location: string, customer: string) {
    const seq = store.get().length + 1;
    const quotation: Quotation = {
      number: `QT/${seq}`,
      location,
      customer,
      status: "Pending",
      total: 0,
      created: formatNow(),
    };
    store.set((qs) => [quotation, ...qs]);
    logAudit(authStore.getCurrentUser()?.name ?? "System", "create", `Quotation / ${quotation.number}`);
    return quotation;
  },
};

export function useQuotations() {
  return usePersistedStore(store);
}
