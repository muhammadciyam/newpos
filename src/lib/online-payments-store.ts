import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { type OnlinePayment } from "@/lib/pos-data";
import { logAudit } from "@/lib/audit-log-store";

const store = createPersistedStore<OnlinePayment[]>("dhipos-online-payments", []);

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

export const onlinePaymentsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  create(input: { billNumber: string; amount: number; reference: string; receiptSlip: string; by: string }) {
    const payment: OnlinePayment = {
      id: `pay-${Date.now()}`,
      billNumber: input.billNumber,
      amount: input.amount,
      status: "Success",
      created: formatNow(),
      by: input.by,
      reference: input.reference,
      receiptSlip: input.receiptSlip,
    };
    store.set((ps) => [payment, ...ps]);
    logAudit(input.by, "create", `Online Payment / Bill ${input.billNumber}`);
    return payment;
  },
};

export function useOnlinePayments() {
  return usePersistedStore(store);
}
