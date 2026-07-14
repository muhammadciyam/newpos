import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { RefreshCw, Download, Calculator, Plus } from "lucide-react";
import { cashTypes, denominationsForKey } from "@/lib/pos-data";
import { useRegister, registerStore, formatDuration, type RegisterName } from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";
import { useHasPermission } from "@/lib/permissions";
import { CountMoneyDialog } from "@/components/count-money-dialog";

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
  const canManageSettings = useHasPermission("settings.manage");
  const allowedRegisters =
    currentUser?.role === "Cashier" && currentUser.authorizedRegister
      ? [currentUser.authorizedRegister]
      : (Object.keys(register.registers) as RegisterName[]);
  const [openingFor, setOpeningFor] = useState<RegisterName | null>(null);
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
  const [newRegisterOpen, setNewRegisterOpen] = useState(false);
  const [newRegisterName, setNewRegisterName] = useState("");
  const [newRegisterError, setNewRegisterError] = useState("");

  function createRegister() {
    const result = registerStore.createRegister(newRegisterName);
    if ("error" in result) {
      setNewRegisterError(result.error);
      return;
    }
    toast.success(`Register "${newRegisterName.trim()}" created`);
    setNewRegisterName("");
    setNewRegisterError("");
    setNewRegisterOpen(false);
  }

  if (!register.register) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Choose a Register to open</h1>
              <p className="text-sm text-muted-foreground">Choose the register to open to start making sales</p>
            </div>
            {canManageSettings && (
              <Button onClick={() => setNewRegisterOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> New Register
              </Button>
            )}
          </div>
          <h2 className="text-lg font-semibold text-foreground">{register.storeName}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allowedRegisters.map((name) => {
              const r = register.registers[name];
              return (
                <div key={name} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-foreground">{name}</p>
                    <Badge className={r.isOpen ? "bg-emerald-100 text-emerald-700" : "bg-destructive/10 text-destructive"} variant="outline">
                      {r.isOpen ? "Open" : "Close"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {r.isOpen && r.openedAt
                      ? `Opened ${formatDuration(Date.now() - r.openedAt)}`
                      : r.lastClosedAt
                        ? `Last Closed ${formatDuration(Date.now() - r.lastClosedAt)}`
                        : "Never opened"}
                  </p>
                  <div className="mt-4">
                    {r.isOpen ? (
                      <Button variant="outline" onClick={() => registerStore.view(name)}>
                        View Register
                      </Button>
                    ) : (
                      <Button onClick={() => setOpeningFor(name)}>Open Register</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Dialog open={!!openingFor} onOpenChange={(v) => !v && setOpeningFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register {openingFor} at {register.storeName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {[
                ["mvr", "Opening Cash Amount (MVR)"],
                ["usd", "Opening Cash Amount (USD)"],
                ["usd1", "Opening Cash Amount (USD 1)"],
                ["usd20", "Opening Cash Amount (usd 20)"],
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
                onClick={() => {
                  if (openingFor) registerStore.open(openingFor);
                  setOpeningFor(null);
                  toast.success(`${openingFor} register opened`);
                }}
              >
                Open Register
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

        <Dialog
          open={newRegisterOpen}
          onOpenChange={(v) => {
            setNewRegisterOpen(v);
            if (!v) {
              setNewRegisterName("");
              setNewRegisterError("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Register</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Register Name</Label>
              <Input
                value={newRegisterName}
                onChange={(e) => setNewRegisterName(e.target.value)}
                placeholder="e.g. Register 3"
              />
              {newRegisterError && <p className="text-sm text-destructive">{newRegisterError}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRegisterOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!newRegisterName.trim()} onClick={createRegister}>
                Create Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    );
  }

  const openedAgo = register.openedAt ? Date.now() - register.openedAt : 0;

  if (closing) {
    return (
      <AppShell>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <h1 className="text-2xl font-bold text-foreground">Session 2285</h1>
          <p className="text-sm text-muted-foreground">{register.register} at {register.storeName}</p>
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
                    return (
                      <TableRow key={c.key}>
                        <TableCell className="text-primary">{c.label}</TableCell>
                        <TableCell>
                          0.00 {c.currency && <span className="block text-xs text-muted-foreground">{c.currency}</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex w-32 gap-1">
                            <Input
                              value={closingValues[c.key] ?? "0"}
                              onChange={(e) => setClosingValues((v) => ({ ...v, [c.key]: e.target.value }))}
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
                        <TableCell className="text-emerald-600">{closingVal.toFixed(2)}</TableCell>
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
              <p className="mt-2 text-right text-sm text-muted-foreground">1 open bills</p>
              <Button
                className="mt-3 w-full"
                size="lg"
                onClick={() => {
                  registerStore.close(register.register!);
                  setClosing(false);
                  toast.success("Register closed");
                }}
              >
                Close Register
              </Button>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                <p className="font-semibold">Register is open</p>
                <p>Register was opened {formatDuration(openedAgo)} by {register.openedBy}</p>
              </div>
              <div className="space-y-2 text-sm">
                <Row label="Opened" value={new Date(register.openedAt!).toLocaleString()} sub={`By ${register.openedBy}`} />
                <Row label="Closed" value="" />
                <Row label="Duration" value="-" />
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
        <p className="text-sm text-muted-foreground">{register.register} at {register.storeName}</p>
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
                          0.00
                          {c.currency && <span className="block text-xs text-muted-foreground">{c.currency}</span>}
                        </TableCell>
                        <TableCell>
                          0.00
                          {c.currency && <span className="block text-xs text-muted-foreground">{c.currency}</span>}
                        </TableCell>
                        <TableCell>
                          0.00
                          {c.currency && <span className="block text-xs text-muted-foreground">{c.currency}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="space-y-4">
                <div className="rounded-lg bg-primary/10 p-3 text-sm text-primary">
                  <p className="font-semibold">Register is open</p>
                  <p>Register was opened {formatDuration(openedAgo)} by {register.openedBy}</p>
                </div>
                <div className="space-y-2 text-sm">
                  <Row label="Opened" value={new Date(register.openedAt!).toLocaleString()} sub={`By ${register.openedBy}`} />
                  <Row label="Closed" value="" />
                  <Row label="Duration" value="-" />
                </div>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="cash">
            <p className="p-6 text-sm text-muted-foreground">No cash-in-out entries yet.</p>
          </TabsContent>
          <TabsContent value="payments">
            <p className="p-6 text-sm text-muted-foreground">No payments recorded for this session yet.</p>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between border-b border-border pb-2">
      <span className="text-muted-foreground">{label}:</span>
      <div className="text-right">
        <p className="text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
