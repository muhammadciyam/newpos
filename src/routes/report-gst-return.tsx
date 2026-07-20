import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { useBills, useBillsPolling } from "@/lib/bills-store";
import { usePurchaseInvoices, invoiceTotals } from "@/lib/purchase-invoices-store";
import { useSettings } from "@/lib/settings-store";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import { toIsoDate, quarterRange, isoToDate } from "@/lib/report-utils";
import { downloadCsv } from "@/lib/csv-utils";
import { ReportPageShell, downloadSearchSchema } from "@/components/report-page-shell";

export const Route = createFileRoute("/report-gst-return")({
  head: () => ({ meta: [{ title: "GST Return - Dhipos" }] }),
  validateSearch: downloadSearchSchema,
  component: GstReturnPage,
});

type Quarter = 1 | 2 | 3 | 4;

const quarterLabels: Record<Quarter, string> = {
  1: "Q1 — January to March",
  2: "Q2 — April to June",
  3: "Q3 — July to September",
  4: "Q4 — October to December",
};

function currentQuarter(): Quarter {
  return (Math.floor(new Date().getMonth() / 3) + 1) as Quarter;
}

// MIRA's amount boxes are hand-filled one digit per cell, rounded to the nearest Rufiyaa
// (no cents) — this reproduces that grid so the on-screen/printed layout matches.
function DigitBoxes({ value, length = 9 }: { value: number | string; length?: number }) {
  const str = typeof value === "number" ? String(Math.round(value)) : value;
  const chars = str.padStart(length, " ").slice(-length).split("");
  return (
    <div className="flex shrink-0">
      {chars.map((c, i) => (
        <span
          key={i}
          className="-ml-px flex h-6 w-5 items-center justify-center border border-black text-xs font-mono first:ml-0 print:h-6 print:w-5"
        >
          {c.trim()}
        </span>
      ))}
    </div>
  );
}

