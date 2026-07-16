import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProducts, useProductsPolling } from "@/lib/products-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { ReportPageShell, StatCard, downloadSearchSchema } from "@/components/report-page-shell";

export const Route = createFileRoute("/report-reorder")({
  head: () => ({ meta: [{ title: "Reorder Report - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: ReorderPage,
});

// This app doesn't have a per-product reorder level field yet, so the threshold is
// adjustable here at report time — same default (15) as the "Low Stock" badge used
// elsewhere (Products, Stock Report).
const DEFAULT_THRESHOLD = 15;

function ReorderPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const products = useProducts();
  useProductsPolling();
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD));

  const parsedThreshold = parseInt(threshold, 10);
  const belowThreshold = useMemo(
    () =>
      Number.isFinite(parsedThreshold)
        ? products.filter((p) => p.stock < parsedThreshold).sort((a, b) => a.stock - b.stock)
        : [],
    [products, parsedThreshold],
  );

  if (!canView) return <RestrictedPage />;

  return (
    <ReportPageShell
      title="Reorder Report"
      description="Products below the reorder threshold."
      download={download}
      extraHeader={
        <div className="space-y-1.5">
          <Label>Reorder Threshold</Label>
          <Input
            type="number"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-32"
          />
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Products to Reorder" value={String(belowThreshold.length)} />
        <StatCard
          label="Out of Stock"
          value={String(belowThreshold.filter((p) => p.stock === 0).length)}
        />
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Current Stock</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {belowThreshold.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nothing below the reorder threshold.
                </TableCell>
              </TableRow>
            )}
            {belowThreshold.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{p.category}</TableCell>
                <TableCell>{p.stock}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      p.stock === 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-700"
                    }
                  >
                    {p.stock === 0 ? "Out of Stock" : "Reorder Soon"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReportPageShell>
  );
}
