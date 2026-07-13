import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [{ title: "Billing — Dhipos" }],
  }),
  component: BillingPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function BillingPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Card className="p-5">
          <p className="text-xl font-bold text-foreground">Billing Details</p>
          <div className="mt-3 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            <div>
              <Field label="Plan" value="Professional" />
              <Field label="Billing Interval" value="Every Month" />
              <Field label="Status" value={<Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Live</Badge>} />
            </div>
            <div>
              <Field label="Bill To" value="SEVEN MART" />
              <Field label="Billing Email" value="siyam69@gmail.com" />
              <Field label="Billing Mobile" value="7799190" />
              <Field label="Charge Type" value="Invoice will be emailed" />
            </div>
          </div>
          <Button variant="outline" className="mt-4" onClick={() => toast("Plan and billing period changes coming soon")}>
            Change Plan or Billing Period
          </Button>
        </Card>

        <Card className="p-5">
          <p className="text-xl font-bold text-foreground">Subscription</p>
          <p className="text-sm text-muted-foreground">Your active subscription details</p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <p className="font-medium text-foreground">Pro — Monthly</p>
                    <p className="text-xs text-muted-foreground">MVR755.58 / 1 months</p>
                  </TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>MVR755.58 / 1 months</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    <p className="font-medium text-foreground">Pro — Extra Register — Monthly</p>
                    <p className="text-xs text-muted-foreground">MVR370.08 / 1 months</p>
                  </TableCell>
                  <TableCell>1</TableCell>
                  <TableCell>MVR370.08 / 1 months</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xl font-bold text-foreground">Invoices</p>
          <p className="mt-4 text-sm text-muted-foreground">No invoices generated yet.</p>
        </Card>
      </div>
    </AppShell>
  );
}
