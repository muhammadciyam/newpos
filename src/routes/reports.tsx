import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { salesReports, productReports } from "@/lib/pos-data";
import { useHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Dhipos" },
      { name: "description", content: "Sales and product reports for Dhipos." },
    ],
  }),
  component: ReportsPage,
});

function ReportSection({ title, items }: { title: string; items: { title: string; desc: string }[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border p-5">
        <p className="text-xl font-bold text-foreground">{title}</p>
      </div>
      <div className="border-b border-border bg-muted/40 px-5 py-2 text-sm font-medium text-muted-foreground">
        Report
      </div>
      <div className="divide-y divide-border">
        {items.map((r) => (
          <div key={r.title} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-foreground">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.desc}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => toast(`Opening ${r.title}`)}>
              View
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReportsPage() {
  const canView = useHasPermission("reports.view");
  if (!canView) return <RestrictedPage />;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <ReportSection title="Sales" items={salesReports} />
        <ReportSection title="Product" items={productReports} />
      </div>
    </AppShell>
  );
}
