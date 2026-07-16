import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { categories as seedCategories, type Category } from "@/lib/pos-data";
import { authStore } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";

const store = createPersistedStore<Category[]>("dhipos-categories", seedCategories);

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const categoriesStore = {
  subscribe: store.subscribe,
  get: store.get,
  hydrate: store.hydrate,

  create(name: string): Category | { error: string } {
    const trimmed = name.trim();
    if (!trimmed) return { error: "Category name is required" };
    const id = slugify(trimmed);
    if (!id || id === "all") return { error: "That category name isn't valid" };
    const existing = store.get();
    if (existing.some((c) => c.id === id)) {
      return { error: `"${trimmed}" already exists` };
    }
    const category: Category = { id, name: trimmed };
    store.set((cs) => [...cs, category]);
    logAudit(authStore.getCurrentUser()?.name ?? "System", "create", `Category / ${trimmed}`);
    return category;
  },
};

export function useCategories(): Category[] {
  return usePersistedStore(store);
}
