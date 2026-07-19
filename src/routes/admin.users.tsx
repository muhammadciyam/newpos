import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil, LogOut, ShieldPlus } from "lucide-react";
import { toast } from "sonner";
import {
  authStore,
  useUsers,
  useUsersPolling,
  useCurrentUser,
  useActiveSessions,
  type Role,
  type RegisterName,
  type AppUser,
} from "@/lib/auth-store";
import { useRegister, registerDisplayName } from "@/lib/register-store";
import {
  useHasPermission,
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from "@/lib/permissions";
import { customRolesStore, useCustomRoles, type CustomRole } from "@/lib/custom-roles-store";
import { useOutlets } from "@/lib/outlets-store";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users - Dhipos" }] }),
  component: UsersPage,
});

const roles: Role[] = ["Admin", "Manager", "Supervisor", "Cashier"];

const statusColor: Record<AppUser["status"], string> = {
  Active: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Suspended: "bg-destructive/10 text-destructive hover:bg-destructive/10",
  Inactive: "bg-muted text-muted-foreground hover:bg-muted",
};

const emptyCreateForm = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "Cashier" as Role,
  outletId: "",
};

type EditForm = {
  name: string;
  role: Role;
  authorizedRegister: string;
  outletId: string;
};

function toEditForm(u: AppUser): EditForm {
  return {
    name: u.name,
    role: u.role,
    authorizedRegister: u.authorizedRegister ?? "none",
    outletId: u.outletId ?? "none",
  };
}

const emptyRoleForm = { name: "", permissions: [] as Permission[] };

