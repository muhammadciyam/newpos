import type { Role } from "@/lib/auth-store";
import { useCurrentUser } from "@/lib/auth-store";

export type Permission =
  | "users.manage" // create/edit/approve/suspend users
  | "settings.manage" // Admin Settings + Billing
  | "products.manage" // add/edit/delete products
  | "inventory.access" // view/create Purchase Invoices
  | "inventory.approve" // approve/reject Purchase Invoices
  | "reports.view" // Reports + Analytics pages
  | "customers.manage" // create customers
  | "sales.viewAll" // Bill History shows everyone's bills, not just their own
  | "sales.manage" // edit / void / refund bills in Bill History
  | "wholesale.access" // view/create Wholesalers and Wholesale Orders
  | "wholesale.approve"; // confirm/cancel Wholesale Orders (stock deducts on confirm)

const rolePermissions: Record<Role, Permission[]> = {
  "Super Admin": [
    "users.manage",
    "settings.manage",
    "products.manage",
    "inventory.access",
    "inventory.approve",
    "reports.view",
    "customers.manage",
    "sales.viewAll",
    "sales.manage",
    "wholesale.access",
    "wholesale.approve",
  ],
  Admin: [
    "users.manage",
    "settings.manage",
    "products.manage",
    "inventory.access",
    "inventory.approve",
    "reports.view",
    "customers.manage",
    "sales.viewAll",
    "sales.manage",
    "wholesale.access",
    "wholesale.approve",
  ],
  Manager: [
    "products.manage",
    "inventory.access",
    "inventory.approve",
    "reports.view",
    "customers.manage",
    "sales.viewAll",
    "wholesale.access",
    "wholesale.approve",
  ],
  Supervisor: [
    "inventory.access",
    "reports.view",
    "customers.manage",
    "sales.viewAll",
    "wholesale.access",
  ],
  Cashier: ["customers.manage"],
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return rolePermissions[role]?.includes(permission) ?? false;
}

export function useHasPermission(permission: Permission): boolean {
  const user = useCurrentUser();
  return hasPermission(user?.role ?? null, permission);
}
