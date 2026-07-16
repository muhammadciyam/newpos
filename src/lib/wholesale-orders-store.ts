import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { productsStore } from "@/lib/products-store";

export type WholesaleOrderItem = {
  productId: string;
  name: string;
  // Snapshot of the price actually charged for this line (wholesale price if the product
  // had one configured, otherwise its regular price at the time this line was added).
  price: number;
  qty: number;
};

export type WholesaleOrderStatus = "Draft" | "Sent" | "Confirmed" | "Cancelled";

export type WholesaleOrder = {
  id: string;
  number: string;
  wholesalerId: string;
  // Snapshotted so the order still shows a name even if the wholesaler is later renamed
  // or deleted.
  wholesalerName: string;
  items: WholesaleOrderItem[];
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  status: WholesaleOrderStatus;
  paymentStatus: "Pending" | "Paid";
  deliveryStatus: "Pending" | "Delivered";
  notes: string;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
};

// Local-only, per-device — same pattern as Purchase Invoices and Quotations.
const store = createPersistedStore<WholesaleOrder[]>("dhipos-wholesale-orders", []);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

function formatNow(): string {
  const d = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(2)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const wholesaleOrdersStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,

  create(input: {
    wholesalerId: string;
    wholesalerName: string;
    items: WholesaleOrderItem[];
    subtotal: number;
    discount: number;
    gst: number;
    total: number;
    notes: string;
    submit: boolean; // false = save as Draft, true = mark Sent immediately
  }): WholesaleOrder {
    const seq = store.get().length + 1;
    const now = formatNow();
    const order: WholesaleOrder = {
      id: `wo-${Date.now()}`,
      number: `WO/${seq}`,
      wholesalerId: input.wholesalerId,
      wholesalerName: input.wholesalerName,
      items: input.items,
      subtotal: input.subtotal,
      discount: input.discount,
      gst: input.gst,
      total: input.total,
      status: input.submit ? "Sent" : "Draft",
      paymentStatus: "Pending",
      deliveryStatus: "Pending",
      notes: input.notes,
      createdBy: actor(),
      createdAt: now,
      sentAt: input.submit ? now : null,
      confirmedAt: null,
      cancelledAt: null,
    };
    store.set((os) => [order, ...os]);
    logAudit(actor(), "create", `Wholesale Order / ${order.number} (${order.wholesalerName})`);
    return order;
  },

  // Drafts only — once Sent/Confirmed/Cancelled, an order is a fixed record.
  updateDraft(
    id: string,
    patch: Partial<
      Pick<WholesaleOrder, "items" | "subtotal" | "discount" | "gst" | "total" | "notes">
    >,
  ) {
    const order = store.get().find((o) => o.id === id);
    if (!order || order.status !== "Draft") return;
    store.set((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  },

  markSent(id: string) {
    const order = store.get().find((o) => o.id === id);
    if (!order || order.status !== "Draft") return;
    store.set((os) =>
      os.map((o) => (o.id === id ? { ...o, status: "Sent", sentAt: formatNow() } : o)),
    );
    logAudit(actor(), "update", `Wholesale Order / ${order.number} sent`);
  },

  // Confirms the order and deducts stock — the one point stock actually changes, mirroring
  // how a Purchase Invoice only adjusts stock on approval, not on creation.
  async confirm(id: string): Promise<{ ok: true } | { error: string }> {
    const order = store.get().find((o) => o.id === id);
    if (!order) return { error: "Order not found" };
    if (order.status !== "Sent" && order.status !== "Draft") {
      return { error: `Cannot confirm an order that is ${order.status}` };
    }
    for (const item of order.items) {
      await productsStore.increaseStock(item.productId, -item.qty);
    }
    store.set((os) =>
      os.map((o) => (o.id === id ? { ...o, status: "Confirmed", confirmedAt: formatNow() } : o)),
    );
    logAudit(actor(), "update", `Wholesale Order / ${order.number} confirmed`);
    return { ok: true };
  },

  cancel(id: string) {
    const order = store.get().find((o) => o.id === id);
    if (!order || order.status === "Confirmed" || order.status === "Cancelled") return;
    store.set((os) =>
      os.map((o) => (o.id === id ? { ...o, status: "Cancelled", cancelledAt: formatNow() } : o)),
    );
    logAudit(actor(), "update", `Wholesale Order / ${order.number} cancelled`);
  },

  remove(id: string) {
    const order = store.get().find((o) => o.id === id);
    if (!order || order.status !== "Draft") return;
    store.set((os) => os.filter((o) => o.id !== id));
    logAudit(actor(), "delete", `Wholesale Order / ${order.number}`);
  },

  setPaymentStatus(id: string, paymentStatus: WholesaleOrder["paymentStatus"]) {
    store.set((os) => os.map((o) => (o.id === id ? { ...o, paymentStatus } : o)));
  },

  setDeliveryStatus(id: string, deliveryStatus: WholesaleOrder["deliveryStatus"]) {
    store.set((os) => os.map((o) => (o.id === id ? { ...o, deliveryStatus } : o)));
  },
};

export function useWholesaleOrders(): WholesaleOrder[] {
  return usePersistedStore(store);
}