function DateBoxes({ iso }: { iso: string }) {
  const d = isoToDate(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return (
    <div className="flex items-center gap-1">
      <DigitBoxes value={dd} length={2} />
      <DigitBoxes value={mm} length={2} />
      <DigitBoxes value={yyyy} length={4} />
    </div>
  );
}

function Box({
  n,
  label,
  sub,
  value,
  editable,
  onChange,
  emphasize,
}: {
  n: number;
  label: string;
  sub?: string;
  value: number;
  editable?: boolean;
  onChange?: (v: number) => void;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1298c9] text-[11px] font-bold text-white">
          {n}
        </span>
        <div>
          <p className={emphasize ? "font-bold text-black" : "text-black"}>{label}</p>
          {sub && <p className="text-xs italic text-muted-foreground print:hidden">{sub}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {editable && (
          <Input
            type="number"
            step="1"
            value={value}
            onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
            className="w-24 text-right print:hidden"
          />
        )}
        <DigitBoxes value={value} />
      </div>
    </div>
  );
}

function GstReturnPage() {
  const canView = useHasPermission("reports.view");
  const { download } = Route.useSearch();
  const bills = useBills();
  useBillsPolling();
  const invoices = usePurchaseInvoices();
  const settings = useSettings();

  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState<Quarter>(currentQuarter());
  const [box2, setBox2] = useState(0);
  const [box3, setBox3] = useState(0);
  const [box4, setBox4] = useState(0);
  const [box8, setBox8] = useState(0);
  const [box9, setBox9] = useState(0);
  const [amountPaidOverride, setAmountPaidOverride] = useState<number | null>(null);
  const [box13, setBox13] = useState(0);
  const [explanation, setExplanation] = useState("");

  if (!canView) return <RestrictedPage />;

  const { from, to } = quarterRange(year, quarter);
  const currency = settings.general.currency;

  const periodBills = bills.filter((b) => {
    if (b.status === "Void") return false;
    const d = toIsoDate(b.created);
    return d !== null && d >= from && d <= to;
  });

  // Box 1: GST is currently charged uniformly on a bill's whole subtotal (not filtered by
  // each product's individual GST-applicable flag), so every non-void sale in the period
  // is counted here — this app has no data to separately identify zero-rated / exempt /
  // out-of-scope sales, so Boxes 2-4 are left as manual entries rather than guessed at.
  const box1 = periodBills.reduce((s, b) => s + b.subtotal + b.gst, 0);
  const box5 = box1 + box2 + box3 + box4;
  const box6 = periodBills.reduce((s, b) => s + b.gst, 0);

  // Box 7 (Input tax): the closest concept this app has is GST paid on Purchase Invoices
  // approved within the period — there's no separate input-tax ledger.
  const box7 = invoices
    .filter((inv) => {
      if (inv.status !== "Approved" || !inv.reviewedAt) return false;
      const d = toIsoDate(inv.reviewedAt);
      return d !== null && d >= from && d <= to;
    })
    .reduce((s, inv) => s + invoiceTotals(inv).gstAmount, 0);

  const box10 = box6 - box7 - box8 + box9;
  const box11 = amountPaidOverride ?? box10;
  const box12 = periodBills.reduce((s, b) => s + (b.bagCharge ?? 0), 0);

  function exportCsv() {
    downloadCsv(`gst-return-${year}-Q${quarter}.csv`, [
      ["MIRA 205 GST Return", `${quarterLabels[quarter]} ${year}`],
      ["GST TIN", settings.tax.gstTin],
      ["Taxpayer Name", settings.tax.taxpayerName],
      ["Period From", from],
      ["Period To", to],
      [],
      ["Box", "Description", `Amount (${currency}, rounded)`],
      ["1", "Sales of supplies subject to GST at 8% (inclusive of GST)", String(Math.round(box1))],
      ["2", "Sales of zero-rated supplies", String(Math.round(box2))],
      ["3", "Sales of exempt supplies", String(Math.round(box3))],
      ["4", "Sales of supplies which are out of scope of GST", String(Math.round(box4))],
      ["5", "Total sales (Sum of Boxes 1 to 4)", String(Math.round(box5))],
      ["6", "Output tax", String(Math.round(box6))],
      ["7", "Input tax", String(Math.round(box7))],
      [
        "8",
        "Amount of GST re: irrecoverable debts written off / credit notes spanning a rate change",
        String(Math.round(box8)),
      ],
      ["9", "GST collected in excess", String(Math.round(box9))],
      [
        "10",
        "GST liability for the period (Box 6 - Box 7 - Box 8 + Box 9)",
        String(Math.round(box10)),
      ],
      ["11", "Amount of GST being paid", String(Math.round(box11))],
      ["", "Explanation if Box 10 and 11 differ", explanation],
      ["12", "Plastic bag fee collected for the period", String(Math.round(box12))],
      ["13", "Plastic bag fee collected in excess", String(Math.round(box13))],
    ]);
  }

  return (
    <ReportPageShell
      title="GST Return"
      description="Quarterly GST return prepared from sales and purchase data, laid out to match MIRA 205."
      download={download}
      extraHeader={
        <div className="flex items-end gap-2 print:hidden">
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v) as Quarter)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {([1, 2, 3, 4] as const).map((q) => (
                <SelectItem key={q} value={String(q)}>
                  {quarterLabels[q]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCsv} className="gap-1.5">
            <FileDown className="h-4 w-4" /> Export Excel (CSV)
          </Button>
        </div>
      }
    >
      {(!settings.tax.gstTin || !settings.tax.taxpayerName) && (
        <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 print:hidden">
          Set your GST TIN and Taxpayer Name in Admin &gt; Settings &gt; Tax so they appear below.
        </p>
      )}

      <div className="mx-auto w-full max-w-3xl border border-black bg-white p-6 text-black print:border-0 print:p-0">
        <div className="mb-1 flex items-start justify-between">
          <div />
          <div className="text-right text-xs font-bold">
            <p>MIRA 205</p>
            <p className="font-normal text-muted-foreground">Version 25.1</p>
          </div>
        </div>
        <div className="mb-4 text-center">
          <h1 className="text-3xl font-bold text-[#1298c9]">GST Return</h1>
          <p className="text-lg font-bold text-[#1298c9]">GENERAL GOODS AND SERVICES</p>
        </div>

        <div className="rounded-md border-2 border-[#1298c9] p-4">
          <p className="mb-3 text-center text-sm font-bold text-red-600">
            Tax returns without the following details will not be accepted.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-semibold">GST TIN (Taxpayer Identification Number)</p>
              <DigitBoxes value={settings.tax.gstTin || ""} length={13} />
              <p className="mt-1 text-[10px] italic text-muted-foreground">
                Your TIN as it appears on your GST Registration Certificate
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold">Taxpayer Name</p>
              <div className="h-8 border border-black px-2 py-1 text-sm">
                {settings.tax.taxpayerName}
              </div>
              <p className="mt-1 text-[10px] italic text-muted-foreground">
                Your name as it appears on your GST Registration Certificate
              </p>
            </div>
          </div>
          <div className="mt-4">
            <p className="mb-1 text-xs font-semibold">Taxable Period</p>
            <div className="flex items-center gap-6">
              <div>
                <p className="mb-1 text-[10px] italic text-muted-foreground">From</p>
                <DateBoxes iso={from} />
              </div>
              <div>
                <p className="mb-1 text-[10px] italic text-muted-foreground">To</p>
                <DateBoxes iso={to} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1 text-right text-xs font-bold">
            Rufiyaa
            <br />
            <span className="font-normal italic">(rounded off to the nearest Rufiyaa)</span>
          </p>
          <div className="divide-y divide-border/50">
            <Box
              n={1}
              label="Sales of supplies subject to GST at 8% (inclusive of GST)"
              value={box1}
            />
            <Box
              n={2}
              label="Sales of zero-rated supplies"
              sub="Not tracked separately in this system — enter manually if applicable."
              value={box2}
              editable
              onChange={setBox2}
            />
            <Box
              n={3}
              label="Sales of exempt supplies"
              sub="Not tracked separately in this system — enter manually if applicable."
              value={box3}
              editable
              onChange={setBox3}
            />
            <Box
              n={4}
              label="Sales of supplies which are out of scope of GST"
              sub="Not tracked separately in this system — enter manually if applicable."
              value={box4}
              editable
              onChange={setBox4}
            />
            <Box n={5} label="Total sales (Sum of Boxes 1 to 4)" value={box5} emphasize />
            <Box n={6} label="Output tax" value={box6} />
            <Box
              n={7}
              label="Input tax (Please attach the Statement of Input Tax)"
              sub="GST paid on Purchase Invoices approved within this period."
              value={box7}
            />
            <Box
              n={8}
              label="Amount of GST in respect of irrecoverable debts written off and amount of GST relating to credit notes spanning a rate change*"
              sub="Not tracked in this system — enter manually if applicable."
              value={box8}
              editable
              onChange={setBox8}
            />
            <Box
              n={9}
              label="GST collected in excess"
              sub="Manual adjustment — enter if applicable."
              value={box9}
              editable
              onChange={setBox9}
            />
            <Box
              n={10}
              label="GST LIABILITY FOR THE PERIOD (Box 6 minus Box 7 and Box 8 plus Box 9)"
              value={box10}
              emphasize
            />
            <Box
              n={11}
              label="Amount of GST being paid"
              value={box11}
              editable
              onChange={setAmountPaidOverride}
            />
          </div>
        </div>

        <p className="mt-1 text-[10px] italic">
          If the amounts in Boxes 10 and 11 are different, please provide an explanation below.
        </p>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className="mt-1 min-h-14 text-xs print:border-black"
          placeholder=""
        />
        <p className="mt-2 text-[10px] italic">
          * "Credit notes" here refers to credit notes issued on or after 1 January 2023 in respect
          of tax invoices issued before 1 January 2023.
        </p>

        <div className="mt-5">
          <p className="mb-1 text-right text-xs font-bold">
            Rufiyaa
            <br />
            <span className="font-normal italic">(rounded off to the nearest Rufiyaa)</span>
          </p>
          <div className="divide-y divide-border/50">
            <Box n={12} label="Plastic bag fee collected for the period" value={box12} />
            <Box
              n={13}
              label="Plastic bag fee collected in excess"
              sub="Manual adjustment — enter if applicable."
              value={box13}
              editable
              onChange={setBox13}
            />
          </div>
        </div>

        <div className="mt-4 rounded-md border-2 border-red-300 bg-red-50 p-3 print:bg-white">
          <p className="text-xs font-bold text-red-700">IMPORTANT</p>
          <p className="text-xs italic text-red-700">
            It is an offence to declare false information or fail to include required information in
            tax returns. The Tax Administration Act imposes severe penalties for such offences.
          </p>
        </div>

        <div className="mt-4 text-xs">
          <p className="font-bold">Declaration</p>
          <p className="mt-1">
            I declare that the information in this Return is true and correct and represents my
            assessment as required under the Goods and Services Tax Act (Law Number 10/2011), and
            the Waste Management Act (Law number 24/2022), and that I have all the necessary
            documentation to support the claims I have made in this return. I further declare that I
            am authorised to sign this Return.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
          <div className="border-t border-black pt-1">Title</div>
          <div className="border-t border-black pt-1">First Name</div>
          <div className="col-span-2 border-t border-black pt-1">Other Names</div>
          <div className="border-t border-black pt-1">Designation</div>
          <div className="border-t border-black pt-1">Date</div>
          <div className="col-span-2 border-t border-black pt-1">Contact Number</div>
          <div className="col-span-4 mt-3 border-t border-black pt-1">Signature &amp; Seal</div>
        </div>

        <div className="mt-4 rounded-md bg-[#1298c9] p-3 text-[10px] text-white print:bg-white print:text-black print:border print:border-black">
          <p className="mb-1 font-bold">For Office Use Only</p>
          <div className="grid grid-cols-4 gap-3">
            <div className="border-t border-white pt-1 print:border-black">Received By</div>
            <div className="border-t border-white pt-1 print:border-black">Received Date</div>
            <div className="border-t border-white pt-1 print:border-black">Voucher Number</div>
            <div className="border-t border-white pt-1 print:border-black">Verified By</div>
          </div>
        </div>

        <p className="mt-4 text-center text-[9px] text-muted-foreground">
          Maldives Inland Revenue Authority, Ameenee Magu, Male' 20379, Maldives | H: (+960) 1415 |
          W: www.mira.gov.mv
        </p>
        <p className="mt-1 text-center text-[9px] italic text-muted-foreground">
          Prepared by Dhipos for {settings.tax.taxpayerName || "this business"} — not an official
          MIRA-issued document. Verify every figure, including the manually-entered boxes above,
          before filing.
        </p>
      </div>
    </ReportPageShell>
  );
}
