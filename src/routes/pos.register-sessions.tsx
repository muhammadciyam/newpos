import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useRegisterSessions,
  useRegisterSessionsPolling,
  useRegister,
  registerDisplayName,
} from "@/lib/register-store";
import { useCurrentOutletId } from "@/lib/auth-store";
import { useOutlets } from "@/lib/outlets-store";
import { cashTypes } from "@/lib/pos-data";
import type { RegisterSession } from "@/lib/pos-data";

export const Route = createFileRoute("/pos/register-sessions")({
  head: () => ({
    meta: [{ title: "Register Sessions — Dhipos" }],
  }),
  component: RegisterSessionsPage,
});

function RegisterSessionsPage() {
  const allRegisterSessions = useRegisterSessions();
  useRegisterSessionsPolling();
  const { registers } = useRegister();
  const outlets = useOutlets();
  // The outlet chosen on the login form for this session — unlike the role-based scoping
  // useRegisterSessions() already applies (which leaves Super Admin unrestricted, seeing
  // every outlet combined, same as Bills/Reports/etc.), register sessions are an
  // operational "what happened at this store" log rather than a cross-outlet report, so
  // this page always narrows further to just the outlet currently logged into — for every
  // role, Super Admin included.
  const currentOutletId = useCurrentOutletId();
  const registerSessions = useMemo(
    () =>
      currentOutletId
        ? allRegisterSessions.filter((s) => s.outletId === currentOutletId)
        : allRegisterSessions,
    [allRegisterSessions, currentOutletId],
  );
  const [detailFor, setDetailFor] = useState<RegisterSession | null>(null);

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Register Sessions</h1>
          <p className="text-sm text-muted-foreground">Register sessions for outlet</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No</TableHead>
                <TableHead>Register</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Open Duration</TableHead>
                <TableHead>Sales</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Short</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registerSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    No register sessions yet.
                  </TableCell>
                </TableRow>
              )}
              {registerSessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.no}</TableCell>
                  <TableCell>
                    {registerDisplayName(registers, s.register)}
                    <span className="block text-xs text-muted-foreground">
                      At {outlets.find((o) => o.id === s.outletId)?.name ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.createdAt}
                    <span className="block text-xs text-muted-foreground">By {s.by}</span>
                  </TableCell>
                  <TableCell>
                    {s.closedAt ?? ""}
                    {s.closedAt && (
                      <span className="block text-xs text-muted-foreground">By {s.by}</span>
                    )}
                  </TableCell>
                  <TableCell className={s.closedAt ? "" : "font-medium text-emerald-600"}>
                    {s.openDuration}
                  </TableCell>
                  <TableCell>{s.closing ? s.closing.salesAmount.toFixed(2) : "-"}</TableCell>
                  <TableCell>{s.closing ? s.closing.creditAmount.toFixed(2) : "-"}</TableCell>
                  <TableCell
                    className={s.closing && s.closing.shortAmount > 0 ? "text-destructive" : ""}
                  >
                    {s.closing ? s.closing.shortAmount.toFixed(2) : "-"}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => setDetailFor(s)}>
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!detailFor} onOpenChange={(v) => !v && setDetailFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Session {detailFor?.no} — {registerDisplayName(registers, detailFor?.register)}
            </DialogTitle>
          </DialogHeader>
          {detailFor && (
            <div className="space-y-4 text-sm">
              <div className="space-y-1">
                <p>
                  Opened {detailFor.createdAt} by {detailFor.by}
                </p>
                <p>
                  {detailFor.closedAt ? `Closed ${detailFor.closedAt}` : "Still open"} —{" "}
                  {detailFor.openDuration}
                </p>
              </div>
              {detailFor.closing ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Sales Amount</p>
                      <p className="text-lg font-semibold">
                        {detailFor.closing.salesAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detailFor.closing.billCount} bill
                        {detailFor.closing.billCount === 1 ? "" : "s"} ·{" "}
                        {detailFor.closing.itemsSold} item
                        {detailFor.closing.itemsSold === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Credit Amount</p>
                      <p className="text-lg font-semibold">
                        {detailFor.closing.creditAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detailFor.closing.creditBillCount} credit bill
                        {detailFor.closing.creditBillCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Cash / Card / Bank</p>
                      <p className="text-sm font-medium">
                        {detailFor.closing.cashSales.toFixed(2)} ({detailFor.closing.cashBillCount})
                        / {detailFor.closing.cardSales.toFixed(2)} (
                        {detailFor.closing.cardBillCount}) /{" "}
                        {detailFor.closing.bankSales.toFixed(2)} ({detailFor.closing.bankBillCount})
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Short Amount</p>
                      <p
                        className={
                          detailFor.closing.shortAmount > 0
                            ? "text-lg font-semibold text-destructive"
                            : "text-lg font-semibold text-emerald-600"
                        }
                      >
                        {detailFor.closing.shortAmount.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Opening Float</p>
                      <p className="text-sm font-medium">
                        {detailFor.closing.openingTotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Expected / Counted</p>
                      <p className="text-sm font-medium">
                        {detailFor.closing.totalExpected.toFixed(2)} /{" "}
                        {detailFor.closing.totalCounted.toFixed(2)}
                      </p>
                    </div>
                    {(detailFor.closing.refundAmount > 0 || detailFor.closing.voidCount > 0) && (
                      <div className="col-span-2 rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Refunds / Voids</p>
                        <p className="text-sm font-medium">
                          {detailFor.closing.refundAmount.toFixed(2)} refunded ·{" "}
                          {detailFor.closing.voidCount} voided bill
                          {detailFor.closing.voidCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Expected</TableHead>
                          <TableHead>Counted</TableHead>
                          <TableHead>Difference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashTypes.map((c) => {
                          const diff = detailFor.closing?.difference[c.key] ?? 0;
                          return (
                            <TableRow key={c.key}>
                              <TableCell className="text-primary">{c.label}</TableCell>
                              <TableCell>
                                {(detailFor.closing?.expected[c.key] ?? 0).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                {(detailFor.closing?.counted[c.key] ?? 0).toFixed(2)}
                              </TableCell>
                              <TableCell
                                className={diff < 0 ? "text-destructive" : "text-emerald-600"}
                              >
                                {diff.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {detailFor.closing.note && (
                    <p className="rounded-lg bg-muted p-2 text-muted-foreground">
                      Note: {detailFor.closing.note}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  No closing detail recorded for this session.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
