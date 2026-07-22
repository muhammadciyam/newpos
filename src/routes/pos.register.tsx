import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Download, Calculator, ShieldAlert } from "lucide-react";
import { cashTypes, denominationsForKey } from "@/lib/pos-data";
import {
  useRegister,
  useRegisterPolling,
  registerStore,
  formatDuration,
  registerDisplayName,
  type RegisterName,
} from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";
import { getTabId } from "@/lib/device-id";
import { CountMoneyDialog } from "@/components/count-money-dialog";
import { useBills } from "@/lib/bills-store";
import { computeSessionSales } from "@/lib/register-session-stats";
import type { RegisterSessionClosing } from "@/lib/pos-data";
import { flushHeldBill, useHeldTabsPreview } from "@/lib/sale-tabs-store";
import { useOutlets } from "@/lib/outlets-store";

// Maps the Open Register dialog's fields to the cashTypes rows shown in the Info/Close tables.
const openingKeyForCashType: Record<string, string> = {
  cash: "mvr",
  "bank-transfer": "bank",
  card: "card",
  "cash-usd": "usd",
  "cash-usd-1": "usd1",
  "cash-usd-20": "usd20",
};

const countMoneyTitles: Record<string, string> = {
  mvr: "MVR",
  usd: "USD",
  usd1: "USD $1",
  usd20: "USD $20",
  cash: "MVR",
  "cash-usd": "USD",
  "cash-usd-1": "USD $1",
  "cash-usd-20": "USD $20",
};

