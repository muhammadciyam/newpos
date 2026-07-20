import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, MoreHorizontal, FileDown, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, customersStore } from "@/lib/customers-store";
import type { Customer } from "@/lib/pos-data";
import { useBills } from "@/lib/bills-store";
import { useSettings } from "@/lib/settings-store";
import { PrintBillDialog } from "@/components/print-bill-dialog";
import { CustomerSalesDialog } from "@/components/customer-sales-dialog";
import { downloadCsv } from "@/lib/csv-utils";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Dhipos" },
      { name: "description", content: "All your customers in one place." },
    ],
  }),
  component: CustomersPage,
});

const avatarColors = [
  "bg-slate-700",
  "bg-orange-900",
  "bg-teal-700",
  "bg-red-500",
  "bg-emerald-900",
  "bg-teal-500",
  "bg-blue-950",
  "bg-slate-800",
  "bg-slate-900",
];

const emptyForm = {
  name: "",
  mobile: "",
  email: "",
  dob: "",
  address: "",
  taxNumber: "",
  creditLimit: "200",
  note: "",
  priceLevel: "default" as "default" | "wholesale",
};

function CustomersPage() {
  const customers = useCustomers();
  const bills = useBills();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "outstanding" | "clear">("all");
  const [form, setForm] = useState(emptyForm);
  const [salesCustomerId, setSalesCustomerId] = useState<string | null>(null);
  const [printNumber, setPrintNumber] = useState<string | null>(null);
  const printBill = bills.find((b) => b.number === printNumber) ?? null;

  function customerBills(customerId: string) {
    return bills.filter((b) => b.customerId === customerId);
  }
  function liveOutstanding(customerId: string) {
    return customerBills(customerId)
      .filter((b) => b.status === "Sale" && b.paymentStatus === "Pending")
      .reduce((s, b) => s + b.total, 0);
  }
  function liveSpent(customerId: string) {
    return customerBills(customerId)
      .filter((b) => b.status !== "Void")
      .reduce((s, b) => s + b.total, 0);
  }

  const filtered = customers.filter((c) => {
    if (balanceFilter === "outstanding" && liveOutstanding(c.id) <= 0) return false;
    if (balanceFilter === "clear" && liveOutstanding(c.id) > 0) return false;
    if (!search.trim()) return true;
    return c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search);
  });

  const salesCustomer = customers.find((c) => c.id === salesCustomerId) ?? null;

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, creditLimit: String(settings.customer.defaultCreditLimit) });
    setOpen(true);
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      mobile: c.mobile,
      email: c.email ?? "",
      dob: c.dob ?? "",
      address: c.address ?? "",
      taxNumber: c.taxNumber ?? "",
      creditLimit: String(c.limit),
      note: c.note ?? "",
      priceLevel: c.priceLevel ?? "default",
    });
    setOpen(true);
  }

  async function saveCustomer() {
    if (settings.customer.requireMobileOnCreate && !form.mobile.trim()) {
      toast.error("Mobile number is required (Settings > Customer).");
      return;
    }
    const limit = parseFloat(form.creditLimit) || 0;
    const payload = {
      name: form.name,
      mobile: form.mobile,
      email: form.email,
      dob: form.dob,
      address: form.address,
      taxNumber: form.taxNumber,
      note: form.note,
      priceLevel: form.priceLevel,
      limit,
    };
    if (editingId) {
      const result = await customersStore.update(editingId, payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Customer "${form.name}" updated`);
    } else {
      const result = await customersStore.create(payload);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Customer "${form.name}" created`);
    }
    setOpen(false);
  }

  function exportCsv() {
    downloadCsv("customers.csv", [
      ["Name", "Mobile", "Email", "Outstanding", "Credit Limit", "Total Spent", "Loyalty"],
      ...filtered.map((c) => [
        c.name,
        c.mobile,
        c.email ?? "",
        liveOutstanding(c.id).toFixed(2),
        c.limit.toFixed(2),
        liveSpent(c.id).toFixed(2),
        String(c.loyalty),
      ]),
    ]);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">All your customers in one place</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Enter Name, Mobile numb..."
              className="w-56"
            />
            <Select
              value={balanceFilter}
              onValueChange={(v) => setBalanceFilter(v as typeof balanceFilter)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                <SelectItem value="outstanding">With Balance Due</SelectItem>
                <SelectItem value="clear">No Balance Due</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportCsv} className="gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> Export CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Outstanding</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead>Loyalty</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Avatar className="h-8 w-8">
                      <AvatarFallback
                        className={`${avatarColors[i % avatarColors.length]} text-xs font-semibold text-white`}
                      >
                        {c.name.trim()[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.mobile}</TableCell>
                  <TableCell>
                    {liveOutstanding(c.id).toFixed(2)}
                    <span className="block text-xs text-muted-foreground">
                      Limit {c.limit.toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell>{liveSpent(c.id).toFixed(2)}</TableCell>
                  <TableCell>{c.loyalty}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setSalesCustomerId(c.id)}>
                        View Sales
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)} className="gap-1.5">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="gap-1.5 text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete "{c.name}"?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the customer record. This can't be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    const result = await customersStore.remove(c.id);
                                    if ("error" in result) {
                                      toast.error(result.error);
                                      return;
                                    }
                                    toast.success(`"${c.name}" deleted`);
                                  }}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No customers match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Customer" : "Create Customer"}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Name
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {settings.customer.requireMobileOnCreate && (
                  <span className="text-destructive">*</span>
                )}{" "}
                Mobile
              </Label>
              <Input
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                placeholder="Mobile"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth</Label>
              <Input
                type="date"
                value={form.dob}
                onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
                placeholder="Select date"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Textarea
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Address"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tax Number</Label>
              <Input
                value={form.taxNumber}
                onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                placeholder="Customer Tax Number"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default Price Level</Label>
              <Select
                value={form.priceLevel}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, priceLevel: v as "default" | "wholesale" }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bills created for customer will have this price level by default
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Credit Limit
              </Label>
              <Input
                value={form.creditLimit}
                onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Customer Credit Limit</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Note</Label>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Note"
              />
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.name.trim() ||
                (settings.customer.requireMobileOnCreate && !form.mobile.trim())
              }
              onClick={saveCustomer}
            >
              {editingId ? "Save Changes" : "Create"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!salesCustomer} onOpenChange={(v) => !v && setSalesCustomerId(null)}>
        {salesCustomer && (
          <CustomerSalesDialog
            customer={salesCustomer}
            bills={customerBills(salesCustomer.id)}
            onPrint={setPrintNumber}
          />
        )}
      </Dialog>

      <PrintBillDialog
        bill={printBill}
        open={!!printBill}
        onOpenChange={(v) => !v && setPrintNumber(null)}
      />
    </AppShell>
  );
}
