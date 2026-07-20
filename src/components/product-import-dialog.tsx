import { useRef, useState } from "react";
import { FileDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { productsStore } from "@/lib/products-store";
import { categoriesStore } from "@/lib/categories-store";
import { PLACEHOLDER_PRODUCT_IMAGE } from "@/lib/placeholder-image";
import type { Product, Category } from "@/lib/pos-data";
import type { Outlet } from "@/lib/outlets-store";

const COLUMNS = [
  "Name",
  "Category",
  "Price",
  "Cost",
  "SKU",
  "Barcode",
  "GST Applicable",
  "Countable",
];

const SAMPLE_ROWS = [
  ["Espresso", "Drinks", "3.50", "1.20", "ESP-001", "", "Yes", "Yes"],
  ["Cheeseburger", "Food", "9.99", "4.50", "", "8901234567890", "Yes", "Yes"],
];

function downloadSampleFormat() {
  downloadCsv("dhipos-product-import-template.csv", [COLUMNS, ...SAMPLE_ROWS]);
}

type ParsedRow = {
  line: number;
  name: string;
  categoryName: string;
  price: number | null;
  cost?: number;
  sku?: string;
  barcode?: string;
  gstApplicable?: boolean;
  countable?: boolean;
  error?: string;
};

function parseBool(raw: string | undefined): boolean | undefined {
  const v = raw?.trim().toLowerCase();
  if (!v) return undefined;
  if (["yes", "y", "true", "1"].includes(v)) return true;
  if (["no", "n", "false", "0"].includes(v)) return false;
  return undefined;
}

function parseRows(csvText: string): ParsedRow[] {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return [];
  // First row is treated as a header and skipped regardless of its exact wording — anyone
  // re-typing the template header slightly differently shouldn't break the whole import.
  const dataRows = rows.slice(1);
  return dataRows.map((cells, idx) => {
    const [name, categoryName, priceRaw, costRaw, sku, barcode, gstRaw, countableRaw] = cells.map(
      (c) => c ?? "",
    );
    const line = idx + 2; // +1 for header row, +1 for 1-based line numbers
    if (!name.trim()) return { line, name, categoryName, price: null, error: "Name is required" };
    if (!categoryName.trim())
      return { line, name, categoryName, price: null, error: "Category is required" };
    const price = parseFloat(priceRaw);
    if (!Number.isFinite(price) || price < 0) {
      return { line, name, categoryName, price: null, error: "Price must be a number" };
    }
    const cost = costRaw.trim() ? parseFloat(costRaw) : undefined;
    if (costRaw.trim() && !Number.isFinite(cost)) {
      return { line, name, categoryName, price, error: "Cost must be a number" };
    }
    return {
      line,
      name: name.trim(),
      categoryName: categoryName.trim(),
      price,
      cost,
      sku: sku.trim() || undefined,
      barcode: barcode.trim() || undefined,
      gstApplicable: parseBool(gstRaw),
      countable: parseBool(countableRaw),
    };
  });
}

// Finds or creates (once per distinct name within this import) the category id a row's
// category name resolves to — matches by name or slug so re-typing an existing category
// with different casing doesn't spawn a duplicate.
function resolveCategoryId(name: string, cache: Map<string, string>): string {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const existing = categoriesStore
    .get()
    .find((c: Category) => c.name.toLowerCase() === key || c.id === key);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = categoriesStore.create(name);
  const id =
    "error" in created
      ? (categoriesStore.get().find((c) => c.name.toLowerCase() === key)?.id ?? "all")
      : created.id;
  cache.set(key, id);
  return id;
}

export function ProductImportDialog({
  open,
  onOpenChange,
  outlets,
  isSuperAdmin,
  defaultOutletId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Every imported row lands in this one outlet's catalog — Super Admin has none of their
  // own, so they pick one explicitly; everyone else's own outlet is used automatically.
  outlets: Outlet[];
  isSuperAdmin: boolean;
  defaultOutletId: string | null;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [outletId, setOutletId] = useState(defaultOutletId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = rows?.filter((r) => !r.error) ?? [];
  const invalidRows = rows?.filter((r) => r.error) ?? [];

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRows(parseRows(text));
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (validRows.length === 0 || !outletId) return;
    setImporting(true);
    const categoryCache = new Map<string, string>();
    const inputs: Omit<Product, "id" | "stock">[] = validRows.map((r) => ({
      name: r.name,
      price: r.price as number,
      category: resolveCategoryId(r.categoryName, categoryCache),
      image: PLACEHOLDER_PRODUCT_IMAGE,
      outletId,
      cost: r.cost,
      sku: r.sku,
      barcode: r.barcode,
      gstApplicable: r.gstApplicable,
      countable: r.countable,
    }));
    const result = await productsStore.createBulk(inputs);
    setImporting(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Imported ${result.length} product${result.length === 1 ? "" : "s"}`);
    setRows(null);
    onOpenChange(false);
  }

  function reset(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setRows(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } else {
      setOutletId(defaultOutletId ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Products from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {isSuperAdmin && (
            <div className="space-y-1.5">
              <Label>
                <span className="text-destructive">*</span> Outlet
              </Label>
              <Select value={outletId} onValueChange={setOutletId}>
                <SelectTrigger>
                  <SelectValue placeholder="Which outlet do these products belong to?" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">1. Get the template</p>
              <p className="text-xs text-muted-foreground">
                Columns: {COLUMNS.join(", ")}. Opens and edits fine in Excel — save as CSV when
                you're done.
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
                New products always start at 0 stock — add inventory afterward via a Purchase
                Invoice.
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
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.line}>
                        <TableCell className="text-muted-foreground">{r.line}</TableCell>
                        <TableCell className="font-medium">{r.name || "—"}</TableCell>
                        <TableCell>{r.categoryName || "—"}</TableCell>
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
          <Button
            onClick={confirmImport}
            disabled={validRows.length === 0 || importing || !outletId}
          >
            {importing
              ? "Importing..."
              : `Import ${validRows.length || ""} Product${validRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
