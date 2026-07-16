import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type AlternateCurrency = { code: string; rate: number };
// `key` is the stable identifier the Sell page and every Bill/report keys off
// ("Cash"/"Card"/"Bank Transfer" — matching Bill["paymentMethod"]'s literal type) and is
// never itself editable. `name` is purely the display label shown in the Payments table
// and the Sell page's dropdown, so renaming one here (e.g. "Card" -> "Credit Card")
// relabels Sell immediately without touching any stored Bill data or report logic, which
// all still compare against `key`. Custom methods added with no matching key are
// reference-only — they have no collection workflow on the Sell page.
export type PaymentMethodConfig = {
  key?: "Cash" | "Card" | "Bank Transfer";
  name: string;
  type: string;
  details: string;
};
export type NumberFormatConfig = { type: string; format: string };
export type WebhookConfig = {
  id: string;
  url: string;
  event: string;
  authHeader: string;
  active: boolean;
};

export type AppSettings = {
  general: {
    currency: string;
    timezone: string;
    uniqueCustomerMobile: boolean;
    optimizeBillHistoryLoading: boolean;
    smsShortCode: string;
    // Manually-entered display-only rates (relative to `currency`) for the Sell page's
    // Currency quick action — no live rate lookups, this app has no external API calls.
    alternateCurrencies: AlternateCurrency[];
    // Data URL of the uploaded PNG logo (read client-side via FileReader) — no file
    // storage backend exists here, so it's kept inline like employee/ID photos already are.
    companyLogo: string | null;
  };
  sales: {
    salesPriceEditable: boolean;
    allowSellBelowCost: boolean;
    restrictExpiredBatches: boolean;
    allowSellWithoutStock: boolean;
    billDateIsRegisterDate: boolean;
    allowSetBillDate: boolean;
    salesEmail: string;
  };
  payments: {
    methods: PaymentMethodConfig[];
  };
  numbering: {
    formats: NumberFormatConfig[];
  };
  webhooks: {
    hooks: WebhookConfig[];
  };
  myDhipos: {
    enabled: boolean;
    eBillQrEnabled: boolean;
  };
  product: {
    skuRequired: boolean;
    barcodeAutoGenerate: boolean;
  };
  customer: {
    defaultCreditLimit: number;
    requireMobileOnCreate: boolean;
  };
  transfer: {
    requireApprovalForTransfers: boolean;
  };
  purchases: {
    requireGstNumberForSupplier: boolean;
    defaultPaymentTermsDays: number;
  };
  tax: {
    gstPercent: number;
    taxInclusivePricing: boolean;
    gstLabel: string;
  };
  serviceFees: {
    enabled: boolean;
    feePercent: number;
    feeLabel: string;
  };
  printing: {
    autoPrintOnSave: boolean;
    printCopies: number;
  };
  localData: {
    autoBackupReminder: boolean;
  };
  discounts: {
    giftCardsEnabled: boolean;
    loyaltyProgramsEnabled: boolean;
    onlyFixedDiscounts: boolean;
  };
  inventory: {
    stockAdjustmentTypes: string[];
    locationLevelReorderLimit: boolean;
  };
  restaurant: {
    enabled: boolean;
  };
};

const defaults: AppSettings = {
  general: {
    currency: "MVR",
    timezone: "maldives",
    uniqueCustomerMobile: true,
    optimizeBillHistoryLoading: true,
    smsShortCode: "SEVENMART",
    alternateCurrencies: [{ code: "USD", rate: 15.42 }],
    companyLogo: null,
  },
  sales: {
    salesPriceEditable: false,
    allowSellBelowCost: false,
    restrictExpiredBatches: false,
    allowSellWithoutStock: false,
    billDateIsRegisterDate: false,
    allowSetBillDate: false,
    salesEmail: "",
  },
  payments: {
    methods: [
      { key: "Cash", name: "Cash", type: "manual", details: "" },
      { key: "Card", name: "Card", type: "manual", details: "" },
      { key: "Bank Transfer", name: "Bank Transfer", type: "bank-transfer", details: "7730000639888" },
    ],
  },
  numbering: {
    formats: [
      { type: "Bill", format: "{registerNumber}/{sequence}" },
      { type: "Payments", format: "P/{year:4}/{sequence}" },
      { type: "Quotations", format: "QT/{sequence}" },
      { type: "Purchase Orders", format: "PO/{sequence}" },
      { type: "Purchase Receives", format: "PR/{sequence}" },
      { type: "Transfer Requests", format: "TR/{sequence}" },
    ],
  },
  webhooks: {
    hooks: [],
  },
  myDhipos: {
    enabled: false,
    eBillQrEnabled: true,
  },
  product: {
    skuRequired: false,
    barcodeAutoGenerate: true,
  },
  customer: {
    defaultCreditLimit: 0,
    requireMobileOnCreate: false,
  },
  transfer: {
    requireApprovalForTransfers: true,
  },
  purchases: {
    requireGstNumberForSupplier: false,
    defaultPaymentTermsDays: 30,
  },
  tax: {
    gstPercent: 8,
    taxInclusivePricing: false,
    gstLabel: "GST",
  },
  serviceFees: {
    enabled: false,
    feePercent: 0,
    feeLabel: "Service Charge",
  },
  printing: {
    autoPrintOnSave: false,
    printCopies: 1,
  },
  localData: {
    autoBackupReminder: true,
  },
  discounts: {
    giftCardsEnabled: false,
    loyaltyProgramsEnabled: true,
    onlyFixedDiscounts: false,
  },
  inventory: {
    stockAdjustmentTypes: ["Lost / Stolen", "Expired", "Stock Recount", "Damaged"],
    locationLevelReorderLimit: false,
  },
  restaurant: {
    enabled: false,
  },
};

const store = createPersistedStore<AppSettings>("dhipos-settings", defaults);

function actor() {
  return authStore.getCurrentUser()?.name ?? "System";
}

export const settingsStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,
  updateSection<K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) {
    store.set((s) => ({ ...s, [section]: { ...s[section], ...patch } }));
    logAudit(actor(), "update", `Settings / ${String(section)}`);
  },
};

// Backfills `key` for payment methods saved by an older version of this store (before
// `key` existed), by matching their still-original `name` against the known built-ins —
// so a device that already has "Cash"/"Card"/"Bank Transfer" persisted keeps working
// without a one-time migration step. Only relevant until that entry is ever renamed.
function normalizePaymentMethods(methods: PaymentMethodConfig[]): PaymentMethodConfig[] {
  const knownKeys = ["Cash", "Card", "Bank Transfer"] as const;
  return methods.map((m) => {
    if (m.key) return m;
    const matched = knownKeys.find((k) => k === m.name);
    return matched ? { ...m, key: matched } : m;
  });
}

export function useSettings(): AppSettings {
  const settings = usePersistedStore(store);
  return { ...settings, payments: { methods: normalizePaymentMethods(settings.payments.methods) } };
}
