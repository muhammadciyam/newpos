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
// A named tax rate in the Tax tab's registry, beyond the single primary GST rate above it.
// Configuration only for now (like Service Fees below) — not yet applied automatically at
// checkout on the Sell page. `value` is a percentage (e.g. 5 for 5%) or a flat amount per
// unit (e.g. 2 for MVR 2/unit), depending on `type`.
export type CustomTaxConfig = { id: string; name: string; type: "percent" | "unit"; value: number };
// A named discount preset offered on the Sell page's Discount quick action. `value` is a
// percentage (e.g. 10 for 10% off) or a flat amount off the bill, depending on `type`. When
// discounts.onlyFixedDiscounts is on, these are the only discounts a cashier can apply — no
// free-form percent/amount entry.
export type DiscountPresetConfig = {
  id: string;
  name: string;
  type: "percent" | "amount";
  value: number;
};
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
    customTaxes: CustomTaxConfig[];
    // Charged per plastic bag on the Sell page's "Plastic Bag" checkout option — a flat
    // amount per bag, not a percentage, and not itself subject to GST.
    bagFeeRate: number;
    // Identity fields required on the printed MIRA 205 GST Return (Reports > GST Return) —
    // not used in any calculation, just printed on the form header.
    gstTin: string;
    taxpayerName: string;
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
    presets: DiscountPresetConfig[];
  };
  inventory: {
    stockAdjustmentTypes: string[];
    locationLevelReorderLimit: boolean;
  };
  restaurant: {
    enabled: boolean;
  };
  wholesale: {
    // A wholesale catalogue product's stockQty at or below this shows as "Low Stock"
    // instead of a plain "In Stock" everywhere it's displayed (see supply.home.tsx) — 0
    // is always "Out of Stock" regardless of this value.
    lowStockThreshold: number;
  };
};

const defaults: AppSettings = {
  general: {
    currency: "MVR",
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
    salesEmail: "",
  },
  payments: {
    methods: [
      { key: "Cash", name: "Cash", type: "manual", details: "" },
      { key: "Card", name: "Card", type: "manual", details: "" },
      {
        key: "Bank Transfer",
        name: "Bank Transfer",
        type: "bank-transfer",
        details: "7730000639888",
      },
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
    customTaxes: [],
    bagFeeRate: 2,
    gstTin: "",
    taxpayerName: "",
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
    presets: [],
  },
  inventory: {
    stockAdjustmentTypes: ["Lost / Stolen", "Expired", "Stock Recount", "Damaged"],
    locationLevelReorderLimit: false,
  },
  restaurant: {
    enabled: false,
  },
  wholesale: {
    lowStockThreshold: 5,
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
  return {
    ...settings,
    payments: { methods: normalizePaymentMethods(settings.payments.methods) },
    // Backfills fields for anyone with settings persisted before they existed —
    // createPersistedStore replaces state wholesale on read rather than deep-merging with
    // defaults, so an old blob would otherwise be missing them entirely.
    tax: {
      ...settings.tax,
      customTaxes: settings.tax.customTaxes ?? [],
      bagFeeRate: settings.tax.bagFeeRate ?? 2,
      gstTin: settings.tax.gstTin ?? "",
      taxpayerName: settings.tax.taxpayerName ?? "",
    },
    wholesale: {
      lowStockThreshold: settings.wholesale?.lowStockThreshold ?? 5,
    },
    discounts: {
      ...settings.discounts,
      presets: settings.discounts.presets ?? [],
    },
  };
}
