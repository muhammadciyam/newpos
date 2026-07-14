import { type Bill } from "@/lib/pos-data";
import { type PrintTemplate } from "@/lib/print-templates-store";
import { useSettings } from "@/lib/settings-store";

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
  const showQr = template.showQrCode && settings.myDhipos.eBillQrEnabled;
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
        <span>{bill.register}</span>
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
                  {(i.price * i.qty * (gstPercent / 100)).toFixed(2)}
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
          <span>GST ({gstPercent}%)</span>
          <span>
            {currency} {bill.gst.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>
            {currency} {bill.total.toFixed(2)}
          </span>
        </div>
      </div>

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

      {showQr && (
        <div className="mt-3 flex flex-col items-center gap-1">
          <div className="grid h-16 w-16 grid-cols-4 grid-rows-4 gap-0.5 border border-black/40 p-1">
            {Array.from({ length: 16 }).map((_, idx) => (
              <div key={idx} className={idx % 3 === 0 ? "bg-black" : "bg-transparent"} />
            ))}
          </div>
          <p className="text-[10px]">Scan to view e-bill</p>
        </div>
      )}

      {template.footerNote && (
        <p className="mt-3 text-center text-xs italic">{template.footerNote}</p>
      )}
    </div>
  );
}
