import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Mail } from "lucide-react";
import { sampleCustomers } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [
      { title: "Customers — DhiPOS" },
      { name: "description", content: "View customer profiles and purchase history." },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <AppShell title="Customers">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
            <p className="text-sm text-muted-foreground">{sampleCustomers.length} registered</p>
          </div>
          <Button onClick={() => toast.success("New customer form opened")}><Plus className="mr-1 h-4 w-4" /> Add Customer</Button>
        </div>
        <Card className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search customers…" className="pl-8" />
          </div>
        </Card>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Visits</TableHead>
                <TableHead>Total Spent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleCustomers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.id}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone}</TableCell>
                  <TableCell>{c.visits}</TableCell>
                  <TableCell className="font-semibold">${c.spent.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => toast("Message sent to " + c.name)}>
                      <Mail className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}