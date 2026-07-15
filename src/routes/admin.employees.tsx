import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Upload, FileText, IdCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  authStore,
  useUsers,
  useUsersPolling,
  type AppUser,
  type Role,
  type PayType,
  type EmploymentStatus,
  type Certificate,
} from "@/lib/auth-store";
import { useHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees — Dhipos" }] }),
  component: EmployeesPage,
});

const roles: Role[] = ["Admin", "Manager", "Supervisor", "Cashier"];

const employmentStatusColor: Record<EmploymentStatus, string> = {
  Active: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Terminated: "bg-destructive/10 text-destructive hover:bg-destructive/10",
};

const emptyCreateForm = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "Cashier" as Role,
  photo: "",
  phone: "",
  jobTitle: "",
  department: "",
  hireDate: "",
  employmentStatus: "Active" as EmploymentStatus,
  salary: "",
  payType: "Monthly" as PayType,
  nationalId: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  idCardPhoto: "",
  certificates: [] as Certificate[],
};

type EditForm = {
  photo: string;
  phone: string;
  jobTitle: string;
  department: string;
  hireDate: string;
  employmentStatus: EmploymentStatus;
  salary: string;
  payType: PayType;
  nationalId: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  idCardPhoto: string;
  certificates: Certificate[];
};

function toEditForm(u: AppUser): EditForm {
  return {
    photo: u.photo ?? "",
    phone: u.phone,
    jobTitle: u.jobTitle,
    department: u.department,
    hireDate: u.hireDate,
    employmentStatus: u.employmentStatus,
    salary: u.salary != null ? String(u.salary) : "",
    payType: u.payType,
    nationalId: u.nationalId,
    address: u.address,
    emergencyContactName: u.emergencyContactName,
    emergencyContactPhone: u.emergencyContactPhone,
    idCardPhoto: u.idCardPhoto ?? "",
    certificates: u.certificates ?? [],
  };
}

