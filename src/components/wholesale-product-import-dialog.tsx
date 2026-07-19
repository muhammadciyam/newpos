import { useRef, useState } from "react";
import { FileDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { parseCsv, downloadCsv } from "@/lib/csv-utils";
import { findProductPhoto } from "@/lib/product-photo-search";
import {
  wholesalersStore,
  type Wholesaler,
  type WholesalerCategory,
  type WholesalerProductSizeUnit,
} from "@/lib/wholesalers-store";

const COLUMNS = [
  "Wholesaler",
  "Category",
  "Product Name",
  "Price",
  "Packing Details",
  "Size",
  "Size Unit (kg/ml)",
];

const SAMPLE_ROWS = [
  ["RED BROTHERS", "Snacks", "Basmati Rice", "25.00", "Box of 12", "5", "kg"],
  ["RED BROTHERS", "Beverages", "Mineral Water", "1.50", "Carton of 24", "500", "ml"],
];

function downloadSampleFormat() {
  downloadCsv("dhipos-wholesale-product-import-template.csv", [COLUMNS, ...SAMPLE_ROWS]);
}

type ParsedRow = {
  line: number;
  wholesalerName: string;
  wholesalerId?: string;
  categoryName: string;
  name: string;
  price: number | null;
  packingDetails?: string;
  size?: number;
  sizeUnit?: WholesalerProductSizeUnit;
  error?: string;
};

function parseRows(csvText: string, wholesalers: Wholesaler[]): ParsedRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];
  // First row is treated as a header and skipped regardless of its exact wording — anyone
  // re-typing the template header slightly differently shouldn't break the whole import.
  const dataRows = rows.slice(1);
  return dataRows.map((cells, idx) => {
    const [
      wholesalerNameRaw,
      categoryNameRaw,
      nameRaw,
      priceRaw,
      packingDetailsRaw,
      sizeRaw,
      sizeUnitRaw,
    ] = cells.map((c) => c ?? "");
    const line = idx + 2; // +1 for header row, +1 for 1-based line numbers
    const wholesalerName = wholesalerNameRaw.trim();
    const categoryName = categoryNameRaw.trim();
    const name = nameRaw.trim();
    const base = { line, wholesalerName, categoryName, name, price: null as number | null };

    if (!wholesalerName) return { ...base, error: "Wholesaler is required" };
    const wholesaler = wholesalers.find(
      (w) => w.name.trim().toLowerCase() === wholesalerName.toLowerCase(),
    );
    if (!wholesaler) return { ...base, error: `Wholesaler "${wholesalerName}" not found` };
    if (!categoryName) return { ...base, error: "Category is required" };
    if (!name) return { ...base, error: "Product name is required" };

    const price = parseFloat(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      return { ...base, error: "Price must be a number" };
    }

    const sizeTrim = sizeRaw.trim();
    const size = sizeTrim ? parseFloat(sizeTrim) : 0;
    if (sizeTrim && !Number.isFinite(size)) {
      return { ...base, price, error: "Size must be a number" };
    }

    const sizeUnitTrim = sizeUnitRaw.trim().toLowerCase();
    if (sizeUnitTrim && sizeUnitTrim !== "kg" && sizeUnitTrim !== "ml") {
      return { ...base, price, error: 'Size Unit must be "kg" or "ml"' };
    }

    return {
      ...base,
      wholesalerId: wholesaler.id,
      price,
      packingDetails: packingDetailsRaw.trim(),
      size,
      sizeUnit: (sizeUnitTrim || "kg") as WholesalerProductSizeUnit,
    };
  });
}

