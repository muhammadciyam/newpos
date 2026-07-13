import { useSyncExternalStore } from "react";
import type { Product } from "./pos-data";

export type CartItem = { product: Product; qty: number };

let cart: CartItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const cartStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get() {
    return cart;
  },
  add(product: Product) {
    const existing = cart.find((i) => i.product.id === product.id);
    cart = existing
      ? cart.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...cart, { product, qty: 1 }];
    emit();
  },
  setQty(id: string, qty: number) {
    cart = qty <= 0 ? cart.filter((i) => i.product.id !== id) : cart.map((i) => (i.product.id === id ? { ...i, qty } : i));
    emit();
  },
  remove(id: string) {
    cart = cart.filter((i) => i.product.id !== id);
    emit();
  },
  clear() {
    cart = [];
    emit();
  },
};

export function useCart() {
  return useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.get(),
    () => cart,
  );
}

export function cartTotals(items: CartItem[], taxRate = 0.05, discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.product.price * i.qty, 0);
  const tax = subtotal * taxRate;
  const total = Math.max(0, subtotal + tax - discount);
  return { subtotal, tax, discount, total };
}