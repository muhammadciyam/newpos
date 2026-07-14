import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  authStore,
  useUsers,
  useCurrentUser,
  type Role,
  type RegisterName,
  type AppUser,
} from "@/lib/auth-store";
import { useRegister } from "@/lib/register-store";
import { useHasPermission } from "@/lib/permissions";

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
};

type EditForm = {
  name: string;
  role: Role;
  authorizedRegister: string;
};

function toEditForm(u: AppUser): EditForm {
  return {
    name: u.name,
    role: u.role,
    authorizedRegister: u.authorizedRegister ?? "none",
  };
}

function UsersPage() {
  const canManageUsers = useHasPermission("users.manage");
  const users = useUsers();
  const currentUser = useCurrentUser();
  const registers = Object.keys(useRegister().registers) as RegisterName[];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

  if (!canManageUsers) return <RestrictedPage />;

  function createUser() {
    setError("");
    const result = authStore.createUser({ ...form });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`User "${result.name}" created`);
    setForm(emptyCreateForm);
    setOpen(false);
  }

  function removeUser(id: string, name: string) {
    authStore.removeUser(id);
    toast.success(`User "${name}" removed`);
  }

  function toggleSuspend(user: AppUser) {
    const next = user.status === "Suspended" ? "Active" : "Suspended";
    authStore.setStatus(user.id, next);
    toast.success(`${user.name} is now ${next}`);
  }

  function openEdit(user: AppUser) {
    setEditingId(user.id);
    setEditForm(toEditForm(user));
  }

  function saveEdit() {
    if (!editingId || !editForm) return;
    authStore.setRole(editingId, editForm.role);
    authStore.updateProfile(editingId, {
      name: editForm.name,
      authorizedRegister: editForm.authorizedRegister === "none" ? null : (editForm.authorizedRegister as RegisterName),
    });
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
            <p className="text-sm text-muted-foreground">Manage login access and roles for this company.</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New User
          </Button>
        </div>

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
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {u.photo && <AvatarImage src={u.photo} alt="" />}
                        <AvatarFallback className="text-xs font-semibold">{u.name.trim()[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="font-medium text-foreground">{u.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.email}
                    <span className="block text-xs text-muted-foreground">@{u.username}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "Admin" ? "default" : "secondary"}>{u.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColor[u.status]} variant="outline">
                      {u.status}
                    </Badge>
                    {u.authorizedRegister && (
                      <span className="block text-xs text-muted-foreground">Register: {u.authorizedRegister}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
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
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="username" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Set a password" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as Role }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
            <Button disabled={!form.name.trim() || !form.email.trim() || !form.username.trim() || !form.password} onClick={createUser}>
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
                <Input value={editForm.name} onChange={(e) => setEditForm((f) => f && { ...f, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => f && { ...f, role: v as Role })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Authorized Register</Label>
                  <Select value={editForm.authorizedRegister} onValueChange={(v) => setEditForm((f) => f && { ...f, authorizedRegister: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any register</SelectItem>
                      {registers.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
    </AppShell>
  );
}
