import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { fetchCustomerPortal } from "@/lib/customer-portal-api";
import type { Bill } from "@/lib/pos-data";
import { useSettings } from "@/lib/settings-store";

// Public — no AppShell, no login required. This is what the second QR code on a printed
// receipt links to (see receipt.tsx) when My Dhipos is enabled (Settings > My Dhipos), so it
// must be reachable by a customer's phone with no session — same trust model as e-bill.$number.
export const Route = createFileRoute("/my-dhipos/$customerId")({
  head: () => ({ meta: [{ title: "My Purchases - Dhipos" }] }),
  component: MyDhiposPage,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; customer: { name: string; mobile: string; loyalty: number }; bills: Bill[] };

// Sum of what's actually still owed on a bill — `total` stays the original sale amount even
// after one or more partial payments (see CreditPayment), same helper as
// customer-sales-dialog.tsx uses for the admin-side view of this same math.
function remainingOf(b: Bill): number {
  const paid = (b.payments ?? []).reduce((s, p) => s + p.amount, 0);
  return Math.max(0, b.total - paid);
}

function billSeq(number: string): number {
  const seq = parseInt(number.split("/")[1] ?? "0", 10);
  return Number.isFinite(seq) ? seq : 0;
}

const STATUS_STYLES: Record<Bill["status"], string> = {
  Sale: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  Void: "bg-muted text-muted-foreground hover:bg-muted",
  Refunded: "bg-muted text-muted-foreground hover:bg-muted",
  "Partially Refunded": "bg-amber-100 text-amber-700 hover:bg-amber-100",
};

function MyDhiposPage() {
  const { customerId } = Route.useParams();
  const settings = useSettings();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchCustomerPortal({ data: { customerId } })
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setState({ status: "error", message: result.error ?? "Customer not found" });
        } else {
          setState({ status: "ready", customer: result.customer, bills: result.bills });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: "error", message: "Couldn't reach the server — try again." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="mx-auto w-full max-w-2xl py-8">
        <h1 className="text-center text-xl font-bold text-foreground">My Purchases</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Every bill linked to your account, in one place.
        </p>

        {state.status === "loading" && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading...</p>
        )}
        {state.status === "error" && (
          <p className="py-16 text-center text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "ready" && (
          <MyDhiposContent
            customer={state.customer}
            bills={state.bills}
            currency={settings.general.currency}
          />
        )}
      </div>
    </div>
  );
}

function MyDhiposContent({
  customer,
  bills,
  currency,
}: {
  customer: { name: string; mobile: string; loyalty: number };
  bills: Bill[];
  currency: string;
}) {
  const sorted = [...bills].sort((a, b) => billSeq(b.number) - billSeq(a.number));
  const totalSpent = bills.filter((b) => b.status !== "Void").reduce((s, b) => s + b.total, 0);
  const outstanding = bills
    .filter((b) => b.status === "Sale" && b.paymentStatus === "Pending")
    .reduce((s, b) => s + remainingOf(b), 0);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-lg font-semibold text-foreground">{customer.name}</p>
        <p className="text-sm text-muted-foreground">{customer.mobile}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs uppercase text-muted-foreground">Total Spent</p>
          <p className="mt-1 text-lg font-bold text-foreground">
            {currency} {totalSpent.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs uppercase text-muted-foreground">Pending Payment</p>
          <p
            className={`mt-1 text-lg font-bold ${outstanding > 0 ? "text-destructive" : "text-foreground"}`}
          >
            {currency} {outstanding.toFixed(2)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-xs uppercase text-muted-foreground">Loyalty Points</p>
          <p className="mt-1 text-lg font-bold text-foreground">{customer.loyalty}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {sorted.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Bill</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((b) => (
                <tr key={b.number}>
                  <td className="px-3 py-2 font-medium text-foreground">{b.number}</td>
                  <td className="px-3 py-2 text-muted-foreground">{b.created}</td>
                  <td className="px-3 py-2 text-muted-foreground">{b.location}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge className={STATUS_STYLES[b.status]}>{b.status}</Badge>
                      {b.paymentStatus === "Pending" && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                          {remainingOf(b).toFixed(2)} due
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {b.total.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to="/e-bill/$number"
                      params={{ number: b.number }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
