export type Category = { id: string; name: string };
export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  // Each product belongs to exactly one outlet — its catalog, stock, and every action on it
  // (edit/delete/count/purchase) are scoped to that one outlet, same as Customer.outletId
  // below. Null only for products created before outlets existed or by a user with no
  // outlet assigned; only Super Admin sees those.
  outletId: string | null;
  stock: number;
  barcode?: string;
  sku?: string;
  // Last known unit cost, set from the most recently approved Purchase Invoice line for this product.
  cost?: number;
  // Whether this product shows up on the Stock Count page. Undefined counts as true
  // (existing products default to countable) — only an explicit `false` excludes it.
  countable?: boolean;
  // Whether GST applies to this product when sold. Undefined counts as true (existing
  // products default to GST-applicable) — only an explicit `false` marks it exempt.
  gstApplicable?: boolean;
};

export const categories: Category[] = [
  { id: "all", name: "All Items" },
  { id: "drinks", name: "Drinks" },
  { id: "food", name: "Food" },
  { id: "desserts", name: "Desserts" },
];

// No seed products — this shop's catalog is added via the Products page (one at a time or
// bulk CSV import) instead of shipping with demo data.
export const products: Product[] = [];

export type Customer = {
  id: string;
  name: string;
  mobile: string;
  outstanding: number;
  limit: number;
  spent: number;
  loyalty: number;
  email?: string;
  dob?: string;
  address?: string;
  taxNumber?: string;
  note?: string;
  priceLevel?: "default" | "wholesale";
  // Which outlet this customer was created at — null for customers created before outlets
  // existed, or by a user with no outlet assigned. Only Super Admin sees those.
  outletId: string | null;
};

// ---- Dashboard series ----
export type SalesPoint = { date: string; label: string; value: number };
export const netSalesSeries: SalesPoint[] = [];
export const salesCountSeries: SalesPoint[] = [];

export const dashboardStats = {
  todayTotalSales: 0,
  todayTotalSalesChange: 0,
  todayNetSales: 0,
  todayNetSalesChange: 0,
  todayCreditSales: 0,
  yesterdayNetSales: 0,
  yesterdayNetSalesChange: 0,
  monthNetSales: 0,
  monthNetSalesChange: 0,
  customersThisMonth: 0,
  customersThisMonthChange: 0,
  productsSoldThisMonth: 0,
  productsSoldThisMonthChange: 0,
  refundsThisMonth: 0,
  refundsThisMonthChange: 0,
  voidsThisMonth: 0,
  voidsThisMonthChange: 0,
};

export type TopSellingProduct = { name: string; revenue: number; sold: number };
export const topSellingProducts: TopSellingProduct[] = [];

// ---- Register ----
export type CashType = { key: string; label: string; currency: string };
export const cashTypes: CashType[] = [
  { key: "cash", label: "cash", currency: "" },
  { key: "bank-transfer", label: "bank-transfer", currency: "" },
  { key: "card", label: "card", currency: "" },
  { key: "cash-usd", label: "cash/USD", currency: "USD" },
  { key: "cash-usd-1", label: "cash/USD 1", currency: "USD 1" },
  { key: "cash-usd-20", label: "cash/usd 20", currency: "usd 20" },
];

// The cash-counting/sales detail captured at the moment a register was closed — what
// was expected per cash type, what was actually counted, the difference (short/over),
// and the sales/credit totals rung up during that session.
export type RegisterSessionClosing = {
  expected: Record<string, number>;
  counted: Record<string, number>;
  difference: Record<string, number>;
  totalExpected: number;
  totalCounted: number;
  shortAmount: number;
  salesAmount: number;
  cashSales: number;
  cardSales: number;
  bankSales: number;
  creditAmount: number;
  billCount: number;
  cashBillCount: number;
  cardBillCount: number;
  bankBillCount: number;
  creditBillCount: number;
  itemsSold: number;
  refundAmount: number;
  voidCount: number;
  openingTotal: number;
  note: string;
};