export const Route = createFileRoute("/pos/register")({
  head: () => ({
    meta: [{ title: "Register — Dhipos" }],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const register = useRegister();
  const currentUser = useCurrentUser();
  const isAdmin = currentUser?.role === "Admin" || currentUser?.role === "Super Admin";
  useRegisterPolling();
  const outlets = useOutlets();
  const allowedRegisters = useMemo(
    () =>
      currentUser?.role === "Cashier" && currentUser.authorizedRegister
        ? [currentUser.authorizedRegister]
        : (Object.keys(register.registers) as RegisterName[]),
    [currentUser, register.registers],
  );
  // Grouped by outlet so Super Admin's cross-outlet view never lumps two outlets'
  // registers under one misleading heading — each outlet gets its own clearly labeled
  // section. Everyone else only ever has one group here anyway (their own outlet).
  const registerGroups = useMemo(() => {
    const map = new Map<string, RegisterName[]>();
    for (const name of allowedRegisters) {
      const r = register.registers[name];
      if (!r) continue;
      const key = r.outletId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(name);
    }
    return [...map.entries()]
      .map(([outletId, names]) => ({
        outletId,
        outletName: outlets.find((o) => o.id === outletId)?.name ?? register.storeName,
        names,
      }))
      .sort((a, b) => a.outletName.localeCompare(b.outletName));
  }, [allowedRegisters, register.registers, outlets, register.storeName]);
  const [openingFor, setOpeningFor] = useState<RegisterName | null>(null);
  const [forceClosingFor, setForceClosingFor] = useState<RegisterName | null>(null);
  const [closing, setClosing] = useState(false);
  const [closingValues, setClosingValues] = useState<Record<string, string>>({});
  const [countMoneyKey, setCountMoneyKey] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [opening, setOpening] = useState<Record<string, string>>({
    mvr: "0",
    usd: "0",
    usd1: "0",
    usd20: "0",
    card: "0",
    bank: "0",
  });
  const [pending, setPending] = useState(false);

  const bills = useBills();
  const saleTabsState = useHeldTabsPreview();
  const heldTabs = saleTabsState.tabs.filter((t) => t.items.length > 0);
  const heldItemsCount = heldTabs.reduce(
    (n, t) => n + t.items.reduce((sum, i) => sum + i.qty, 0),
    0,
  );
  const currentRecord = register.register ? register.registers[register.register] : undefined;
  const sessionOpeningAmounts: Record<string, string> = currentRecord?.opening ?? {};
  const sessionStats = register.register
    ? computeSessionSales(bills, register.register, register.openedAt)
    : computeSessionSales([], "", null);

  function salesForCashType(key: string): number {
    if (key === "cash") return sessionStats.cashSales;
    if (key === "card") return sessionStats.cardSales;
    if (key === "bank-transfer") return sessionStats.bankSales;
    return 0;
  }

  function openingForCashType(key: string): number {
    const openingKey = openingKeyForCashType[key];
    return parseFloat(sessionOpeningAmounts[openingKey] ?? "0") || 0;
  }

  function expectedForCashType(key: string): number {
    return openingForCashType(key) + salesForCashType(key);
  }

  function countedForCashType(key: string): number {
    return parseFloat(closingValues[key] ?? "0") || 0;
  }

  const totalOpening = cashTypes.reduce((sum, c) => sum + openingForCashType(c.key), 0);
  const totalExpected = cashTypes.reduce((sum, c) => sum + expectedForCashType(c.key), 0);
  const totalCounted = cashTypes.reduce((sum, c) => sum + countedForCashType(c.key), 0);
  const totalShort = cashTypes.reduce((sum, c) => {
    const diff = countedForCashType(c.key) - expectedForCashType(c.key);
    return diff < 0 ? sum + -diff : sum;
  }, 0);
  const totalOver = cashTypes.reduce((sum, c) => {
    const diff = countedForCashType(c.key) - expectedForCashType(c.key);
    return diff > 0 ? sum + diff : sum;
  }, 0);

  // Notice when this device's open register was closed from elsewhere (a remote
  // Close or an Admin's Force Close) without any action taken here.
  const prevRegisterRef = useRef(register.register);
  useEffect(() => {
    if (prevRegisterRef.current && !register.register) {
      toast("Register was closed remotely.");
    }
    prevRegisterRef.current = register.register;
  }, [register.register]);

  async function forceClose(name: RegisterName) {
    setPending(true);
    const result = await registerStore.forceClose(name);
    setPending(false);
    setForceClosingFor(null);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`${registerDisplayName(register.registers, name)} force-closed`);
  }

  if (!register.register) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Choose a Register to open</h1>
              <p className="text-sm text-muted-foreground">
                Choose the register to open to start making sales
              </p>
            </div>
          </div>
          {registerGroups.map((group) => (
            <div key={group.outletId} className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">{group.outletName}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.names.map((name) => {
                  const r = register.registers[name];
                  if (!r) return null;
                  const mine = r.openedByDeviceId === getTabId();
                  return (
                    <div key={name} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold text-foreground">{r.displayName}</p>
                        <Badge
                          className={
                            r.isOpen
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-destructive/10 text-destructive"
                          }
                          variant="outline"
                        >
                          {r.isOpen ? "Open" : "Close"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {r.isOpen && r.openedAt
                          ? `Opened ${formatDuration(Date.now() - r.openedAt)}${r.openedBy ? ` by ${r.openedBy}` : ""}`
                          : r.lastClosedAt
                            ? `Last Closed ${formatDuration(Date.now() - r.lastClosedAt)}`
                            : "Never opened"}
                      </p>
                      {r.isOpen && !mine && (
                        <p className="mt-1 text-xs text-destructive">
                          In use on another device — ask them to close it, or an Admin can
                          force-close it.
                        </p>
                      )}
                      <div className="mt-4 flex gap-2">
                        {r.isOpen ? (
                          <>
                            {mine && (
                              <Button variant="outline" onClick={() => registerStore.view(name)}>
                                View Register
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="outline"
                                className="gap-1.5 text-destructive"
                                onClick={() => setForceClosingFor(name)}
                              >
                                <ShieldAlert className="h-4 w-4" /> Force Close
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button onClick={() => setOpeningFor(name)}>Open Register</Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={!!openingFor} onOpenChange={(v) => !v && setOpeningFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Register {registerDisplayName(register.registers, openingFor)} at{" "}
                {register.storeName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {[
                ["mvr", "Opening Cash Amount (MVR)"],
                ["usd", "Opening Cash Amount (USD)"],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label className="text-sm text-foreground">
                    <span className="text-destructive">*</span> {label}
                  </label>
                  <div className="flex w-40 gap-1">
                    <Input
                      value={opening[key]}
                      onChange={(e) => setOpening((o) => ({ ...o, [key]: e.target.value }))}
                    />
                    <Button
                      size="icon"
                      variant="default"
                      className="shrink-0"
                      type="button"
                      onClick={() => setCountMoneyKey(key)}
                    >
                      <Calculator className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">
                  <span className="text-destructive">*</span> Opening Card Amount
                </label>
                <Input
                  className="w-40"
                  value={opening.card}
                  onChange={(e) => setOpening((o) => ({ ...o, card: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm text-foreground">
                  <span className="text-destructive">*</span> Opening Bank Transfer Amount
                </label>
                <Input
                  className="w-40"
                  value={opening.bank}
                  onChange={(e) => setOpening((o) => ({ ...o, bank: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpeningFor(null)}>
                Cancel
              </Button>
              <Button
                disabled={pending}
                onClick={async () => {
                  if (!openingFor) return;
                  setPending(true);
                  const result = await registerStore.open(openingFor, undefined, opening);
                  setPending(false);
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(
                    `${registerDisplayName(register.registers, openingFor)} register opened`,
                  );
                  setOpeningFor(null);
                }}
              >
                Open Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!forceClosingFor} onOpenChange={(v) => !v && setForceClosingFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Force Close {registerDisplayName(register.registers, forceClosingFor)}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This closes the register regardless of who opened it — use this if it was left open on
              a device that's no longer reachable. The current session there will be closed out.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForceClosingFor(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => forceClosingFor && forceClose(forceClosingFor)}
              >
                Force Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CountMoneyDialog
          open={!!countMoneyKey}
          onOpenChange={(v) => !v && setCountMoneyKey(null)}
          title={countMoneyKey ? countMoneyTitles[countMoneyKey] : ""}
          denominations={countMoneyKey ? denominationsForKey(countMoneyKey) : []}
          onApply={(total) => {
            if (!countMoneyKey) return;
            setOpening((o) => ({ ...o, [countMoneyKey]: total.toFixed(2) }));
          }}
        />
      </AppShell>
    );
  }

  const openedAgo = register.openedAt ? Date.now() - register.openedAt : 0;

  if (closing) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <h1 className="text-2xl font-bold text-foreground">Session 2285</h1>
          <p className="text-sm text-muted-foreground">
            {registerDisplayName(register.registers, register.register)} at {register.storeName}
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5" /> Calculated a few seconds ago
                </span>
                <Button variant="outline" onClick={() => setClosingValues({})}>
                  Reset Closing
                </Button>
                <Button variant="outline" size="icon" disabled>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Closing</TableHead>
                    <TableHead>Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashTypes.map((c) => {
                    const closingVal = parseFloat(closingValues[c.key] ?? "0") || 0;
                    const expectedVal = expectedForCashType(c.key);
                    const diff = closingVal - expectedVal;
                    return (
                      <TableRow key={c.key}>
                        <TableCell className="text-primary">{c.label}</TableCell>
                        <TableCell>
                          {expectedVal.toFixed(2)}{" "}
                          {c.currency && (
                            <span className="block text-xs text-muted-foreground">
                              {c.currency}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex w-32 gap-1">
                            <Input
                              value={closingValues[c.key] ?? "0"}
                              onChange={(e) =>
                                setClosingValues((v) => ({ ...v, [c.key]: e.target.value }))
                              }
                            />
                            {(c.key === "cash" || c.key.startsWith("cash-")) && (
                              <Button
                                size="icon"
                                className="shrink-0"
                                type="button"
                                onClick={() => setCountMoneyKey(c.key)}
                              >
                                <Calculator className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={diff < 0 ? "text-destructive" : "text-emerald-600"}>
                          {diff.toFixed(2)}
                          {diff < 0 && (
                            <span className="block text-xs text-destructive">Short</span>
                          )}
                          {diff > 0 && (
                            <span className="block text-xs text-muted-foreground">Over</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Textarea
                placeholder="Enter a note"
                className="mt-4"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <p className="mt-2 text-right text-sm text-muted-foreground">
                {sessionStats.creditBillCount} credit bill
                {sessionStats.creditBillCount === 1 ? "" : "s"} pending payment
              </p>
              {heldTabs.length > 0 && (
                <p className="mt-1 text-right text-sm text-muted-foreground">
                  {heldTabs.length} held sale{heldTabs.length === 1 ? "" : "s"} ({heldItemsCount}{" "}
                  item{heldItemsCount === 1 ? "" : "s"}) will be saved and restored the next time
                  this register is opened.
                </p>
              )}
              <Button
                className="mt-3 w-full"
                size="lg"
                disabled={pending}
                onClick={async () => {
                  if (!register.register) return;
                  await flushHeldBill(register.register);
                  const expected: Record<string, number> = {};
                  const counted: Record<string, number> = {};
                  const difference: Record<string, number> = {};
                  let shortAmount = 0;
                  for (const c of cashTypes) {
                    const expectedVal = expectedForCashType(c.key);
                    const closingVal = parseFloat(closingValues[c.key] ?? "0") || 0;
                    const diff = closingVal - expectedVal;
                    expected[c.key] = expectedVal;
                    counted[c.key] = closingVal;
                    difference[c.key] = diff;
                    if (diff < 0) shortAmount += -diff;
                  }
                  const closingSummary: RegisterSessionClosing = {
                    expected,
                    counted,
                    difference,
                    totalExpected,
                    totalCounted,
                    shortAmount,
                    salesAmount: sessionStats.salesAmount,
                    cashSales: sessionStats.cashSales,
                    cardSales: sessionStats.cardSales,
                    bankSales: sessionStats.bankSales,
                    creditAmount: sessionStats.creditAmount,
                    billCount: sessionStats.billCount,
                    cashBillCount: sessionStats.cashBillCount,
                    cardBillCount: sessionStats.cardBillCount,
                    bankBillCount: sessionStats.bankBillCount,
                    creditBillCount: sessionStats.creditBillCount,
                    itemsSold: sessionStats.itemsSold,
                    refundAmount: sessionStats.refundAmount,
                    voidCount: sessionStats.voidCount,
                    openingTotal: totalOpening,
                    note,
                  };
                  setPending(true);
                  const result = await registerStore.close(register.register, closingSummary);
                  setPending(false);
                  if ("error" in result) {
                    toast.error(result.error);
                    return;
                  }
                  setClosing(false);
                  setNote("");
                  setClosingValues({});
                  toast.success("Register closed");
                }}
              >
                Close Register
              </Button>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                <p className="font-semibold">Register is open</p>
                <p>
                  Register was opened {formatDuration(openedAgo)} by {register.openedBy}
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Sales Summary
                </p>
                <div className="space-y-2 text-sm">
                  <Row
                    label="Sales Amount"
                    value={sessionStats.salesAmount.toFixed(2)}
                    sub={`${sessionStats.billCount} bill${sessionStats.billCount === 1 ? "" : "s"} · ${sessionStats.itemsSold} item${sessionStats.itemsSold === 1 ? "" : "s"} sold`}
                  />
                  <Row
                    label="Cash Sales"
                    value={sessionStats.cashSales.toFixed(2)}
                    sub={`${sessionStats.cashBillCount} bill${sessionStats.cashBillCount === 1 ? "" : "s"}`}
                  />
                  <Row
                    label="Card Sales"
                    value={sessionStats.cardSales.toFixed(2)}
                    sub={`${sessionStats.cardBillCount} bill${sessionStats.cardBillCount === 1 ? "" : "s"}`}
                  />
                  <Row
                    label="Bank Transfer Sales"
                    value={sessionStats.bankSales.toFixed(2)}
                    sub={`${sessionStats.bankBillCount} bill${sessionStats.bankBillCount === 1 ? "" : "s"}`}
                  />
                  <Row
                    label="Credit Amount"
                    value={sessionStats.creditAmount.toFixed(2)}
                    sub={`${sessionStats.creditBillCount} credit bill${sessionStats.creditBillCount === 1 ? "" : "s"} pending`}
                  />
                  {sessionStats.refundAmount > 0 && (
                    <Row label="Refunded" value={sessionStats.refundAmount.toFixed(2)} />
                  )}
                  {sessionStats.voidCount > 0 && (
                    <Row label="Voided Bills" value={String(sessionStats.voidCount)} />
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Cash Count
                </p>
                <div className="space-y-2 text-sm">
                  <Row label="Opening Float" value={totalOpening.toFixed(2)} />
                  <Row label="Total Expected" value={totalExpected.toFixed(2)} />
                  <Row label="Total Counted" value={totalCounted.toFixed(2)} />
                  <Row
                    label="Short Amount"
                    value={totalShort.toFixed(2)}
                    valueClassName={totalShort > 0 ? "text-destructive" : undefined}
                  />
                  {totalOver > 0 && (
                    <Row
                      label="Over Amount"
                      value={totalOver.toFixed(2)}
                      valueClassName="text-emerald-600"
                    />
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Session
                </p>
                <div className="space-y-2 text-sm">
                  <Row
                    label="Opened"
                    value={new Date(register.openedAt!).toLocaleString()}
                    sub={`By ${register.openedBy}`}
                  />
                  <Row label="Closed" value="Not yet closed" />
                  <Row label="Duration" value={formatDuration(openedAgo)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <CountMoneyDialog
          open={!!countMoneyKey}
          onOpenChange={(v) => !v && setCountMoneyKey(null)}
          title={countMoneyKey ? countMoneyTitles[countMoneyKey] : ""}
          denominations={countMoneyKey ? denominationsForKey(countMoneyKey) : []}
          onApply={(total) => {
            if (!countMoneyKey) return;
            setClosingValues((v) => ({ ...v, [countMoneyKey]: total.toFixed(2) }));
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">Session 2285</h1>
        <p className="text-sm text-muted-foreground">
          {registerDisplayName(register.registers, register.register)} at {register.storeName}
        </p>
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="cash">Cash-In-Out</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <RefreshCw className="h-3.5 w-3.5" /> Calculated a few seconds ago
                  </span>
                  <Button onClick={() => setClosing(true)}>Close Register</Button>
                  <Button variant="outline" size="icon" disabled>
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Opening</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Expected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashTypes.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="text-primary">{c.label}</TableCell>
                        <TableCell>
                          {openingForCashType(c.key).toFixed(2)}
                          {c.currency && (
                            <span className="block text-xs text-muted-foreground">
                              {c.currency}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {salesForCashType(c.key).toFixed(2)}
                          {c.currency && (
                            <span className="block text-xs text-muted-foreground">
                              {c.currency}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {expectedForCashType(c.key).toFixed(2)}
                          {c.currency && (
                            <span className="block text-xs text-muted-foreground">
                              {c.currency}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                  <p className="font-semibold">Register is open</p>
                  <p>
                    Register was opened {formatDuration(openedAgo)} by {register.openedBy}
                  </p>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Sales Summary
                  </p>
                  <div className="space-y-2 text-sm">
                    <Row
                      label="Sales Amount"
                      value={sessionStats.salesAmount.toFixed(2)}
                      sub={`${sessionStats.billCount} bill${sessionStats.billCount === 1 ? "" : "s"} · ${sessionStats.itemsSold} item${sessionStats.itemsSold === 1 ? "" : "s"} sold`}
                    />
                    <Row
                      label="Cash Sales"
                      value={sessionStats.cashSales.toFixed(2)}
                      sub={`${sessionStats.cashBillCount} bill${sessionStats.cashBillCount === 1 ? "" : "s"}`}
                    />
                    <Row
                      label="Card Sales"
                      value={sessionStats.cardSales.toFixed(2)}
                      sub={`${sessionStats.cardBillCount} bill${sessionStats.cardBillCount === 1 ? "" : "s"}`}
                    />
                    <Row
                      label="Bank Transfer Sales"
                      value={sessionStats.bankSales.toFixed(2)}
                      sub={`${sessionStats.bankBillCount} bill${sessionStats.bankBillCount === 1 ? "" : "s"}`}
                    />
                    <Row
                      label="Credit Amount"
                      value={sessionStats.creditAmount.toFixed(2)}
                      sub={`${sessionStats.creditBillCount} credit bill${sessionStats.creditBillCount === 1 ? "" : "s"} pending`}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Session
                  </p>
                  <div className="space-y-2 text-sm">
                    <Row
                      label="Opened"
                      value={new Date(register.openedAt!).toLocaleString()}
                      sub={`By ${register.openedBy}`}
                    />
                    <Row label="Closed" value="Still open" />
                    <Row label="Duration" value={formatDuration(openedAgo)} />
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="cash">
            <p className="p-6 text-sm text-muted-foreground">No cash-in-out entries yet.</p>
          </TabsContent>
          <TabsContent value="payments">
            {sessionStats.billCount === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No payments recorded for this session yet.
              </p>
            ) : (
              <div className="space-y-2 p-4 text-sm">
                <Row label="Cash" value={sessionStats.cashSales.toFixed(2)} />
                <Row label="Card" value={sessionStats.cardSales.toFixed(2)} />
                <Row label="Bank Transfer" value={sessionStats.bankSales.toFixed(2)} />
                <Row
                  label="Credit"
                  value={sessionStats.creditAmount.toFixed(2)}
                  sub={`${sessionStats.creditBillCount} pending`}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Row({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between border-b border-border pb-2">
      <span className="text-muted-foreground">{label}:</span>
      <div className="text-right">
        <p className={valueClassName ?? "text-foreground"}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
