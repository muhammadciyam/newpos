import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useQuotations, quotationsStore } from "@/lib/quotations-store";
import { customersStore } from "@/lib/customers-store";

export const Route = createFileRoute("/pos/quotations")({
  head: () => ({
    meta: [{ title: "Quotations - Dhipos" }],
  }),
  component: QuotationsPage,
});

function QuotationsPage() {
  const quotations = useQuotations();
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState("");
  const [customer, setCustomer] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");

  function createQuotation() {
    const q = quotationsStore.create(location === "seven-mart" ? "Seven Mart" : location, customer);
    toast.success(`Quotation ${q.number} created`);
    setOpen(false);
    setCustomer("");
    setLocation("");
  }

  function createNewCustomer() {
    if (!newCustomerName.trim()) return;
    const created = customersStore.create({
      name: newCustomerName.trim(),
      mobile: newCustomerMobile.trim(),
      limit: 0,
    });
    setCustomer(created.name);
    toast.success(`Customer "${created.name}" created`);
    setNewCustomerName("");
    setNewCustomerMobile("");
    setNewCustomerOpen(false);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
            <p className="text-sm text-muted-foreground">Quotations given by outlets</p>
          </div>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> New
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                      <Inbox className="h-10 w-10" />
                      <p>No data</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                quotations.map((q) => (
                  <TableRow key={q.number}>
                    <TableCell className="font-medium">{q.number}</TableCell>
                    <TableCell>{q.location}</TableCell>
                    <TableCell>{q.customer || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{q.status}</Badge>
                    </TableCell>
                    <TableCell>{q.total.toFixed(2)}</TableCell>
                    <TableCell>{q.created}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => toast(`Quotation ${q.number} for ${q.customer || "walk-in"}`)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Quotation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">
                <span className="text-destructive">*</span> Location
              </label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seven-mart">Seven Mart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-foreground">Customer</label>
              <div className="relative">
                <Input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Enter customer name"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setNewCustomerOpen(true)}
                  title="New Customer"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!location} onClick={createQuotation}>
              Create Quotation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile</Label>
              <Input
                value={newCustomerMobile}
                onChange={(e) => setNewCustomerMobile(e.target.value)}
                placeholder="Mobile number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!newCustomerName.trim()} onClick={createNewCustomer}>
              Create Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