function EmployeesPage() {
  const canManageUsers = useHasPermission("users.manage");
  useUsersPolling();
  const users = useUsers();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [error, setError] = useState("");
  const createPhotoInput = useRef<HTMLInputElement>(null);
  const createIdCardInput = useRef<HTMLInputElement>(null);
  const createCertificateInput = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const editPhotoInput = useRef<HTMLInputElement>(null);
  const editIdCardInput = useRef<HTMLInputElement>(null);
  const editCertificateInput = useRef<HTMLInputElement>(null);

  if (!canManageUsers) return <RestrictedPage />;

  function readFile(file: File | undefined, onDone: (dataUrl: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onDone(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function createEmployee() {
    setError("");
    const result = await authStore.createUser({
      ...form,
      salary: form.salary.trim() ? parseFloat(form.salary) : null,
      photo: form.photo || null,
      idCardPhoto: form.idCardPhoto || null,
      certificates: form.certificates,
    });
    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`Employee "${result.name}" added`);
    setForm(emptyCreateForm);
    setOpen(false);
  }

  function openEdit(user: AppUser) {
    setEditingId(user.id);
    setEditForm(toEditForm(user));
  }

  async function saveEdit() {
    if (!editingId || !editForm) return;
    const result = await authStore.updateProfile(editingId, {
      photo: editForm.photo || null,
      phone: editForm.phone,
      jobTitle: editForm.jobTitle,
      department: editForm.department,
      hireDate: editForm.hireDate,
      employmentStatus: editForm.employmentStatus,
      salary: editForm.salary.trim() ? parseFloat(editForm.salary) : null,
      payType: editForm.payType,
      nationalId: editForm.nationalId,
      address: editForm.address,
      emergencyContactName: editForm.emergencyContactName,
      emergencyContactPhone: editForm.emergencyContactPhone,
      idCardPhoto: editForm.idCardPhoto || null,
      certificates: editForm.certificates,
    });
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Employee profile updated");
    setEditingId(null);
    setEditForm(null);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Employees</h1>
            <p className="text-sm text-muted-foreground">
              Manage job details, pay, ID, and documents.
            </p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Employee
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Employment Status</TableHead>
                <TableHead>Pay</TableHead>
                <TableHead>Documents</TableHead>
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
                        <AvatarFallback className="text-xs font-semibold">
                          {u.name.trim()[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        {u.jobTitle && (
                          <p className="text-xs text-muted-foreground">{u.jobTitle}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.department || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={employmentStatusColor[u.employmentStatus]} variant="outline">
                      {u.employmentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.salary != null ? (
                      <>
                        {u.salary.toFixed(2)}
                        <span className="block text-xs text-muted-foreground">{u.payType}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <IdCard
                        className={`h-3.5 w-3.5 ${u.idCardPhoto ? "text-emerald-600" : ""}`}
                      />
                      {u.idCardPhoto ? "ID on file" : "No ID"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      {u.certificates.length} certificate{u.certificates.length === 1 ? "" : "s"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="icon" onClick={() => openEdit(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create new employee (also creates their login account) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Employee</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                {form.photo && <AvatarImage src={form.photo} alt="" />}
                <AvatarFallback>{form.name.trim()[0]?.toUpperCase() ?? "?"}</AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={createPhotoInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) =>
                    readFile(e.target.files?.[0], (url) => setForm((f) => ({ ...f, photo: url })))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => createPhotoInput.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> Upload Photo
                </Button>
              </div>
            </div>

            <section className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Basic Info</p>
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
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Phone number"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Role &amp; Access</p>
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
                    {roles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Job Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Job Title</Label>
                  <Input
                    value={form.jobTitle}
                    onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
                    placeholder="e.g. Cashier"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Input
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="e.g. Front of House"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Hire Date</Label>
                  <Input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) => setForm((f) => ({ ...f, hireDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Employment Status</Label>
                  <Select
                    value={form.employmentStatus}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, employmentStatus: v as EmploymentStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Pay Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Salary / Wage</Label>
                  <Input
                    value={form.salary}
                    onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pay Type</Label>
                  <Select
                    value={form.payType}
                    onValueChange={(v) => setForm((f) => ({ ...f, payType: v as PayType }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Hourly">Hourly</SelectItem>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">ID &amp; Emergency Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>National ID / Passport</Label>
                  <Input
                    value={form.nationalId}
                    onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Emergency Contact Name</Label>
                  <Input
                    value={form.emergencyContactName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emergencyContactName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Emergency Contact Phone</Label>
                  <Input
                    value={form.emergencyContactPhone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))
                    }
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground">Documents</p>
              <div className="space-y-1.5">
                <Label>ID Card Photo</Label>
                <div className="flex items-center gap-3">
                  {form.idCardPhoto ? (
                    <img
                      src={form.idCardPhoto}
                      alt="ID card"
                      className="h-16 w-24 rounded border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                  <input
                    ref={createIdCardInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      readFile(e.target.files?.[0], (url) =>
                        setForm((f) => ({ ...f, idCardPhoto: url })),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => createIdCardInput.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> {form.idCardPhoto ? "Replace" : "Upload"} ID
                    Card
                  </Button>
                  {form.idCardPhoto && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, idCardPhoto: "" }))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Certificates</Label>
                  <input
                    ref={createCertificateInput}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      readFile(file, (url) =>
                        setForm((f) => ({
                          ...f,
                          certificates: [
                            ...f.certificates,
                            {
                              id: `cert-${Date.now()}`,
                              name: file?.name.replace(/\.[^./]+$/, "") ?? "Certificate",
                              fileName: file?.name ?? "",
                              fileUrl: url,
                            },
                          ],
                        })),
                      );
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => createCertificateInput.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Add Certificate
                  </Button>
                </div>
                {form.certificates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No certificates uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {form.certificates.map((cert, i) => (
                      <div
                        key={cert.id}
                        className="flex items-center gap-2 rounded border border-border p-2"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Input
                          value={cert.name}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              certificates: f.certificates.map((c, idx) =>
                                idx === i ? { ...c, name: e.target.value } : c,
                              ),
                            }))
                          }
                          className="h-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              certificates: f.certificates.filter((_, idx) => idx !== i),
                            }))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

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
              onClick={createEmployee}
            >
              Create Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit employee profile */}
      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  {editForm.photo && <AvatarImage src={editForm.photo} alt="" />}
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
                <div>
                  <input
                    ref={editPhotoInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      readFile(e.target.files?.[0], (url) =>
                        setEditForm((f) => f && { ...f, photo: url }),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => editPhotoInput.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload Photo
                  </Button>
                </div>
              </div>

              <section className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Basic Info</p>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => f && { ...f, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">Job Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Job Title</Label>
                    <Input
                      value={editForm.jobTitle}
                      onChange={(e) => setEditForm((f) => f && { ...f, jobTitle: e.target.value })}
                      placeholder="e.g. Cashier"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Input
                      value={editForm.department}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, department: e.target.value })
                      }
                      placeholder="e.g. Front of House"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Hire Date</Label>
                    <Input
                      type="date"
                      value={editForm.hireDate}
                      onChange={(e) => setEditForm((f) => f && { ...f, hireDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Employment Status</Label>
                    <Select
                      value={editForm.employmentStatus}
                      onValueChange={(v) =>
                        setEditForm((f) => f && { ...f, employmentStatus: v as EmploymentStatus })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Terminated">Terminated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">Pay Info</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Salary / Wage</Label>
                    <Input
                      value={editForm.salary}
                      onChange={(e) => setEditForm((f) => f && { ...f, salary: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pay Type</Label>
                    <Select
                      value={editForm.payType}
                      onValueChange={(v) =>
                        setEditForm((f) => f && { ...f, payType: v as PayType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hourly">Hourly</SelectItem>
                        <SelectItem value="Monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">ID &amp; Emergency Contact</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>National ID / Passport</Label>
                    <Input
                      value={editForm.nationalId}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, nationalId: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input
                      value={editForm.address}
                      onChange={(e) => setEditForm((f) => f && { ...f, address: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Emergency Contact Name</Label>
                    <Input
                      value={editForm.emergencyContactName}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, emergencyContactName: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Emergency Contact Phone</Label>
                    <Input
                      value={editForm.emergencyContactPhone}
                      onChange={(e) =>
                        setEditForm((f) => f && { ...f, emergencyContactPhone: e.target.value })
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <p className="text-sm font-semibold text-foreground">Documents</p>
                <div className="space-y-1.5">
                  <Label>ID Card Photo</Label>
                  <div className="flex items-center gap-3">
                    {editForm.idCardPhoto ? (
                      <img
                        src={editForm.idCardPhoto}
                        alt="ID card"
                        className="h-16 w-24 rounded border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-24 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                    <input
                      ref={editIdCardInput}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        readFile(e.target.files?.[0], (url) =>
                          setEditForm((f) => f && { ...f, idCardPhoto: url }),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => editIdCardInput.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />{" "}
                      {editForm.idCardPhoto ? "Replace" : "Upload"} ID Card
                    </Button>
                    {editForm.idCardPhoto && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditForm((f) => f && { ...f, idCardPhoto: "" })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Certificates</Label>
                    <input
                      ref={editCertificateInput}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        readFile(file, (url) =>
                          setEditForm(
                            (f) =>
                              f && {
                                ...f,
                                certificates: [
                                  ...f.certificates,
                                  {
                                    id: `cert-${Date.now()}`,
                                    name: file?.name.replace(/\.[^./]+$/, "") ?? "Certificate",
                                    fileName: file?.name ?? "",
                                    fileUrl: url,
                                  },
                                ],
                              },
                          ),
                        );
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => editCertificateInput.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" /> Add Certificate
                    </Button>
                  </div>
                  {editForm.certificates.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No certificates uploaded.</p>
                  ) : (
                    <div className="space-y-2">
                      {editForm.certificates.map((cert, i) => (
                        <div
                          key={cert.id}
                          className="flex items-center gap-2 rounded border border-border p-2"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <Input
                            value={cert.name}
                            onChange={(e) =>
                              setEditForm(
                                (f) =>
                                  f && {
                                    ...f,
                                    certificates: f.certificates.map((c, idx) =>
                                      idx === i ? { ...c, name: e.target.value } : c,
                                    ),
                                  },
                              )
                            }
                            className="h-8"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() =>
                              setEditForm(
                                (f) =>
                                  f && {
                                    ...f,
                                    certificates: f.certificates.filter((_, idx) => idx !== i),
                                  },
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
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
