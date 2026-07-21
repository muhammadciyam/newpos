import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { iconColors, type IconColor } from "@/lib/icon-colors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  History,
  CalendarRange,
  Users,
  Package,
  RotateCcw,
  Ban,
  BarChart3,
  Eye,
  Store,
  X,
  Apple,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { useDashboardStats } from "@/lib/dashboard-stats";
import { useBillsPolling } from "@/lib/bills-store";
import { ReportDateRangeControl, type ReportRange } from "@/components/report-date-range";
import { daysAgoIso, todayIso } from "@/lib/report-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import type { SalesPoint } from "@/lib/pos-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sales Dashboard — Dhipos" },
      { name: "description", content: "Sales dashboard overview for Dhipos." },
    ],
  }),
  component: DashboardPage,
});

type ChartTooltipProps = {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  prefix?: string;
};

function ChartTooltip({ active, payload, label, prefix }: ChartTooltipProps) {
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

function DashboardChart({
  title,
  data,
  prefix = "",
  icon: Icon,
  color = "blue",
}: {
  title: string;
  data: SalesPoint[];
  prefix?: string;
  icon: LucideIcon;
  color?: IconColor;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md shadow-sm ring-1 ring-black/5",
            iconColors[color],
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{title}</p>
      </div>
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
  // Sales figures aren't a Cashier's business — same permission gate as Reports/Analytics
  // (the sidebar already hides "Home" for them; this covers landing here directly, e.g. as
  // the post-login default route).
  const canView = useHasPermission("reports.view");
  const navigate = useNavigate();
  // Actively refetches so a sale rung up on another device/register shows up here within
  // a few seconds too, not just when it happens in this same browser tab.
  useBillsPolling();
  const [range, setRange] = useState<ReportRange>(() => ({ from: daysAgoIso(13), to: todayIso() }));
  const {
    stats: s,
    netSalesSeries,
    salesCountSeries,
    topSellingProducts,
    productDetails,
  } = useDashboardStats(range);
  const [showPromo, setShowPromo] = useState(true);
  const [detailProduct, setDetailProduct] = useState<string | null>(null);
  const currency = useSettings().general.currency;

  useEffect(() => {
    if (!canView) navigate({ to: "/pos/sell" });
  }, [canView, navigate]);

  if (!canView) return null;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Sales Dashboard</h1>
          <div className="flex flex-wrap items-center gap-2">
            <ReportDateRangeControl value={range} onChange={setRange} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DashboardChart
            title="Net Sales"
            data={netSalesSeries}
            icon={TrendingUp}
            color="emerald"
          />
          <DashboardChart
            title="Sales Count"
            data={salesCountSeries}
            icon={BarChart3}
            color="blue"
          />
        </div>

        {showPromo && (
          <Card className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
            <div>
              <p className="font-semibold text-foreground">Dhipos in your Pocket!</p>
              <p className="text-sm text-muted-foreground">
                Our brand new Dhipos mobile app is now available on Android and iOS app stores!
                Download now to manage your business on the go.
              </p>
              <button
                onClick={() => setShowPromo(false)}
                className="mt-1 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
              </button>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => toast("The Dhipos app isn't available in this demo")}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-black text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                title="Download on the App Store"
              >
                <Apple className="h-5 w-5" />
              </button>
              <button
                onClick={() => toast("The Dhipos app isn't available in this demo")}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-sky-400 to-fuchsia-400 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                title="Get it on Google Play"
              >
                <PlayCircle className="h-5 w-5" />
              </button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Today's Total Sales"
            value={s.todayTotalSales.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={s.todayTotalSalesChange}
            icon={Wallet}
            color="blue"
          />
          <StatCard
            label="Today's Net Sales"
            value={s.todayNetSales.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={s.todayNetSalesChange}
            icon={TrendingUp}
            color="emerald"
          />
          <StatCard
            label="Today's Credit Sales"
            value={s.todayCreditSales.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            neutral
            icon={CreditCard}
            color="amber"
          />
          <StatCard
            label="Yesterday's Net Sales"
            value={s.yesterdayNetSales.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={s.yesterdayNetSalesChange}
            icon={History}
            color="violet"
          />
          <StatCard
            label="This month Net sales"
            value={s.monthNetSales.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            change={s.monthNetSalesChange}
            icon={CalendarRange}
            color="indigo"
          />
          <StatCard
            label="Customers this month"
            value={String(s.customersThisMonth)}
            change={s.customersThisMonthChange}
            icon={Users}
            color="pink"
          />
          <StatCard
            label="Products sold this month"
            value={String(s.productsSoldThisMonth)}
            change={s.productsSoldThisMonthChange}
            icon={Package}
            color="cyan"
          />
          <StatCard
            label="Refunds this month"
            value={String(s.refundsThisMonth)}
            change={s.refundsThisMonthChange}
            icon={RotateCcw}
            color="rose"
          />
          <StatCard
            label="Voids This month"
            value={String(s.voidsThisMonth)}
            change={s.voidsThisMonthChange}
            icon={Ban}
            color="slate"
          />
        </div>

        <Card className="overflow-hidden p-5">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5",
                iconColors.amber,
              )}
            >
              <Package className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <p className="font-semibold text-foreground">Top Selling Products</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your best moving products in the period.
          </p>
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
                    <TableCell>
                      {p.revenue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell>{p.sold.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-blue-600 hover:text-blue-700"
                        onClick={() => setDetailProduct(p.name)}
                      >
                        <Eye className="h-3.5 w-3.5" />
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

      <Dialog open={!!detailProduct} onOpenChange={(v) => !v && setDetailProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailProduct}</DialogTitle>
            <DialogDescription>
              Sales detail for the period selected above ({range.from} ~ {range.to}).
            </DialogDescription>
          </DialogHeader>
          {detailProduct &&
            (() => {
              const summary = topSellingProducts.find((p) => p.name === detailProduct);
              const lines = productDetails.get(detailProduct) ?? [];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Total Sold</p>
                      <p className="text-xl font-bold text-foreground">
                        {(summary?.sold ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Total Revenue</p>
                      <p className="text-xl font-bold text-foreground">
                        {currency}{" "}
                        {(summary?.revenue ?? 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Bills ({lines.length})
                    </p>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bill</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="py-6 text-center text-muted-foreground"
                              >
                                No bills in this period.
                              </TableCell>
                            </TableRow>
                          )}
                          {lines.map((line, idx) => (
                            <TableRow key={`${line.billNumber}-${idx}`}>
                              <TableCell className="font-medium">{line.billNumber}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {line.created}
                              </TableCell>
                              <TableCell>{line.qty}</TableCell>
                              <TableCell>
                                {line.lineTotal.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
