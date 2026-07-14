import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useBills } from "@/lib/bills-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";

export const Route = createFileRoute("/analytics/sales")({
  head: () => ({
    meta: [{ title: "Sales Analytics - Dhipos" }],
  }),
  component: SalesAnalyticsPage,
});

function SalesAnalyticsPage() {
  const canView = useHasPermission("reports.view");
  const [outletSelected, setOutletSelected] = useState(true);
  const bills = useBills();

  if (!canView) return <RestrictedPage />;

  const grossSales = bills.reduce((s, b) => s + b.total, 0);
  const netSales = grossSales;
  const billCount = bills.length;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">Sales Analytics</h1>

        <Card className="p-5">
          <p className="font-semibold text-foreground">Add Filters</p>
          <p className="text-sm text-muted-foreground">
            You can add multiple filters of different types to drill down in to your analytics
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Select defaultValue="bill-type">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bill-type">Bill Type</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Enter bill_type name" className="flex-1 min-w-[220px]" />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="font-semibold text-foreground">Select Date Range</p>
              <Button
                variant="outline"
                className="mt-2 gap-2 font-normal text-foreground"
                onClick={() => toast("Date range picker coming soon")}
              >
                13 Jun 2026 <span className="text-muted-foreground">~</span> 13 Jul 2026
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
            <div>
              <p className="font-semibold text-foreground">Select Outlets</p>
              <Button
                variant={outletSelected ? "default" : "outline"}
                className="mt-2"
                onClick={() => setOutletSelected((v) => !v)}
              >
                Seven Mart
              </Button>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="summary">
          <TabsList className="flex-wrap">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">
            {billCount === 0 ? (
              <Card className="p-10 text-center text-sm text-muted-foreground">
                No sales in this period yet. Ring up a bill on the Sell page to see it here.
              </Card>
            ) : (
              <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryStat label="Gross Sales" value={grossSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                <SummaryStat label="Discounts" value="0.00" />
                <SummaryStat label="Net Sales" value={netSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                <SummaryStat label="Bill Count" value={billCount.toLocaleString()} />
              </Card>
            )}
          </TabsContent>
          <TabsContent value="products">
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Select filters above to see product-level sales analytics.
            </Card>
          </TabsContent>
          <TabsContent value="brands">
            <Card className="p-10 text-center text-sm text-muted-foreground">No brand data for this period.</Card>
          </TabsContent>
          <TabsContent value="categories">
            <Card className="p-10 text-center text-sm text-muted-foreground">No category data for this period.</Card>
          </TabsContent>
          <TabsContent value="suppliers">
            <Card className="p-10 text-center text-sm text-muted-foreground">No supplier data for this period.</Card>
          </TabsContent>
          <TabsContent value="customers">
            <Card className="p-10 text-center text-sm text-muted-foreground">No customer data for this period.</Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}