export type RegisterSession = {
  id: string;
  no: number;
  register: string;
  createdAt: string;
  closedAt: string | null;
  openDuration: string;
  by: string;
  closing?: RegisterSessionClosing;
  // Which outlet this session's register belonged to at open time — null for a register
  // with no outlet assigned (only Super Admin sees those).
  outletId: string | null;
};

// ---- Bills ----
export type BillLineItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  refundedQty?: number;
  // Snapshotted from the product at sale time (like `price`) — whether GST applies to this
  // line. Undefined counts as true (bills created before this field existed default to
  // taxable) — only an explicit `false` marks it exempt, same convention as Product.gstApplicable.
  gstApplicable?: boolean;
};

export type BillRefund = {
  id: string;
  at: string;
  by: string;
  items: { productId: string; name: string; qty: number; price: number }[];
  amount: number;
  reason?: string;
};

export type Bill = {
  number: string;
  customer: string;
  customerId?: string | null;
  location: string;
  register: string;
  // Which outlet's inventory this sale was deducted from — set from the selling register's
  // outlet at sale time. Null for bills rung up before per-outlet inventory existed, or on a
  // register that (unusually) has no outlet assigned.
  outletId: string | null;
  status: "Sale" | "Void" | "Refunded" | "Partially Refunded";
  items: BillLineItem[];
  subtotal: number;
  discount: number;
  gst: number;
  // The Sell page's "Plastic Bag" checkout option — cashier-entered bag count and the
  // resulting charge (qty * Settings > Tax > Plastic Bag Charge, snapshotted at sale
  // time). Both undefined when the option wasn't ticked; already folded into `total`.
  bagQty?: number;
  bagCharge?: number;
  total: number;
  created: string;
  by: string;
  // The 4 built-ins keep autocomplete; `string & {}` also allows a custom payment method
  // name configured in Settings > Payments (see admin.settings.tsx / pos.sell.tsx) — those
  // are simple/generic payments with no specialized collection workflow of their own.
  paymentMethod: "Cash" | "Card" | "Bank Transfer" | "Credit" | (string & {});
  paymentStatus: "Paid" | "Pending";
  settledBy?: string;
  settledAt?: string;
  cashGiven?: number;
  changeGiven?: number;
  transferSlip?: string;
  recipientNumber?: string;
  cardSlipNumber?: string;
  // Required proof-of-payment reference for any custom (non-built-in) payment method.
  customReceiptNumber?: string;
  printTemplateId?: string;
  editedBy?: string;
  editedAt?: string;
  originalTotal?: number;
  voidedBy?: string;
  voidedAt?: string;
  voidReason?: string;
  refunds?: BillRefund[];
  // Set from the Sell page's Note/FOC/No Delivery/Tags/Currency quick actions.
  note?: string;
  // Free of Charge — when true, `discount` was set to cover the full subtotal+gst so
  // `total` is 0. Kept as an explicit flag (rather than inferring from total === 0) so a
  // legitimately free item and a fully-discounted paid sale don't look the same in reports.
  foc?: boolean;
  noDelivery?: boolean;
  tags?: string[];
  // Alternate-currency display, for reference only — `total` etc. always stay in the
  // store's base currency; this is just what was shown/quoted to the customer at sale time.
  currency?: string;
  currencyRate?: number;
  currencyTotal?: number;
};

// ---- Online Payments ----
export type OnlinePayment = {
  id: string;
  billNumber: string;
  amount: number;
  status: "Success" | "Pending" | "Failed";
  created: string;
  by: string;
  reference: string;
  receiptSlip: string;
};

// ---- Reports ----
// `path` is only set for reports that actually have a page built — see reports.tsx and
// the "Recent Activity" inbox in app-shell.tsx, which both link to it when present.
export type ReportItem = { title: string; desc: string; path?: string };

