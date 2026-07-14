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
import { useProducts } from "@/lib/products-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";

export const Route = createFileRoute("/analytics/inventory")({
  head: () => ({
    meta: [{ title: "Inventory Analytics - Dhipos" }],
  }),
  component: InventoryAnalyticsPage,
});

function InventoryAnalyticsPage() {
  const canView = useHasPermission("reports.view");
  const [outletSelected, setOutletSelected] = useState(true);
  const products = useProducts();

  if (!canView) return <RestrictedPage />;

  const salesValue = products.reduce((s, p) => s + p.price * p.stock, 0);
  const count = products.reduce((s, p) => s + p.stock, 0);
  const lowStocks = products.filter((p) => p.stock < 15).length;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">Inventory Analytics</h1>

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

          <div className="mt-6">
            <p className="font-semibold text-foreground">Select Outlets</p>
            <Button
              variant={outletSelected ? "default" : "outline"}
              className="mt-2"
              onClick={() => setOutletSelected((v) => !v)}
            >
              Seven Mart
            </Button>
          </div>
        </Card>

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>
          <TabsContent value="summary">
            <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryStat label="Total Cost" value="0.00" />
              <SummaryStat label="Sales Value (Ex. Tax)" value={salesValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
              <SummaryStat label="Count" value={count.toLocaleString()} />
              <SummaryStat label="Low Stocks" value={lowStocks.toLocaleString()} />
            </Card>
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
