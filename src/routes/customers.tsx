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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Plus, SlidersHorizontal, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useCustomers, customersStore } from "@/lib/customers-store";
import { useBills } from "@/lib/bills-store";
import { PrintBillDialog } from "@/components/print-bill-dialog";
import { CustomerSalesDialog } from "@/components/customer-sales-dialog";

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
};

function CustomersPage() {
  const customers = useCustomers();
  const bills = useBills();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [salesCustomerId, setSalesCustomerId] = useState<string | null>(null);
  const [printNumber, setPrintNumber] = useState<string | null>(null);
  const printBill = bills.find((b) => b.number === printNumber) ?? null;

  const filtered = customers.filter(
    (c) =>
      !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile.includes(search),
  );

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

  const salesCustomer = customers.find((c) => c.id === salesCustomerId) ?? null;

  function createCustomer() {
    const limit = parseFloat(form.creditLimit) || 0;
    customersStore.create({ name: form.name, mobile: form.mobile, limit });
    toast.success(`Customer "${form.name}" created`);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">All your customers in one place</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Enter Name, Mobile numb..."
              className="w-56"
            />
            <Button variant="outline" size="icon" onClick={() => toast("Filter customers")}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
            <Button onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> New
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => toast("Export or import customers")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
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
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toast(`More actions for ${c.name}`)}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
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
            <SheetTitle>Create Customer</SheetTitle>
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
                <span className="text-destructive">*</span> Mobile
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
              <Select>
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
            <Button disabled={!form.name.trim() || !form.mobile.trim()} onClick={createCustomer}>
              Create
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
