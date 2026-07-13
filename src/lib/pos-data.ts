import coffee from "@/assets/prod-coffee.jpg";
import burger from "@/assets/prod-burger.jpg";
import pizza from "@/assets/prod-pizza.jpg";
import salad from "@/assets/prod-salad.jpg";
import donut from "@/assets/prod-donut.jpg";
import juice from "@/assets/prod-juice.jpg";

export type Category = { id: string; name: string };
export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  image: string;
  stock: number;
};

export const categories: Category[] = [
  { id: "all", name: "All Items" },
  { id: "drinks", name: "Drinks" },
  { id: "food", name: "Food" },
  { id: "desserts", name: "Desserts" },
];

export const products: Product[] = [
  { id: "p1", name: "Espresso", price: 3.5, category: "drinks", image: coffee, stock: 42 },
  { id: "p2", name: "Fresh Juice", price: 4.75, category: "drinks", image: juice, stock: 30 },
  { id: "p3", name: "Cheeseburger", price: 9.99, category: "food", image: burger, stock: 18 },
  { id: "p4", name: "Margherita Slice", price: 6.5, category: "food", image: pizza, stock: 25 },
  { id: "p5", name: "Garden Salad", price: 7.25, category: "food", image: salad, stock: 12 },
  { id: "p6", name: "Choco Donut", price: 2.5, category: "desserts", image: donut, stock: 60 },
  { id: "p7", name: "Latte", price: 4.25, category: "drinks", image: coffee, stock: 35 },
  { id: "p8", name: "Double Burger", price: 12.5, category: "food", image: burger, stock: 10 },
];

export type Customer = {
  id: string;
  name: string;
  mobile: string;
  outstanding: number;
  limit: number;
  spent: number;
  loyalty: number;
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

export type RegisterSession = {
  no: number;
  register: string;
  createdAt: string;
  closedAt: string | null;
  openDuration: string;
  by: string;
};

// ---- Bills ----
export type Bill = {
  number: string;
  customer: string;
  location: string;
  register: string;
  status: "Sale" | "Refund" | "Void";
  total: number;
  created: string;
  by: string;
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
};

export const onlinePayments: OnlinePayment[] = [];

// ---- Reports ----
export const salesReports = [
  { title: "Day Summary Reports", desc: "Sales, Payments, Register reports for a day" },
  { title: "Product Sales Report", desc: "Sales summary by products" },
  { title: "Period Sales Reports", desc: "Various sales reports for given period" },
  { title: "Customer Sales Report", desc: "Sales by customers" },
  { title: "Outstanding Bills Report", desc: "Unsettled sales bills (Credit Sales, Layaway Bills)" },
  { title: "Sales Void Report", desc: "Reports of voided invoices" },
  { title: "FOC Bills Report", desc: "Details of all FOC bills" },
];

export const productReports = [
  { title: "Stock Report", desc: "Current stock levels by product" },
  { title: "Stock Movement Report", desc: "Stock in/out movement history" },
  { title: "Reorder Report", desc: "Products below reorder level" },
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
];

export const numberFormats = [
  { type: "Bill", format: "{registerNumber}/{sequence}" },
  { type: "Payments", format: "P/{year:4}/{sequence}" },
  { type: "Quotations", format: "QT/{sequence}" },
  { type: "Purchase Orders", format: "PO/{sequence}" },
  { type: "Purchase Receives", format: "PR/{sequence}" },
  { type: "Transfer Requests", format: "TR/{sequence}" },
];