function UsersPage() {
  const canManageUsers = useHasPermission("users.manage");
  useUsersPolling();
  const users = useUsers();
  const currentUser = useCurrentUser();
  const isSuperAdmin = currentUser?.role === "Super Admin";
  const customRoles = useCustomRoles();
  const allRoles = [...roles, ...customRoles.map((r) => r.name)];
  const outlets = useOutlets();
  // Super Admin is invisible to regular Admins on this page — matches the singleton
  // owner-account protections elsewhere (can't be created/edited/suspended/removed/
  // force-logged-out by anyone but itself).
  const visibleUsers = isSuperAdmin ? users : users.filter((u) => u.role !== "Super Admin");
  const { sessions, refresh: refreshSessions } = useActiveSessions();
  const registerState = useRegister();
  // Registers belong to one outlet each (see outlets-store.ts / register-store.ts) — a
  // user's Authorized Register must only offer registers from their own selected outlet,
  // so outlets stay fully separate from each other and nobody ends up authorized on
  // another outlet's register by mistake.
  const registersForOutlet = (outletId: string): RegisterName[] =>
    outletId === "none"
      ? (Object.keys(registerState.registers) as RegisterName[])
      : (Object.keys(registerState.registers) as RegisterName[]).filter(
          (r) => registerState.registers[r].outletId === outletId,
        );
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState(emptyRoleForm);
  const [roleError, setRoleError] = useState("");

  if (!canManageUsers) return <RestrictedPage />;

  function openCreateRole() {
    setEditingRoleId(null);
    setRoleForm(emptyRoleForm);
    setRoleError("");
    setRoleDialogOpen(true);
  }

  function openEditRole(role: CustomRole) {
    setEditingRoleId(role.id);
    setRoleForm({ name: role.name, permissions: [...role.permissions] });
    setRoleError("");
    setRoleDialogOpen(true);
  }

  function toggleRolePermission(permission: Permission) {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(permission)
        ? f.permissions.filter((p) => p !== permission)
        : [...f.permissions, permission],
    }));
  }

  async function saveRole() {
    setRoleError("");
    if (!roleForm.name.trim()) {
      setRoleError("Role name is required");
      return;
    }
    const result = editingRoleId
      ? await customRolesStore.update(editingRoleId, {
          name: roleForm.name,
          permissions: roleForm.permissions,
        })
      : await customRolesStore.create({
          name: roleForm.name,
          permissions: roleForm.permissions,
        });
    if ("error" in result) {
      setRoleError(result.error);
      return;
    }
    toast.success(`Role "${roleForm.name.trim()}" ${editingRoleId ? "updated" : "created"}`);
    setRoleDialogOpen(false);
  }

  async function removeRole(role: CustomRole) {
    const result = await customRolesStore.remove(role.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Role "${role.name}" removed`);
  }

  async function createUser() {
    setError("");
    if (!form.outletId) {
      setError("Outlet is required");
      return;
    }
    const result = await authStore.createUser({ ...form });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`User "${result.name}" created`);
    setForm(emptyCreateForm);
    setOpen(false);
  }

  async function removeUser(id: string, name: string) {
    const result = await authStore.removeUser(id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`User "${name}" removed`);
  }

  async function forceLogoutUser(email: string, name: string) {
    const result = await authStore.forceLogout(email);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${name} logged out`);
    refreshSessions();
  }

  async function toggleSuspend(user: AppUser) {
    const next = user.status === "Suspended" ? "Active" : "Suspended";
    const result = await authStore.setStatus(user.id, next);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${user.name} is now ${next}`);
  }

  function openEdit(user: AppUser) {
    setEditingId(user.id);
    setEditForm(toEditForm(user));
  }

  async function saveEdit() {
    if (!editingId || !editForm) return;
    const roleResult = await authStore.setRole(editingId, editForm.role);
    if ("error" in roleResult) {
      toast.error(roleResult.error);
      return;
    }
    const profileResult = await authStore.updateProfile(editingId, {
      name: editForm.name,
      authorizedRegister:
        editForm.authorizedRegister === "none"
          ? null
          : (editForm.authorizedRegister as RegisterName),
      outletId: editForm.outletId === "none" ? null : editForm.outletId,
    });
    if ("error" in profileResult) {
      toast.error(profileResult.error);
      return;
    }
    toast.success(`${editForm.name} updated`);
    setEditingId(null);
    setEditForm(null);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Users</h1>
            <p className="text-sm text-muted-foreground">
              Manage login access and roles for this company.
            </p>
          </div>
          <div className="flex gap-2">
            {isSuperAdmin && (
              <Button variant="outline" onClick={openCreateRole} className="gap-1.5">
                <ShieldPlus className="h-4 w-4" /> Create Role
              </Button>
            )}
            <Button onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New User
            </Button>
          </div>
        </div>

        {isSuperAdmin && customRoles.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Custom Role</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customRoles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                    <TableCell>
                      {r.permissions.length === 0 ? (
                        <span className="text-muted-foreground">No permissions</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.permissions.map((p) => (
                            <Badge key={p} variant="secondary" className="font-normal">
                              {PERMISSION_LABELS[p].split(" — ")[0]}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditRole(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeRole(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Email / Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {u.photo && <AvatarImage src={u.photo} alt="" />}
                        <AvatarFallback className="text-xs font-semibold">
                          {u.name.trim()[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-foreground">{u.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.email}
                    <span className="block text-xs text-muted-foreground">@{u.username}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.role === "Admin" || u.role === "Super Admin" ? "default" : "secondary"
                      }
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor[u.status]} variant="outline">
                      {u.status}
                    </Badge>
                    {sessions[u.email] && (
                      <Badge className="ml-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Logged In
                      </Badge>
                    )}
                    {u.authorizedRegister && (
                      <span className="block text-xs text-muted-foreground">
                        Register:{" "}
                        {registerDisplayName(registerState.registers, u.authorizedRegister)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {sessions[u.email] && u.id !== currentUser?.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => forceLogoutUser(u.email, u.name)}
                        >
                          <LogOut className="h-3.5 w-3.5" /> Force Logout
                        </Button>
                      )}
                      {u.role !== "Super Admin" && (
                        <>
                          <Button variant="outline" size="icon" onClick={() => openEdit(u)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.id !== currentUser?.id && (
                            <Button variant="outline" size="sm" onClick={() => toggleSuspend(u)}>
                              {u.status === "Suspended" ? "Reactivate" : "Suspend"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={u.id === currentUser?.id}
                            onClick={() => removeUser(u.id, u.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {u.role === "Super Admin" && !sessions[u.email] && (
                        <span className="text-xs text-muted-foreground">Owner account</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create login account */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="username"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Set a password"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet
              </Label>
              <Select
                value={form.outletId}
                onValueChange={(v) => setForm((f) => ({ ...f, outletId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an outlet" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Job details, pay, ID, and documents can be filled in later from Admin &gt; Employees.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.name.trim() ||
                !form.email.trim() ||
                !form.username.trim() ||
                !form.password ||
                !form.outletId
              }
              onClick={createUser}
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit login access */}
      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editForm?.name}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select
                    value={editForm.role}
                    onValueChange={(v) => setEditForm((f) => f && { ...f, role: v as Role })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Authorized Register</Label>
                  <Select
                    value={editForm.authorizedRegister}
                    onValueChange={(v) => setEditForm((f) => f && { ...f, authorizedRegister: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any register</SelectItem>
                      {registersForOutlet(editForm.outletId).map((r) => (
                        <SelectItem key={r} value={r}>
                          {registerState.registers[r].displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Outlet</Label>
                <Select
                  value={editForm.outletId}
                  onValueChange={(v) =>
                    setEditForm(
                      (f) =>
                        f && {
                          ...f,
                          outletId: v,
                          // Drop an authorized register that belonged to the outlet being
                          // switched away from — registers don't cross outlets, so keeping
                          // it selected would silently authorize them on another outlet's
                          // register.
                          authorizedRegister: registersForOutlet(v).includes(
                            f.authorizedRegister as RegisterName,
                          )
                            ? f.authorizedRegister
                            : "none",
                        },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / edit a custom role — Super Admin only */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoleId ? "Edit Role" : "Create Role"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role Name</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Shift Lead"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Permissions</Label>
              <div className="space-y-2.5 rounded-lg border border-border p-3">
                {ALL_PERMISSIONS.map((p) => (
                  <label key={p} className="flex items-start gap-2.5 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={roleForm.permissions.includes(p)}
                      onCheckedChange={() => toggleRolePermission(p)}
                    />
                    <span>{PERMISSION_LABELS[p]}</span>
                  </label>
                ))}
              </div>
            </div>
            {roleError && <p className="text-sm text-destructive">{roleError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveRole}>{editingRoleId ? "Save Changes" : "Create Role"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