export function WholesaleProductImportDialog({
  open,
  onOpenChange,
  wholesalers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wholesalers: Wholesaler[];
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows?.filter((r) => !r.error) ?? [];
  const invalidRows = rows?.filter((r) => r.error) ?? [];

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRows(parseRows(text, wholesalers));
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: validRows.length });

    // Group valid rows by wholesaler, merging each row into that wholesaler's existing (or
    // newly created) category — mirrors the per-row category merge in submitStandaloneProduct,
    // but batched into a single update per wholesaler instead of one per row. The photo lookup
    // is awaited one row at a time (not Promise.all) to stay gentle on the search API's quota.
    const groups = new Map<
      string,
      { wholesaler: Wholesaler; categories: WholesalerCategory[]; addedCount: number }
    >();
    let seq = 0;
    for (const r of validRows) {
      const wholesaler = wholesalers.find((w) => w.id === r.wholesalerId);
      if (!wholesaler) continue;
      let group = groups.get(wholesaler.id);
      if (!group) {
        group = {
          wholesaler,
          categories: wholesaler.categories.map((c) => ({ ...c, products: [...c.products] })),
          addedCount: 0,
        };
        groups.set(wholesaler.id, group);
      }
      const catKey = r.categoryName.toLowerCase();
      let category = group.categories.find((c) => c.name.toLowerCase() === catKey);
      if (!category) {
        category = {
          id: `cat-${Date.now()}-${seq++}`,
          name: r.categoryName,
          imageUrl: "",
          products: [],
        };
        group.categories.push(category);
      }
      const imageUrl = await findProductPhoto(r.name);
      category.products.push({
        id: `prod-${Date.now()}-${seq++}`,
        name: r.name,
        price: r.price as number,
        imageUrl,
        packingDetails: r.packingDetails ?? "",
        size: r.size ?? 0,
        sizeUnit: r.sizeUnit ?? "kg",
        // Stock is only ever set/updated via Wholesale Inventory — new products always start at zero.
        stockQty: 0,
      });
      group.addedCount++;
      setImportProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    let importedCount = 0;
    const failed: string[] = [];
    for (const group of groups.values()) {
      const result = await wholesalersStore.update(group.wholesaler.id, {
        categories: group.categories,
      });
      if ("error" in result) {
        failed.push(group.wholesaler.name);
      } else {
        importedCount += group.addedCount;
      }
    }

    setImporting(false);
    if (failed.length > 0) {
      toast.error(`Failed to import products for: ${failed.join(", ")}`);
    }
    if (importedCount > 0) {
      toast.success(`Imported ${importedCount} product${importedCount === 1 ? "" : "s"}`);
      setRows(null);
      if (failed.length === 0) onOpenChange(false);
    }
  }

  function reset(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setRows(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Wholesale Products from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">1. Get the template</p>
              <p className="text-xs text-muted-foreground">
                Columns: {COLUMNS.join(", ")}. Opens and edits fine in Excel — save as CSV when
                you're done. Wholesaler must match an existing wholesaler's name exactly; categories
                are created automatically if they don't exist yet.
              </p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadSampleFormat}>
              <FileDown className="h-3.5 w-3.5" /> Download Sample Format
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">2. Upload your filled-in CSV</p>
              <p className="text-xs text-muted-foreground">
                A product photo is looked up and attached automatically by name — no Image column
                needed. New products always start at 0 stock — add inventory afterward via Wholesale
                Inventory.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Choose File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {rows && (
            <div>
              <p className="mb-2 text-sm text-foreground">
                <span className="font-medium text-emerald-600">
                  {validRows.length} ready to import
                </span>
                {invalidRows.length > 0 && (
                  <span className="text-destructive"> · {invalidRows.length} skipped (errors)</span>
                )}
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead>Wholesaler</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.line}>
                        <TableCell className="text-muted-foreground">{r.line}</TableCell>
                        <TableCell>{r.wholesalerName || "—"}</TableCell>
                        <TableCell>{r.categoryName || "—"}</TableCell>
                        <TableCell className="font-medium">{r.name || "—"}</TableCell>
                        <TableCell>{r.price != null ? r.price.toFixed(2) : "—"}</TableCell>
                        <TableCell>
                          {r.error ? (
                            <span className="text-destructive">{r.error}</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            Cancel
          </Button>
          <Button onClick={confirmImport} disabled={validRows.length === 0 || importing}>
            {importing
              ? `Finding photos & importing... (${importProgress.done}/${importProgress.total})`
              : `Import ${validRows.length || ""} Product${validRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
