import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldPlus, Plus, MapPin, Monitor, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { authStore, useUsers, useUsersPolling, useCurrentUser } from "@/lib/auth-store";
import { outletsStore, useOutlets, type Outlet } from "@/lib/outlets-store";
import { useRegister, registerStore } from "@/lib/register-store";

export const Route = createFileRoute("/admin/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — Dhipos" }] }),
  component: SuperAdminPage,
});

const emptyForm = { name: "", email: "", username: "", password: "" };
const emptyOutletForm = { name: "", address: "", phone: "" };

function SuperAdminPage() {
  const currentUser = useCurrentUser();
  useUsersPolling();
  const users = useUsers();
  const outlets = useOutlets();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  const [outletOpen, setOutletOpen] = useState(false);
  const [outletForm, setOutletForm] = useState(emptyOutletForm);
  const [editingOutletId, setEditingOutletId] = useState<string | null>(null);
  const [editOutletForm, setEditOutletForm] = useState(emptyOutletForm);

  const register = useRegister();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerName, setRegisterName] = useState("");
  const [registerOutletId, setRegisterOutletId] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [creatingRegister, setCreatingRegister] = useState(false);

  const [editingRegisterKey, setEditingRegisterKey] = useState<string | null>(null);
  const [editRegisterOutletId, setEditRegisterOutletId] = useState("");
  const [editRegisterError, setEditRegisterError] = useState("");
  const [savingRegisterOutlet, setSavingRegisterOutlet] = useState(false);

  // Only an existing Super Admin can mint another one — there is no server-verified auth
  // in this app, so this is a UI-level guard like every other role check here.
  if (currentUser?.role !== "Super Admin") return <RestrictedPage />;

  const superAdmins = users.filter((u) => u.role === "Super Admin");

  async function createOutlet() {
    if (!outletForm.name.trim()) {
      toast.error("Outlet name is required");
      return;
    }
    const result = await outletsStore.create({
      name: outletForm.name.trim(),
      address: outletForm.address.trim(),
      phone: outletForm.phone.trim(),
      active: true,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    // Every outlet needs at least one register before it can ring up a sale — create a
    // default "Counter 1" for it automatically so Super Admin doesn't need a separate
    // "New Register" step right after. Register names only need to be unique within an
    // outlet (see registerKey()), so "Counter 1" is always safe to use here.
    const registerResult = await registerStore.createRegister("Counter 1", result.id);
    if ("error" in registerResult) {
      toast.error(
        `Outlet "${result.name}" created, but its default register failed: ${registerResult.error}`,
      );
    } else {
      toast.success(`Outlet "${result.name}" created with register "Counter 1"`);
    }
    setOutletForm(emptyOutletForm);
    setOutletOpen(false);
  }

  function openEditOutlet(outlet: Outlet) {
    setEditingOutletId(outlet.id);
    setEditOutletForm({ name: outlet.name, address: outlet.address, phone: outlet.phone });
  }

  async function saveOutletEdit() {
    if (!editingOutletId) return;
    if (!editOutletForm.name.trim()) {
      toast.error("Outlet name is required");
      return;
    }
    const result = await outletsStore.update(editingOutletId, {
      name: editOutletForm.name.trim(),
      address: editOutletForm.address.trim(),
      phone: editOutletForm.phone.trim(),
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${editOutletForm.name.trim()}" updated`);
    setEditingOutletId(null);
  }

  async function removeOutlet(outlet: Outlet) {
    const result = await outletsStore.remove(outlet.id);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`"${outlet.name}" removed`);
  }

  async function createRegister() {
    setRegisterError("");
    if (!registerOutletId) {
      setRegisterError("Outlet is required");
      return;
    }
    setCreatingRegister(true);
    const result = await registerStore.createRegister(registerName, registerOutletId);
    setCreatingRegister(false);
    if ("error" in result) {
      setRegisterError(result.error);
      return;
    }
    toast.success(`Register "${registerName.trim()}" created`);
    setRegisterName("");
    setRegisterOutletId("");
    setRegisterOpen(false);
  }

  function openEditRegisterOutlet(key: string, currentOutletId: string | null) {
    setEditingRegisterKey(key);
    setEditRegisterOutletId(currentOutletId ?? "");
    setEditRegisterError("");
  }

  async function saveRegisterOutlet() {
    if (!editingRegisterKey) return;
    if (!editRegisterOutletId) {
      setEditRegisterError("Outlet is required");
      return;
    }
    setSavingRegisterOutlet(true);
    const result = await registerStore.setOutlet(editingRegisterKey, editRegisterOutletId);
    setSavingRegisterOutlet(false);
    if ("error" in result) {
      setEditRegisterError(result.error);
      return;
    }
    toast.success("Register outlet updated");
    setEditingRegisterKey(null);
  }

  async function createSuperAdmin() {
    setError("");
    const result = await authStore.createSuperAdmin({ ...form });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`Super Admin "${result.name}" created`);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Super Admin</h1>
            <p className="text-sm text-muted-foreground">
              Owner-level accounts with full, unrestricted access.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Super Admin
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email / Username</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {superAdmins.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium text-foreground">{u.name}</TableCell>
                  <TableCell>
                    {u.email}
                    <span className="block text-xs text-muted-foreground">@{u.username}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      {u.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Outlets</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage the outlets this company operates.
            </p>
          </div>
          <Button variant="outline" onClick={() => setOutletOpen(true)} className="gap-1.5">
            <MapPin className="h-4 w-4" /> Create Outlet
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No outlets yet — create one to get started.
                  </TableCell>
                </TableRow>
              )}
              {outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium text-foreground">{o.name}</TableCell>
                  <TableCell>{o.address || "—"}</TableCell>
                  <TableCell>{o.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        o.active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }
                      variant="outline"
                    >
                      {o.active ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => openEditOutlet(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => removeOutlet(o)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Registers</h2>
            <p className="text-sm text-muted-foreground">
              Create new registers and assign each one to an outlet.
            </p>
          </div>
          <Button variant="outline" onClick={() => setRegisterOpen(true)} className="gap-1.5">
            <Monitor className="h-4 w-4" /> New Register
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.keys(register.registers).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    No registers yet — create one to get started.
                  </TableCell>
                </TableRow>
              )}
              {Object.entries(register.registers).map(([name, r]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium text-foreground">{r.displayName}</TableCell>
                  <TableCell>{outlets.find((o) => o.id === r.outletId)?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        r.isOpen
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }
                      variant="outline"
                    >
                      {r.isOpen ? "Open" : "Closed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditRegisterOutlet(name, r.outletId)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldPlus className="h-4.5 w-4.5" /> Create Super Admin
            </DialogTitle>
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
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Set a password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This account will have full, unrestricted access — the same as your own.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.name.trim() || !form.email.trim() || !form.username.trim() || !form.password
              }
              onClick={createSuperAdmin}
            >
              Create Super Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create outlet */}
      <Dialog open={outletOpen} onOpenChange={setOutletOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4.5 w-4.5" /> Create Outlet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet Name
              </Label>
              <Input
                value={outletForm.name}
                onChange={(e) => setOutletForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Seven Mart"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={outletForm.address}
                onChange={(e) => setOutletForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="e.g. Hulhumale"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={outletForm.phone}
                onChange={(e) => setOutletForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 7777777"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutletOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createOutlet}>Create Outlet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit outlet */}
      <Dialog open={!!editingOutletId} onOpenChange={(v) => !v && setEditingOutletId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet Name
              </Label>
              <Input
                value={editOutletForm.name}
                onChange={(e) => setEditOutletForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={editOutletForm.address}
                onChange={(e) => setEditOutletForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={editOutletForm.phone}
                onChange={(e) => setEditOutletForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOutletId(null)}>
              Cancel
            </Button>
            <Button onClick={saveOutletEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New register */}
      <Dialog
        open={registerOpen}
        onOpenChange={(v) => {
          setRegisterOpen(v);
          if (!v) {
            setRegisterName("");
            setRegisterOutletId("");
            setRegisterError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Monitor className="h-4.5 w-4.5" /> New Register
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Register Name</Label>
              <Input
                value={registerName}
                onChange={(e) => setRegisterName(e.target.value)}
                placeholder="e.g. Register 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet
              </Label>
              <Select value={registerOutletId} onValueChange={setRegisterOutletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select which outlet this register belongs to" />
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
            {registerError && <p className="text-sm text-destructive">{registerError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!registerName.trim() || !registerOutletId || creatingRegister}
              onClick={createRegister}
            >
              {creatingRegister ? "Creating..." : "Create Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit a register's outlet — mainly for registers created before per-outlet
          inventory existed, which otherwise show "—" for Outlet. */}
      <Dialog open={!!editingRegisterKey} onOpenChange={(v) => !v && setEditingRegisterKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Register Outlet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet
              </Label>
              <Select value={editRegisterOutletId} onValueChange={setEditRegisterOutletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select which outlet this register belongs to" />
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
            {editRegisterError && <p className="text-sm text-destructive">{editRegisterError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRegisterKey(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editRegisterOutletId || savingRegisterOutlet}
              onClick={saveRegisterOutlet}
            >
              {savingRegisterOutlet ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
