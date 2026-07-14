import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

export type AppSettings = {
  general: {
    currency: string;
    timezone: string;
    uniqueCustomerMobile: boolean;
    optimizeBillHistoryLoading: boolean;
    smsShortCode: string;
  };
  sales: {
    salesPriceEditable: boolean;
    allowSellBelowCost: boolean;
    restrictExpiredBatches: boolean;
    allowSellWithoutStock: boolean;
    billDateIsRegisterDate: boolean;
    allowSetBillDate: boolean;
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
  },
  sales: {
    salesPriceEditable: false,
    allowSellBelowCost: false,
    restrictExpiredBatches: false,
    allowSellWithoutStock: false,
    billDateIsRegisterDate: false,
    allowSetBillDate: false,
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

export function useSettings() {
  return usePersistedStore(store);
}
