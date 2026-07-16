import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Receipt } from "@/components/receipt";
import { printTemplatesStore, type PrintTemplateId } from "@/lib/print-templates-store";
import { fetchBillByNumber } from "@/lib/bills-api";
import type { Bill } from "@/lib/pos-data";

// Public — no AppShell, no login required. This is what the QR code on a printed
// receipt links to, so it must be reachable by a customer's phone with no session.
export const Route = createFileRoute("/e-bill/$number")({
  head: () => ({ meta: [{ title: "E-Bill - Dhipos" }] }),
  component: EBillPage,
});

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; bill: Bill };

function EBillPage() {
  const { number } = Route.useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchBillByNumber({ data: { number } })
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setState({ status: "error", message: result.error ?? "Bill not found" });
        } else {
          setState({ status: "ready", bill: result.bill });
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
  }, [number]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        {state.status === "loading" && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading bill...</p>
        )}
        {state.status === "error" && (
          <p className="py-16 text-center text-sm text-destructive">{state.message}</p>
        )}
        {state.status === "ready" && (
          <Receipt
            bill={state.bill}
            // Force the QR code off here — no need for a QR that links to the page it's
            // already on, and the customer viewing this has no local template settings.
            template={{
              ...printTemplatesStore.getTemplate(
                state.bill.printTemplateId as PrintTemplateId | undefined,
              ),
              showQrCode: false,
            }}
            storeName={state.bill.location}
          />
        )}
      </div>
    </div>
  );
}
