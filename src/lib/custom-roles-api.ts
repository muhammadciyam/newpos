import { createServerFn } from "@tanstack/react-start";
import { getServerCustomRoles, mutateServerCustomRoles } from "@/lib/custom-roles-server-store";
import { getServerUsers, mutateServerUsers } from "@/lib/users-server-store";
import { BUILT_IN_ROLES } from "@/lib/auth-store";
import type { CustomRole } from "@/lib/custom-roles-store";
import type { Permission } from "@/lib/permissions";

const RESERVED_NAMES = new Set(["Super Admin", ...BUILT_IN_ROLES].map((r) => r.toLowerCase()));

export const fetchCustomRoles = createServerFn({ method: "GET" }).handler(async () => {
  return getServerCustomRoles();
});

export const createCustomRoleOnServer = createServerFn({ method: "POST" })
  .validator((data: { name: string; permissions: Permission[] }) => data)
  .handler(async ({ data }): Promise<{ error: string } | { ok: true; role: CustomRole }> => {
    const name = data.name.trim();
    if (!name) return { error: "Role name is required" };
    if (RESERVED_NAMES.has(name.toLowerCase())) {
      return { error: `"${name}" is a built-in role name — choose a different name` };
    }
    const existing = await getServerCustomRoles();
    if (existing.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      return { error: `A role named "${name}" already exists` };
    }
    const role: CustomRole = {
      id: `role-${Date.now()}`,
      name,
      permissions: data.permissions,
      createdAt: new Date().toISOString(),
    };
    await mutateServerCustomRoles((rs) => [role, ...rs]);
    return { ok: true as const, role };
  });

export const updateCustomRoleOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: { id: string; patch: Partial<Pick<CustomRole, "name" | "permissions">> }) => data,
  )
  .handler(async ({ data }): Promise<{ error: string } | { ok: true }> => {
    const existing = await getServerCustomRoles();
    const role = existing.find((r) => r.id === data.id);
    if (!role) return { error: "Role not found" };
    if (data.patch.name !== undefined) {
      const name = data.patch.name.trim();
      if (!name) return { error: "Role name is required" };
      if (RESERVED_NAMES.has(name.toLowerCase())) {
        return { error: `"${name}" is a built-in role name — choose a different name` };
      }
      if (existing.some((r) => r.id !== data.id && r.name.toLowerCase() === name.toLowerCase())) {
        return { error: `A role named "${name}" already exists` };
      }
      data.patch.name = name;
    }
    // Users already assigned this role should see it rename in place rather than being
    // silently orphaned onto a role string that no longer resolves to any permissions.
    if (data.patch.name && data.patch.name !== role.name) {
      const renamedTo = data.patch.name;
      await mutateServerUsers((us) =>
        us.map((u) => (u.role === role.name ? { ...u, role: renamedTo } : u)),
      );
    }
    await mutateServerCustomRoles((rs) =>
      rs.map((r) => (r.id === data.id ? { ...r, ...data.patch } : r)),
    );
    return { ok: true as const };
  });

export const removeCustomRoleOnServer = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<{ error: string } | { ok: true }> => {
    const existing = await getServerCustomRoles();
    const role = existing.find((r) => r.id === data.id);
    if (!role) return { ok: true as const };
    const users = await getServerUsers();
    const inUse = users.some((u) => u.role === role.name);
    if (inUse) {
      return { error: `"${role.name}" is still assigned to one or more users` };
    }
    await mutateServerCustomRoles((rs) => rs.filter((r) => r.id !== data.id));
    return { ok: true as const };
  });
