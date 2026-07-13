import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Printer } from "lucide-react";
import { sampleOrders } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders — DhiPOS" },
      { name: "description", content: "Review, print, and refund past orders." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  return (
    <AppShell title="Orders">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Order History</h2>
          <p className="text-sm text-muted-foreground">Last 24 hours</p>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.id}</TableCell>
                  <TableCell>{o.customer}</TableCell>
                  <TableCell>{o.items}</TableCell>
                  <TableCell className="text-muted-foreground">{o.time}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "Completed" ? "default" : o.status === "Pending" ? "secondary" : "destructive"}>
                      {o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-semibold">${o.total.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => toast("Viewing " + o.id)}><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => toast("Printing " + o.id)}><Printer className="h-4 w-4" /></Button>
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