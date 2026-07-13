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

export const sampleOrders = [
  { id: "ORD-1042", customer: "Walk-in", items: 3, total: 24.5, status: "Completed", time: "10:24" },
  { id: "ORD-1041", customer: "Sara N.", items: 1, total: 4.75, status: "Completed", time: "10:12" },
  { id: "ORD-1040", customer: "Ahmed R.", items: 5, total: 48.25, status: "Refunded", time: "09:58" },
  { id: "ORD-1039", customer: "Walk-in", items: 2, total: 12.5, status: "Completed", time: "09:41" },
  { id: "ORD-1038", customer: "Lena K.", items: 4, total: 31.0, status: "Pending", time: "09:22" },
];

export const sampleCustomers = [
  { id: "C-001", name: "Sara Nasser", phone: "+971 50 111 2233", visits: 24, spent: 512.4 },
  { id: "C-002", name: "Ahmed Rahman", phone: "+971 55 998 1122", visits: 12, spent: 231.75 },
  { id: "C-003", name: "Lena Khoury", phone: "+971 52 445 6677", visits: 8, spent: 148.9 },
  { id: "C-004", name: "Omar Ali", phone: "+971 56 302 4411", visits: 3, spent: 44.25 },
];