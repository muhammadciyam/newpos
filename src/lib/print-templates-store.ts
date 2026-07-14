import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type PrintTemplateId =
  | "standard-a4"
  | "compact-a4"
  | "thermal-80mm"
  | "thermal-58mm"
  | "detailed-tax-invoice"
  | "simple-receipt";

export type PrintTemplate = {
  id: PrintTemplateId;
  name: string;
  description: string;
  paperWidth: "a4" | "80mm" | "58mm";
  showLogo: boolean;
  showItemizedTax: boolean;
  showQrCode: boolean;
  footerNote: string;
};

export const printTemplates: PrintTemplate[] = [
  {
    id: "standard-a4",
    name: "Standard A4 Invoice",
    description: "Full tax invoice on A4 paper with logo and itemized tax breakdown.",
    paperWidth: "a4",
    showLogo: true,
    showItemizedTax: true,
    showQrCode: true,
    footerNote: "Thank you for your business.",
  },
  {
    id: "compact-a4",
    name: "Compact A4",
    description: "Condensed A4 layout with a single combined tax line.",
    paperWidth: "a4",
    showLogo: true,
    showItemizedTax: false,
    showQrCode: true,
    footerNote: "Goods sold are not returnable.",
  },
  {
    id: "thermal-80mm",
    name: "Thermal 80mm Receipt",
    description: "Standard receipt-printer width, no logo, fast to print.",
    paperWidth: "80mm",
    showLogo: false,
    showItemizedTax: false,
    showQrCode: true,
    footerNote: "Thank you, come again!",
  },
  {
    id: "thermal-58mm",
    name: "Thermal 58mm Receipt",
    description: "Narrow receipt-printer width for compact counters.",
    paperWidth: "58mm",
    showLogo: false,
    showItemizedTax: false,
    showQrCode: false,
    footerNote: "Thank you!",
  },
  {
    id: "detailed-tax-invoice",
    name: "Detailed Tax Invoice",
    description: "A4 with a full itemized tax breakdown for accounting records.",
    paperWidth: "a4",
    showLogo: true,
    showItemizedTax: true,
    showQrCode: true,
    footerNote: "This is a computer-generated tax invoice.",
  },
  {
    id: "simple-receipt",
    name: "Simple Receipt",
    description: "Minimal A4 receipt with no tax breakdown, low ink usage.",
    paperWidth: "a4",
    showLogo: false,
    showItemizedTax: false,
    showQrCode: false,
    footerNote: "",
  },
];

type State = { defaultTemplateId: PrintTemplateId };

const store = createPersistedStore<State>("dhipos-print-settings", {
  defaultTemplateId: "standard-a4",
});

export const printTemplatesStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  getTemplate(id: PrintTemplateId | undefined): PrintTemplate {
    return printTemplates.find((t) => t.id === id) ?? printTemplates[0];
  },
  setDefault(id: PrintTemplateId) {
    store.set({ defaultTemplateId: id });
    logAudit(
      authStore.getCurrentUser()?.name ?? "System",
      "update",
      `Print Template / default set to "${id}"`,
    );
  },
};

export function usePrintSettings() {
  return usePersistedStore(store);
}
