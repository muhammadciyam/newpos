import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Bill } from "@/lib/pos-data";
import {
  printTemplates,
  printTemplatesStore,
  usePrintSettings,
  type PrintTemplateId,
} from "@/lib/print-templates-store";
import { billsStore } from "@/lib/bills-store";
import { useRegister } from "@/lib/register-store";
import { Receipt } from "@/components/receipt";

export function PrintBillDialog({
  bill,
  open,
  onOpenChange,
  autoPrint,
}: {
  bill: Bill | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  autoPrint?: boolean;
}) {
  const printSettings = usePrintSettings();
  const register = useRegister();
  const [templateId, setTemplateId] = useState<PrintTemplateId>(printSettings.defaultTemplateId);

  useEffect(() => {
    if (open && bill) {
      setTemplateId((bill.printTemplateId as PrintTemplateId) ?? printSettings.defaultTemplateId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bill?.number]);

  function doPrint() {
    if (!bill) return;
    billsStore.recordPrint(bill.number, templateId);
    printTemplatesStore.setDefault(templateId);
    window.print();
  }

  useEffect(() => {
    if (open && autoPrint && bill) doPrint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!bill) return null;
  const template = printTemplatesStore.getTemplate(templateId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Bill {bill.number}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={templateId} onValueChange={(v) => setTemplateId(v as PrintTemplateId)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {printTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="max-h-[60vh] overflow-y-auto rounded-md bg-muted/40 p-3">
            <Receipt bill={bill} template={template} storeName={register.storeName} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={doPrint}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
