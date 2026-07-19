import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, FileText, IdCard } from "lucide-react";
import { toast } from "sonner";
import { authStore, useCurrentUser } from "@/lib/auth-store";

export const Route = createFileRoute("/my-profile")({
  head: () => ({ meta: [{ title: "My Profile — Dhipos" }] }),
  component: MyProfilePage,
});

function MyProfilePage() {
  const currentUser = useCurrentUser();
  const [form, setForm] = useState(() => ({
    name: currentUser?.name ?? "",
    photo: currentUser?.photo ?? "",
    phone: currentUser?.phone ?? "",
    address: currentUser?.address ?? "",
    emergencyContactName: currentUser?.emergencyContactName ?? "",
    emergencyContactPhone: currentUser?.emergencyContactPhone ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;
  const user = currentUser;

  function readFile(file: File | undefined, onDone: (dataUrl: string) => void) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onDone(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const result = await authStore.updateProfile(user.id, {
      name: form.name.trim(),
      photo: form.photo || null,
      phone: form.phone,
      address: form.address,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
    });
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Profile updated");
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
          <p className="text-sm text-muted-foreground">
            View and manage your own personal information.
          </p>
        </div>

        <Card className="space-y-5 p-5">
          <div className="flex items-center gap-3">
            <Avatar className="h-16 w-16">
              {form.photo && <AvatarImage src={form.photo} alt="" />}
              <AvatarFallback>{form.name.trim()[0]?.toUpperCase() ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="space-y-1.5">
              <input
                ref={photoInput}
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
                onClick={() => photoInput.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" /> Upload Photo
              </Button>
              <div>
                <Badge variant={user.role === "Cashier" ? "secondary" : "default"}>
                  {user.role}
                </Badge>
              </div>
            </div>
          </div>

          <section className="space-y-3 border-t border-border pt-4">
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
                <Input value={user.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Username</Label>
                <Input value={user.username} disabled />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Email and username can only be changed by an admin.
            </p>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Contact Info</p>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Emergency Contact Name</Label>
                <Input
                  value={form.emergencyContactName}
                  onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
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
            <p className="text-sm font-semibold text-foreground">Job Details</p>
            <p className="text-xs text-muted-foreground">
              Set by an admin — contact one to make changes.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Job Title</p>
                <p className="text-foreground">{user.jobTitle || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Department</p>
                <p className="text-foreground">{user.department || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hire Date</p>
                <p className="text-foreground">{user.hireDate || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Employment Status</p>
                <p className="text-foreground">{user.employmentStatus}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">Pay Info</p>
            <p className="text-xs text-muted-foreground">
              Set by an admin — contact one to make changes.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Salary / Wage</p>
                <p className="text-foreground">
                  {user.salary != null ? user.salary.toFixed(2) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pay Type</p>
                <p className="text-foreground">{user.payType}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">ID &amp; Documents</p>
            <p className="text-xs text-muted-foreground">
              Set by an admin — contact one to make changes.
            </p>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">National ID / Passport</p>
              <p className="text-foreground">{user.nationalId || "—"}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IdCard className={`h-3.5 w-3.5 ${user.idCardPhoto ? "text-emerald-600" : ""}`} />
              {user.idCardPhoto ? "ID on file" : "No ID on file"}
            </div>
            <div className="space-y-1.5">
              {user.certificates.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> No certificates on file.
                </p>
              ) : (
                user.certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center gap-2 rounded border border-border p-2 text-sm"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {cert.name}
                  </div>
                ))
              )}
            </div>
          </section>

          <div className="flex justify-end border-t border-border pt-4">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
