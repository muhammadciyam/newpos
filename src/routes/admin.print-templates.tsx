import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Printer, Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import {
  printTemplates,
  printTemplatesStore,
  usePrintSettings,
  type PrintTemplate,
} from "@/lib/print-templates-store";
import { useRegister } from "@/lib/register-store";
import { Receipt } from "@/components/receipt";
import { type Bill } from "@/lib/pos-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/print-templates")({
  head: () => ({ meta: [{ title: "Print Templates — Dhipos" }] }),
  component: PrintTemplatesPage,
});

const demoBill: Bill = {
  number: "1/1",
  customer: "Jane Cooper",
  location: "Seven Mart",
  register: "Register 1",
  status: "Sale",
  items: [
    { productId: "p1", name: "Espresso", price: 3.5, qty: 2 },
    { productId: "p2", name: "Blueberry Muffin", price: 2.75, qty: 1 },
  ],
  subtotal: 9.75,
  discount: 0,
  gst: 0.78,
  total: 10.53,
  created: "15-Jul-26, 10:32",
  by: "Owner",
  paymentMethod: "Cash",
  paymentStatus: "Paid",
  cashGiven: 15,
  changeGiven: 4.47,
};

function PrintTemplatesPage() {
  const canManage = useHasPermission("settings.manage");
  const printSettings = usePrintSettings();
  const register = useRegister();
  const [previewTemplate, setPreviewTemplate] = useState<PrintTemplate | null>(null);

  if (!canManage) return <RestrictedPage />;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Print Templates</h1>
          <p className="text-sm text-muted-foreground">
            Choose the layout used for bills and receipts. The default template is used
            automatically when printing a new sale.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {printTemplates.map((t) => {
            const isDefault = printSettings.defaultTemplateId === t.id;
            return (
              <Card
                key={t.id}
                className={`flex flex-col gap-3 p-5 ${isDefault ? "border-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Printer className="h-4 w-4" />
                  </div>
                  {isDefault && (
                    <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
                      <Check className="h-3 w-3" /> Default
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                  <p className="mt-1 text-xs uppercase text-muted-foreground">
                    Paper: {t.paperWidth}
                  </p>
                </div>
                <div className="mt-auto flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setPreviewTemplate(t)}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={isDefault}
                    onClick={() => {
                      printTemplatesStore.setDefault(t.id);
                      toast.success(`${t.name} set as default`);
                    }}
                  >
                    Set as Default
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog open={!!previewTemplate} onOpenChange={(v) => !v && setPreviewTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <div className="max-h-[70vh] overflow-y-auto rounded-md bg-muted/40 p-3">
              <Receipt bill={demoBill} template={previewTemplate} storeName={register.storeName} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