export const salesReports: ReportItem[] = [
  {
    title: "Day Summary Reports",
    desc: "Sales, Payments, Register reports for a day",
    path: "/report-day-summary",
  },
  {
    title: "Product Sales Report",
    desc: "Sales summary by products",
    path: "/report-product-sales",
  },
  {
    title: "Period Sales Reports",
    desc: "Various sales reports for given period",
    path: "/report-period-sales",
  },
  {
    title: "Customer Sales Report",
    desc: "Sales by customers",
    path: "/report-customer-sales",
  },
  {
    title: "Outstanding Bills Report",
    desc: "Unsettled sales bills (Credit Sales, Layaway Bills)",
    path: "/report-outstanding-bills",
  },
  {
    title: "Sales Void Report",
    desc: "Reports of voided invoices",
    path: "/report-sales-void",
  },
  {
    title: "FOC Bills Report",
    desc: "Details of all FOC bills",
    path: "/report-foc-bills",
  },
  {
    title: "GST Return",
    desc: "Quarterly GST return (MIRA 205) prepared from sales and purchase data",
    path: "/report-gst-return",
  },
];

export const productReports: ReportItem[] = [
  { title: "Stock Report", desc: "Current stock levels by product", path: "/report-stock" },
  {
    title: "Stock Movement Report",
    desc: "Stock in/out movement history",
    path: "/report-stock-movement",
  },
  { title: "Reorder Report", desc: "Products below reorder level", path: "/report-reorder" },
];

// ---- Payment methods / cash denominations ----
export const paymentMethods = [
  { name: "Cash", type: "manual", details: "" },
  { name: "Card", type: "manual", details: "" },
  { name: "Bank Transfer", type: "bank-transfer", details: "7730000639888" },
  { name: "BML Gateway", type: "bml-gateway", details: "siyam" },
];

export const cashDenominations = [
  { name: "25 Laari", value: 0.25, type: "Coin", currency: "MVR" },
  { name: "50 Laari", value: 0.5, type: "Coin", currency: "MVR" },
  { name: "Rf 1", value: 1.0, type: "Coin", currency: "MVR" },
  { name: "Rf 2", value: 2.0, type: "Coin", currency: "MVR" },
  { name: "Rf 5", value: 5.0, type: "Note", currency: "MVR" },
  { name: "Rf 10", value: 10.0, type: "Note", currency: "MVR" },
  { name: "Rf 20", value: 20.0, type: "Note", currency: "MVR" },
  { name: "Rf 50", value: 50.0, type: "Note", currency: "MVR" },
  { name: "Rf 100", value: 100.0, type: "Note", currency: "MVR" },
  { name: "Rf 500", value: 500.0, type: "Note", currency: "MVR" },
  { name: "Rf 1000", value: 1000.0, type: "Note", currency: "MVR" },
];

export const usdDenominations = [
  { name: "$1", value: 1, type: "Note", currency: "USD" },
  { name: "$5", value: 5, type: "Note", currency: "USD" },
  { name: "$10", value: 10, type: "Note", currency: "USD" },
  { name: "$20", value: 20, type: "Note", currency: "USD" },
  { name: "$50", value: 50, type: "Note", currency: "USD" },
  { name: "$100", value: 100, type: "Note", currency: "USD" },
];

// Maps an opening/closing cash-field key to the denominations to count for it.
// "usd1"/"usd20" (and their closing-table equivalents "cash-usd-1"/"cash-usd-20")
// are single-denomination fields since the $1 and $20 bills are tracked separately.
export function denominationsForKey(key: string): { name: string; value: number }[] {
  switch (key) {
    case "mvr":
    case "cash":
      return cashDenominations;
    case "usd":
    case "cash-usd":
      return usdDenominations.filter((d) => d.value !== 1 && d.value !== 20);
    case "usd1":
    case "cash-usd-1":
      return usdDenominations.filter((d) => d.value === 1);
    case "usd20":
    case "cash-usd-20":
      return usdDenominations.filter((d) => d.value === 20);
    default:
      return [];
  }
}

export const numberFormats = [
  { type: "Bill", format: "{registerNumber}/{sequence}" },
  { type: "Payments", format: "P/{year:4}/{sequence}" },
  { type: "Quotations", format: "QT/{sequence}" },
  { type: "Purchase Orders", format: "PO/{sequence}" },
  { type: "Purchase Receives", format: "PR/{sequence}" },
  { type: "Transfer Requests", format: "TR/{sequence}" },
];
