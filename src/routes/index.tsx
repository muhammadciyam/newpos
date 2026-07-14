import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { netSalesSeries, salesCountSeries, dashboardStats, topSellingProducts } from "@/lib/pos-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Dashboard — Dhipos" },
      { name: "description", content: "Sales dashboard overview for Dhipos." },
    ],
  }),
  component: DashboardPage,
});

function ChartTooltip({ active, payload, label, prefix }: any) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value as number;
  return (
    <div className="rounded-lg bg-primary px-4 py-2 text-center text-primary-foreground shadow-lg">
      <p className="text-sm font-bold">
        {prefix}
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-primary-foreground/80">{label}</p>
    </div>
  );
}

function DashboardChart({ title, data, prefix = "" }: { title: string; data: typeof netSalesSeries; prefix?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{title}</p>
      <div className="mt-3 h-64">
        {data.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
            <p>No data yet</p>
            <p className="text-xs">Sales will appear here once you start ringing up bills.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                interval={Math.ceil(data.length / 8)}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                width={40}
              />
              <Tooltip content={<ChartTooltip prefix={prefix} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function DashboardPage() {
  const s = dashboardStats;
  const [showPromo, setShowPromo] = useState(true);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Sales Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Select defaultValue="all" onValueChange={(v) => toast.success(`Showing ${v === "all" ? "All Outlets" : "Seven Mart"}`)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Outlets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outlets</SelectItem>
                <SelectItem value="seven-mart">Seven Mart</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="gap-2 font-normal text-foreground"
              onClick={() => toast("Date range picker coming soon")}
            >
              13 Jun 2026 <span className="text-muted-foreground">~</span> 13 Jul 2026
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DashboardChart title="Net Sales" data={netSalesSeries} />
          <DashboardChart title="Sales Count" data={salesCountSeries} />
        </div>

        {showPromo && (
          <Card className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">Dhipos in your Pocket!</p>
              <p className="text-sm text-muted-foreground">
                Our brand new Dhipos mobile app is now available on Android and iOS app stores! Download now to
                manage your business on the go.
              </p>
              <button
                onClick={() => setShowPromo(false)}
                className="text-sm text-primary underline underline-offset-2"
              >
                Dismiss.
              </button>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => toast("The Dhipos app isn't available in this demo")}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white"
              >
                <span className="text-lg"></span>
              </button>
              <button
                onClick={() => toast("The Dhipos app isn't available in this demo")}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-sky-400 to-fuchsia-400 text-white"
              >
                <span className="text-lg">▶</span>
              </button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Today's Total Sales" value={s.todayTotalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} change={s.todayTotalSalesChange} />
          <StatCard label="Today's Net Sales" value={s.todayNetSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} change={s.todayNetSalesChange} />
          <StatCard label="Today's Credit Sales" value={s.todayCreditSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} neutral />
          <StatCard label="Yesterday's Net Sales" value={s.yesterdayNetSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} change={s.yesterdayNetSalesChange} />
          <StatCard label="This month Net sales" value={s.monthNetSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} change={s.monthNetSalesChange} />
          <StatCard label="Customers this month" value={String(s.customersThisMonth)} change={s.customersThisMonthChange} />
          <StatCard label="Products sold this month" value={String(s.productsSoldThisMonth)} change={s.productsSoldThisMonthChange} />
          <StatCard label="Refunds this month" value={String(s.refundsThisMonth)} change={s.refundsThisMonthChange} />
          <StatCard label="Voids This month" value={String(s.voidsThisMonth)} change={s.voidsThisMonthChange} />
        </div>

        <Card className="overflow-hidden p-5">
          <p className="font-semibold text-foreground">Top Selling Products</p>
          <p className="text-sm text-muted-foreground">Your best moving products in the period.</p>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSellingProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No products sold yet.
                    </TableCell>
                  </TableRow>
                )}
                {topSellingProducts.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{p.sold.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => toast(`${p.name}: ${p.sold.toLocaleString()} sold, ${p.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} revenue`)}>
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
