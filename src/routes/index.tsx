import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, DollarSign, Receipt, ShoppingBag, Users } from "lucide-react";
import { sampleOrders } from "@/lib/pos-data";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const stats = [
  { label: "Today's Sales", value: "$1,284.50", delta: "+12.4%", icon: DollarSign },
  { label: "Orders", value: "48", delta: "+8", icon: Receipt },
  { label: "Avg. Ticket", value: "$26.75", delta: "+3.1%", icon: ShoppingBag },
  { label: "Active Customers", value: "124", delta: "+5", icon: Users },
];

function Dashboard() {
  return (
    <AppShell title="Dashboard">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Overview</p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Welcome back to DhiPOS</h2>
          </div>
          <Button asChild>
            <Link to="/pos">Open Register</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="shadow-[var(--shadow-card)]">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    <p className="mt-2 text-2xl font-bold text-foreground">{s.value}</p>
                  </div>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <s.icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                  <ArrowUpRight className="h-3 w-3" /> {s.delta} vs yesterday
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="shadow-[var(--shadow-card)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/orders">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {sampleOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-foreground">{o.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.customer} · {o.items} items · {o.time}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        o.status === "Completed"
                          ? "default"
                          : o.status === "Pending"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {o.status}
                    </Badge>
                    <span className="w-20 text-right font-semibold text-foreground">
                      ${o.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
