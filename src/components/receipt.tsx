import { QRCodeSVG } from "qrcode.react";
import { type Bill } from "@/lib/pos-data";
import { type PrintTemplate } from "@/lib/print-templates-store";
import { useSettings } from "@/lib/settings-store";
import { useRegister, registerDisplayName } from "@/lib/register-store";

// Same-origin so it resolves correctly whether this is opened on localhost during
// development or on whatever host the app is actually deployed to.
function eBillUrl(billNumber: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/e-bill/${encodeURIComponent(billNumber)}`;
}

// My Dhipos (Settings > My Dhipos) — lets a known customer see every bill linked to their
// account, not just this one. Only meaningful for a bill tied to an actual customer record.
function myDhiposUrl(customerId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/my-dhipos/${encodeURIComponent(customerId)}`;
}

export function Receipt({
  bill,
  template,
  storeName,
}: {
  bill: Bill;
  template: PrintTemplate;
  storeName: string;
}) {
  const settings = useSettings();
  const { registers } = useRegister();
  const showQr = template.showQrCode && settings.myDhipos.eBillQrEnabled;
  const showMyDhiposQr = template.showQrCode && settings.myDhipos.enabled && !!bill.customerId;
  const currency = settings.general.currency;
  const gstPercent = settings.tax.gstPercent;

  return (
    <div
      className="receipt-print-area mx-auto rounded-md border border-border bg-white p-4 text-sm text-black"
      data-paper={template.paperWidth}
    >
      {template.showLogo ? (
        <div className="mb-2 flex flex-col items-center gap-1 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded bg-black text-sm font-bold text-white">
            {storeName.trim()[0]?.toUpperCase() ?? "D"}
          </div>
          <p className="font-bold">{storeName}</p>
        </div>
      ) : (
        <p className="text-center font-bold">{storeName}</p>
      )}

      <div className="mt-2 flex justify-between text-xs">
        <span>Bill #{bill.number}</span>
        <span>{bill.created}</span>
      </div>
      <div className="flex justify-between text-xs">
        <span>Cashier: {bill.by}</span>
        <span>{registerDisplayName(registers, bill.register)}</span>
      </div>
      {bill.customer && <p className="text-xs">Customer: {bill.customer}</p>}

      {bill.status !== "Sale" && (
        <p className="mt-2 rounded bg-amber-100 px-2 py-1 text-center text-xs font-semibold uppercase text-amber-800">
          {bill.status}
        </p>
      )}

      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="border-b border-black/20 text-left">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Price</th>
            {template.showItemizedTax && <th className="py-1 text-right">Tax</th>}
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((i) => (
            <tr key={i.productId}>
              <td className="py-1">
                {i.name}
                {i.refundedQty ? (
                  <span className="text-muted-foreground"> (refunded {i.refundedQty})</span>
                ) : null}
              </td>
              <td className="py-1 text-right">{i.qty}</td>
              <td className="py-1 text-right">{i.price.toFixed(2)}</td>
              {template.showItemizedTax && (
                <td className="py-1 text-right">
                  {i.gstApplicable !== false
                    ? (i.price * i.qty * (gstPercent / 100)).toFixed(2)
                    : "—"}
                </td>
              )}
              <td className="py-1 text-right">{(i.price * i.qty).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-2 space-y-0.5 border-t border-black/20 pt-2 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>
            {currency} {bill.subtotal.toFixed(2)}
          </span>
        </div>
        {bill.discount > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>
              -{currency} {bill.discount.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span>
            {settings.tax.gstLabel} ({gstPercent}%)
          </span>
          <span>
            {currency} {bill.gst.toFixed(2)}
          </span>
        </div>
        {!!bill.bagCharge && (
          <div className="flex justify-between">
            <span>
              Plastic Bag Charge ({bill.bagQty} × {settings.tax.bagFeeRate.toFixed(2)} {currency})
            </span>
            <span>
              {currency} {bill.bagCharge.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold">
          <span>Grand Total</span>
          <span>
            {currency} {bill.total.toFixed(2)}
          </span>
        </div>
        {bill.currency && bill.currencyTotal != null && (
          <div className="flex justify-between text-muted-foreground">
            <span>≈ {bill.currency}</span>
            <span>{bill.currencyTotal.toFixed(2)}</span>
          </div>
        )}
      </div>

      {(bill.foc || bill.noDelivery || bill.note || (bill.tags && bill.tags.length > 0)) && (
        <div className="mt-2 border-t border-black/20 pt-2 text-xs">
          {bill.foc && <p className="font-semibold uppercase">Free of Charge</p>}
          {bill.noDelivery && <p>No Delivery</p>}
          {bill.note && <p>Note: {bill.note}</p>}
          {bill.tags && bill.tags.length > 0 && <p>Tags: {bill.tags.join(", ")}</p>}
        </div>
      )}

      <div className="mt-2 border-t border-black/20 pt-2 text-xs">
        <p>
          Payment: {bill.paymentMethod}
          {bill.paymentStatus === "Pending" && (
            <span className="ml-1 font-semibold uppercase">(Pending)</span>
          )}
        </p>
        {bill.paymentMethod === "Cash" && (
          <>
            <p>Cash Given: {(bill.cashGiven ?? 0).toFixed(2)}</p>
            <p>Change: {(bill.changeGiven ?? 0).toFixed(2)}</p>
          </>
        )}
        {bill.paymentMethod === "Bank Transfer" && bill.recipientNumber && (
          <p>Recipient: {bill.recipientNumber}</p>
        )}
        {bill.paymentMethod === "Card" && bill.cardSlipNumber && (
          <p>Slip #: {bill.cardSlipNumber}</p>
        )}
        {bill.customReceiptNumber && <p>Receipt #: {bill.customReceiptNumber}</p>}
        {bill.paymentMethod === "Credit" && bill.paymentStatus === "Pending" && (
          <p>Amount owed: {bill.total.toFixed(2)}</p>
        )}
      </div>

      {bill.refunds && bill.refunds.length > 0 && (
        <div className="mt-2 border-t border-black/20 pt-2 text-xs">
          <p className="font-semibold">Refunds</p>
          {bill.refunds.map((r) => (
            <p key={r.id}>
              {r.at} — {currency} {r.amount.toFixed(2)} by {r.by}
            </p>
          ))}
        </div>
      )}

      {(showQr || showMyDhiposQr) && (
        <div className="mt-3 flex items-start justify-center gap-4">
          {showQr && (
            <div className="flex flex-col items-center gap-1">
              <QRCodeSVG value={eBillUrl(bill.number)} size={64} level="M" />
              <p className="text-[10px]">Scan to view e-bill</p>
            </div>
          )}
          {showMyDhiposQr && (
            <div className="flex flex-col items-center gap-1">
              <QRCodeSVG value={myDhiposUrl(bill.customerId as string)} size={64} level="M" />
              <p className="text-[10px]">Scan to view all your purchases</p>
            </div>
          )}
        </div>
      )}

      {template.footerNote && (
        <p className="mt-3 text-center text-xs italic">{template.footerNote}</p>
      )}
    </div>
  );
}
