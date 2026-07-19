import type { AppUser, Role } from "@/lib/auth-store";
import { useCurrentUser } from "@/lib/auth-store";
import { useCustomRoles, customRolesStore } from "@/lib/custom-roles-store";

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
  | "outlets.manage"; // create/edit/remove outlets (Admin > Locations)

// All assignable permissions, in the order they're offered as checkboxes when a Super Admin
// creates a custom role (Admin > Users > Create Role).
export const ALL_PERMISSIONS: Permission[] = [
  "users.manage",
  "settings.manage",
  "products.manage",
  "inventory.access",
  "inventory.approve",
  "reports.view",
  "customers.manage",
  "sales.viewAll",
  "sales.manage",
  "outlets.manage",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "users.manage": "Manage Users — create, edit, suspend, assign roles",
  "settings.manage": "Manage Settings & Billing",
  "products.manage": "Manage Products — add, edit, delete",
  "inventory.access": "Access Inventory — view/create Purchase Invoices",
  "inventory.approve": "Approve Purchase Invoices",
  "reports.view": "View Reports & Analytics",
  "customers.manage": "Manage Customers",
  "sales.viewAll": "View All Sales — Bill History for every user",
  "sales.manage": "Manage Sales — edit, void, refund bills",
  "outlets.manage": "Manage Outlets — Admin > Locations",
};

const rolePermissions: Record<string, Permission[]> = {
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
    "outlets.manage",
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
  ],
  Manager: [
    "products.manage",
    "inventory.access",
    "inventory.approve",
    "reports.view",
    "customers.manage",
    "sales.viewAll",
  ],
  Supervisor: ["inventory.access", "reports.view", "customers.manage", "sales.viewAll"],
  Cashier: ["customers.manage"],
};

// Built-in roles are checked against the static map above; anything else is looked up in the
// Super-Admin-defined custom roles cache (populated by useCustomRoles() — see useHasPermission
// and app-sidebar.tsx, which both call it to make sure the cache is warm before this runs).
export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const builtIn = rolePermissions[role];
  if (builtIn) return builtIn.includes(permission);
  const custom = customRolesStore.get().find((r) => r.name === role);
  return custom?.permissions.includes(permission) ?? false;
}

export function useHasPermission(permission: Permission): boolean {
  const user = useCurrentUser();
  useCustomRoles();
  return hasPermission(user?.role ?? null, permission);
}

// Pay, national ID, address, emergency contact, and ID documents — sensitive HR/financial/
// identity fields that an Admin should not see on another Admin's (or Super Admin's) profile,
// even though `users.manage` lets them manage everyone's login/role. Always true for your own
// record and for Super Admin (who can see and edit everyone's full profile).
export function canViewSensitiveEmployeeInfo(
  viewer: { id: string; role: Role } | null,
  target: Pick<AppUser, "id" | "role">,
): boolean {
  if (!viewer) return false;
  if (viewer.id === target.id) return true;
  if (viewer.role === "Super Admin") return true;
  return target.role !== "Admin" && target.role !== "Super Admin";
}
