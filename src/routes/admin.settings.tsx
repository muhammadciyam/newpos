import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cashDenominations } from "@/lib/pos-data";
import { listTimezones, detectDeviceTimezone } from "@/lib/timezones";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";
import {
  useSettings,
  settingsStore,
  type AppSettings,
  type PaymentMethodConfig,
  type WebhookConfig,
  type CustomTaxConfig,
  type DiscountPresetConfig,
} from "@/lib/settings-store";
import {
  printTemplates,
  printTemplatesStore,
  usePrintSettings,
  type PrintTemplateId,
} from "@/lib/print-templates-store";

// Lets other pages deep-link straight to a tab, e.g. /admin/settings?tab=Tax — used by
// the Taxes sidebar entry, which redirects here rather than duplicating a second,
// out-of-sync tax UI (see admin.taxes.tsx).
const validateSearch = (search: Record<string, unknown>): { tab?: string } => ({
  tab: typeof search.tab === "string" ? search.tab : undefined,
});

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Dhipos" }],
  }),
  validateSearch,
  component: SettingsPage,
});

const tabs = [
  "Modules",
  "General",
  "Numbering",
  "Sales",
  "Payments",
  "My Dhipos",
  "Product",
  "Customer",
  "Transfer",
  "Purchases",
  "Restaurant",
  "Inventory",
  "Discounts",
  "Tax",
  "Service Fees",
  "Printing",
  "Local Data",
  "Developers",
];

// The stable identity of a payment method row — its `key` when it's one of the built-ins,
// otherwise its (unique) name for custom methods that never got a key.
function methodId(m: PaymentMethodConfig): string {
  return m.key ?? m.name;
}

function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 border-b border-border py-5 last:border-0 sm:grid-cols-[1fr_320px]">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// A real, persisted Yes/No select bound to a boolean setting.
function BoolSelect({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <Select value={value ? "yes" : "no"} onValueChange={(v) => onChange(v === "yes")}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">{yesLabel}</SelectItem>
        <SelectItem value="no">{noLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SettingsPage() {
  const canManage = useHasPermission("settings.manage");
  const settings = useSettings();
  const printSettings = usePrintSettings();
  const { tab: initialTab } = Route.useSearch();
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : "Modules");
  const [draft, setDraft] = useState<AppSettings>(settings);

  const [editingFormatType, setEditingFormatType] = useState<string | null>(null);
  const [formatDraft, setFormatDraft] = useState("");

  const [editingMethod, setEditingMethod] = useState<PaymentMethodConfig | null>(null);
  const [methodDraft, setMethodDraft] = useState<PaymentMethodConfig>({
    name: "",
    type: "manual",
    details: "",
  });
  const [addMethodOpen, setAddMethodOpen] = useState(false);

  const [addWebhookOpen, setAddWebhookOpen] = useState(false);
  const [webhookDraft, setWebhookDraft] = useState({
    url: "",
    event: "bill.created",
    authHeader: "",
  });

  const [editingTax, setEditingTax] = useState<CustomTaxConfig | null>(null);
  const [addTaxOpen, setAddTaxOpen] = useState(false);
  const [taxDraft, setTaxDraft] = useState({
    name: "",
    type: "percent" as "percent" | "unit",
    value: "",
  });

  const [editingDiscount, setEditingDiscount] = useState<DiscountPresetConfig | null>(null);
  const [addDiscountOpen, setAddDiscountOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState({
    name: "",
    type: "percent" as "percent" | "amount",
    value: "",
  });

  const timezoneOptions = useMemo(() => listTimezones(), []);

  // Auto-detects this device's OS-level timezone once per visit to this page and, if it
  // doesn't match what's saved, corrects it automatically (both the draft shown here and the
  // saved setting itself) — this field is a display-only label used to format dates/the
  // header clock, not anything financial, so there's no real downside to trusting the
  // device's own clock over a manually-picked value that may have gone stale.
  useEffect(() => {
    if (!canManage) return;
    const detected = detectDeviceTimezone();
    if (detected === settings.general.timezone) return;
    setDraft((d) => ({ ...d, general: { ...d.general, timezone: detected } }));
    settingsStore.updateSection("general", { timezone: detected });
    toast.info(`Timezone auto-detected as ${detected} and updated`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canManage) return <RestrictedPage />;

  function saveSection<K extends keyof AppSettings>(section: K) {
    settingsStore.updateSection(section, draft[section]);
    toast.success(`${String(section)} settings updated`);
  }

  function handleLogoFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 30 * 1024) {
      toast.error("Logo must be 30kb or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((d) => ({ ...d, general: { ...d.general, companyLogo: reader.result as string } }));
    };
    reader.readAsDataURL(file);
  }

  function saveFormatEdit() {
    if (!editingFormatType) return;
    settingsStore.updateSection("numbering", {
      formats: settings.numbering.formats.map((f) =>
        f.type === editingFormatType ? { ...f, format: formatDraft } : f,
      ),
    });
    toast.success(`${editingFormatType} number format updated`);
    setEditingFormatType(null);
  }

  function openEditMethod(m: PaymentMethodConfig) {
    setEditingMethod(m);
    setMethodDraft(m);
  }

  function saveMethodEdit() {
    if (!editingMethod) return;
    settingsStore.updateSection("payments", {
      methods: settings.payments.methods.map((m) =>
        methodId(m) === methodId(editingMethod) ? { ...methodDraft, key: m.key } : m,
      ),
    });
    toast.success(`${methodDraft.name} payment method updated`);
    setEditingMethod(null);
  }

  function deleteMethod(id: string) {
    settingsStore.updateSection("payments", {
      methods: settings.payments.methods.filter((m) => methodId(m) !== id),
    });
    toast.success("Payment method removed");
  }

  function addMethod() {
    if (!methodDraft.name.trim()) return;
    settingsStore.updateSection("payments", {
      methods: [...settings.payments.methods, methodDraft],
    });
    toast.success(`${methodDraft.name} payment method added`);
    setAddMethodOpen(false);
    setMethodDraft({ name: "", type: "manual", details: "" });
  }

  function addWebhook() {
    if (!webhookDraft.url.trim()) return;
    const hook: WebhookConfig = {
      id: crypto.randomUUID(),
      url: webhookDraft.url.trim(),
      event: webhookDraft.event,
      authHeader: webhookDraft.authHeader.trim(),
      active: true,
    };
    settingsStore.updateSection("webhooks", { hooks: [...settings.webhooks.hooks, hook] });
    toast.success("Webhook added");
    setAddWebhookOpen(false);
    setWebhookDraft({ url: "", event: "bill.created", authHeader: "" });
  }

  function removeWebhook(id: string) {
    settingsStore.updateSection("webhooks", {
      hooks: settings.webhooks.hooks.filter((h) => h.id !== id),
    });
    toast.success("Webhook removed");
  }

  function addTax() {
    const value = parseFloat(taxDraft.value);
    if (!taxDraft.name.trim() || !Number.isFinite(value) || value < 0) return;
    const tax: CustomTaxConfig = {
      id: crypto.randomUUID(),
      name: taxDraft.name.trim(),
      type: taxDraft.type,
      value,
    };
    settingsStore.updateSection("tax", { customTaxes: [...settings.tax.customTaxes, tax] });
    toast.success(`${tax.name} tax added`);
    setAddTaxOpen(false);
    setTaxDraft({ name: "", type: "percent", value: "" });
  }

  function saveTaxEdit() {
    if (!editingTax) return;
    const value = parseFloat(taxDraft.value);
    if (!taxDraft.name.trim() || !Number.isFinite(value) || value < 0) return;
    settingsStore.updateSection("tax", {
      customTaxes: settings.tax.customTaxes.map((t) =>
        t.id === editingTax.id
          ? { ...t, name: taxDraft.name.trim(), type: taxDraft.type, value }
          : t,
      ),
    });
    toast.success(`${taxDraft.name.trim()} tax updated`);
    setEditingTax(null);
  }

  function removeTax(id: string) {
    settingsStore.updateSection("tax", {
      customTaxes: settings.tax.customTaxes.filter((t) => t.id !== id),
    });
    toast.success("Tax removed");
  }

  function addDiscountPreset() {
    const value = parseFloat(discountDraft.value);
    if (!discountDraft.name.trim() || !Number.isFinite(value) || value < 0) return;
    const preset: DiscountPresetConfig = {
      id: crypto.randomUUID(),
      name: discountDraft.name.trim(),
      type: discountDraft.type,
      value,
    };
    settingsStore.updateSection("discounts", {
      presets: [...settings.discounts.presets, preset],
    });
    toast.success(`${preset.name} discount added`);
    setAddDiscountOpen(false);
    setDiscountDraft({ name: "", type: "percent", value: "" });
  }

  function saveDiscountEdit() {
    if (!editingDiscount) return;
    const value = parseFloat(discountDraft.value);
    if (!discountDraft.name.trim() || !Number.isFinite(value) || value < 0) return;
    settingsStore.updateSection("discounts", {
      presets: settings.discounts.presets.map((p) =>
        p.id === editingDiscount.id
          ? { ...p, name: discountDraft.name.trim(), type: discountDraft.type, value }
          : p,
      ),
    });
    toast.success(`${discountDraft.name.trim()} discount updated`);
    setEditingDiscount(null);
  }

  function removeDiscountPreset(id: string) {
    settingsStore.updateSection("discounts", {
      presets: settings.discounts.presets.filter((p) => p.id !== id),
    });
    toast.success("Discount removed");
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6 lg:flex-row">
        <div className="flex gap-1 overflow-x-auto lg:w-48 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap border-l-2 px-3 py-2 text-left text-sm ${
                tab === t
                  ? "border-primary font-medium text-primary"
                  : "border-transparent text-foreground hover:text-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1">
          {tab === "Modules" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Modules</p>
              <p className="text-sm text-muted-foreground">
                Dhipos is module based so you can easily pick and choose only the modules you need.
                These three are required by the rest of the app (Sell, Register, Inventory, and
                Reports all depend on them), so they're always on rather than a toggle that would
                silently break other pages if switched off.
              </p>
              <div className="mt-4 space-y-6">
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Base Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Catalogue Management</li>
                    </ul>
                  </div>
                  <Switch checked disabled title="Required — always enabled" />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Point of Sale Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Allows you to make sales and manage registers at outlets</li>
                      <li>Allows you to manage Gift Cards and redeem them at outlets</li>
                    </ul>
                  </div>
                  <Switch checked disabled title="Required — always enabled" />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Inventory Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Allows you to manage inventory of your stock items</li>
                      <li>Allows you to create Purchase Orders and manage Suppliers</li>
                      <li>
                        Allows you to create Transfer Requests, and transfer inventory between
                        locations
                      </li>
                    </ul>
                  </div>
                  <Switch checked disabled title="Required — always enabled" />
                </div>
              </div>
            </Card>
          )}

          {tab === "General" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">General Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Currency"
                  desc="The company currency code to be used through out the system. Eg: $, MVR"
                >
                  <Input
                    value={draft.general.currency}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        general: { ...d.general, currency: e.target.value },
                      }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Timezone"
                  desc={`Timezone your shop is set up at. By default all dates will be shown in this timezone. Auto-detected from this device as ${detectDeviceTimezone()} — kept in sync automatically.`}
                >
                  <Select
                    value={draft.general.timezone}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, general: { ...d.general, timezone: v } }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {timezoneOptions.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  label="Unique Customer Mobile Numbers?"
                  desc="Validate customer mobile numbers to be unique?"
                >
                  <BoolSelect
                    value={draft.general.uniqueCustomerMobile}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        general: { ...d.general, uniqueCustomerMobile: v },
                      }))
                    }
                    yesLabel="Yes, Unique"
                    noLabel="No, Allow Duplicates"
                  />
                </SettingRow>
                <SettingRow
                  label="Optimise loading of bill history?"
                  desc="To load bill history faster, simple page navigation will be served."
                >
                  <BoolSelect
                    value={draft.general.optimizeBillHistoryLoading}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        general: { ...d.general, optimizeBillHistoryLoading: v },
                      }))
                    }
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
                <SettingRow
                  label="SMS ShortCode?"
                  desc="SMS sent to your customers will be send from this name. Must only contain capital letters (A-Z) and numbers. No spaces and must be less than 11 characters"
                >
                  <Input
                    value={draft.general.smsShortCode}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        general: { ...d.general, smsShortCode: e.target.value },
                      }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Company Logo"
                  desc="Upload a PNG logo file (maximum 30kb) which will be the default logo printed on generated documents."
                >
                  <div className="flex items-center gap-3">
                    {draft.general.companyLogo && (
                      <img
                        src={draft.general.companyLogo}
                        alt="Company logo"
                        className="h-10 w-10 rounded border border-border object-contain"
                      />
                    )}
                    <Input
                      type="file"
                      accept="image/png"
                      onChange={(e) => handleLogoFile(e.target.files?.[0])}
                    />
                  </div>
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("general")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Numbering" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Number Formats</p>
              <p className="text-sm text-muted-foreground">
                You can configure different formats for numbers generated throughout the
                application.
              </p>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number Type</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.numbering.formats.map((f) => (
                      <TableRow key={f.type}>
                        <TableCell className="font-medium">{f.type}</TableCell>
                        <TableCell className="font-mono text-sm">{f.format}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingFormatType(f.type);
                              setFormatDraft(f.format);
                            }}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === "Sales" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Sales Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Company Sales Email"
                  desc="Quotations, Sales Receipts sent to customers will be cc'd to this email. This email will also be set as the Reply-To email address"
                >
                  <Input
                    type="email"
                    placeholder="Email address"
                    value={draft.sales.salesEmail}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, sales: { ...d.sales, salesEmail: e.target.value } }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Can edit sales price?"
                  desc="Can sales price be edited when making sales?"
                >
                  <BoolSelect
                    value={draft.sales.salesPriceEditable}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, sales: { ...d.sales, salesPriceEditable: v } }))
                    }
                    yesLabel="Yes, Can Edit"
                    noLabel="No, Can't Edit"
                  />
                </SettingRow>
                <SettingRow
                  label="Allow sales below cost?"
                  desc="Can sales be made for price lower than cost? This ensures discounted sales can never be below the cost price of items."
                >
                  <BoolSelect
                    value={draft.sales.allowSellBelowCost}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, sales: { ...d.sales, allowSellBelowCost: v } }))
                    }
                    yesLabel="Yes, Allow"
                    noLabel="No, Can't Sell"
                  />
                </SettingRow>
                <SettingRow
                  label="Restrict selling products from expired batches?"
                  desc="Disallow selling products from expired batches."
                >
                  <BoolSelect
                    value={draft.sales.restrictExpiredBatches}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, sales: { ...d.sales, restrictExpiredBatches: v } }))
                    }
                    yesLabel="Yes, Restrict"
                    noLabel="No, Allow Sales"
                  />
                </SettingRow>
                <SettingRow
                  label="Can sell without enough stock?"
                  desc="Can items be sold without enough stock? Stock count will become negative in this case"
                >
                  <BoolSelect
                    value={draft.sales.allowSellWithoutStock}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, sales: { ...d.sales, allowSellWithoutStock: v } }))
                    }
                    yesLabel="Yes, Allow"
                    noLabel="No, Can't Sell"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("sales")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Payments" && (
            <div className="flex flex-col gap-4">
              <Card className="p-5">
                <p className="text-xl font-bold text-foreground">Payment Methods</p>
                <p className="text-sm text-muted-foreground">
                  You can configure different payment methods to collect payments
                </p>
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settings.payments.methods.map((m) => (
                        <TableRow key={methodId(m)}>
                          <TableCell>
                            <p className="font-medium text-foreground">{m.name}</p>
                            {m.details && (
                              <p className="text-xs text-muted-foreground">{m.details}</p>
                            )}
                          </TableCell>
                          <TableCell>{m.type}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={methodId(m) === "Cash"}
                                onClick={() => openEditMethod(m)}
                              >
                                Edit
                              </Button>
                              {methodId(m) !== "Cash" && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteMethod(methodId(m))}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setMethodDraft({ name: "", type: "manual", details: "" });
                    setAddMethodOpen(true);
                  }}
                >
                  Add Payment Method
                </Button>
              </Card>
              <Card className="p-5">
                <p className="text-xl font-bold text-foreground">Cash Denominations</p>
                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Currency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashDenominations.map((d) => (
                        <TableRow key={d.name}>
                          <TableCell className="font-medium">{d.name}</TableCell>
                          <TableCell>{d.value.toFixed(2)}</TableCell>
                          <TableCell>{d.type}</TableCell>
                          <TableCell>{d.currency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}

          {tab === "My Dhipos" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">My Dhipos</p>
              <p className="text-sm text-muted-foreground">
                My Dhipos allows your customers to pay and view their bills, view credit balances
                and see loyalty points.
              </p>
              <div className="mt-2">
                <SettingRow
                  label="Enable My Dhipos?"
                  desc="Enables your customers to pay and view their bills, view credit balance and see loyalty points using my.dhipos.com. If you enable this your customers will be able to see all bills linked to their mobile numbers"
                >
                  <BoolSelect
                    value={settings.myDhipos.enabled}
                    onChange={(v) => settingsStore.updateSection("myDhipos", { enabled: v })}
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
                <SettingRow
                  label="Enable E-Bill QR?"
                  desc="If enabled, an e-bill QR code will be added to all generated invoices. Your customers will be able to see their digital bill by scanning the QR code."
                >
                  <BoolSelect
                    value={settings.myDhipos.eBillQrEnabled}
                    onChange={(v) => settingsStore.updateSection("myDhipos", { eBillQrEnabled: v })}
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="font-semibold text-foreground">Online Payments</p>
                <p className="text-sm text-muted-foreground">
                  Your customers will be able to pay their invoices online. Supported type: Bank
                  Transfer — users will be able to copy account details and upload transfer
                  receipts.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Enable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          <p className="font-medium text-foreground">Bank Transfer</p>
                          <p className="text-xs text-muted-foreground">bank-transfer</p>
                        </TableCell>
                        <TableCell>
                          <p>BML</p>
                          <p className="text-xs text-muted-foreground">7730000639888</p>
                        </TableCell>
                        <TableCell>
                          <Checkbox defaultChecked />
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </Card>
          )}

          {tab === "Inventory" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Inventory Settings</p>
              <p className="mt-3 font-medium text-foreground">Stock Adjustment Types</p>
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.inventory.stockAdjustmentTypes.map((k) => (
                      <TableRow key={k}>
                        <TableCell>{k}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              settingsStore.updateSection("inventory", {
                                stockAdjustmentTypes:
                                  settings.inventory.stockAdjustmentTypes.filter((t) => t !== k),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                className="mt-3"
                onClick={() =>
                  settingsStore.updateSection("inventory", {
                    stockAdjustmentTypes: [
                      ...settings.inventory.stockAdjustmentTypes,
                      `Custom Type ${settings.inventory.stockAdjustmentTypes.length + 1}`,
                    ],
                  })
                }
              >
                Add New
              </Button>
              <div className="mt-4">
                <SettingRow
                  label="Location Level Reorder Limit"
                  desc="You can enable this to support defining separate reorder limits at location level."
                >
                  <BoolSelect
                    value={settings.inventory.locationLevelReorderLimit}
                    onChange={(v) =>
                      settingsStore.updateSection("inventory", { locationLevelReorderLimit: v })
                    }
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
              </div>
            </Card>
          )}

          {tab === "Restaurant" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Restaurant Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Enable Restaurant Module?"
                  desc="Are any of your outlets restaurants"
                >
                  <BoolSelect
                    value={draft.restaurant.enabled}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, restaurant: { ...d.restaurant, enabled: v } }))
                    }
                    yesLabel="Yes, Enable Module"
                    noLabel="No, Disable Module"
                  />
                </SettingRow>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("restaurant")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Discounts" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Discount Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Gift cards"
                  desc="Gift cards of pre-defined amounts which can be redeemed once"
                >
                  <BoolSelect
                    value={draft.discounts.giftCardsEnabled}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        discounts: { ...d.discounts, giftCardsEnabled: v },
                      }))
                    }
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
                <SettingRow
                  label="Enable Loyalty Programs?"
                  desc="Create and manage loyalty programs to engage with your loyal customers. You can manage loyalty programs at Company Admin > Loyalty Programs."
                >
                  <BoolSelect
                    value={draft.discounts.loyaltyProgramsEnabled}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        discounts: { ...d.discounts, loyaltyProgramsEnabled: v },
                      }))
                    }
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
                <SettingRow
                  label="Only Fixed Discounts?"
                  desc="Only allow pre-defined discounts on bills?"
                >
                  <BoolSelect
                    value={draft.discounts.onlyFixedDiscounts}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        discounts: { ...d.discounts, onlyFixedDiscounts: v },
                      }))
                    }
                    yesLabel="Yes, Fixed Only"
                    noLabel="No, Any Discount Allowed"
                  />
                </SettingRow>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("discounts")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Discounts" && (
            <Card className="mt-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-foreground">Discount Presets</p>
                  <p className="text-sm text-muted-foreground">
                    Percent or fixed-amount discounts a cashier can apply from the Sell page's
                    Discount button.{" "}
                    {settings.discounts.onlyFixedDiscounts
                      ? '"Only Fixed Discounts" is on, so these are the only discounts allowed.'
                      : "A cashier can also type any custom percent/amount instead of picking one of these."}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setDiscountDraft({ name: "", type: "percent", value: "" });
                    setAddDiscountOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add Discount
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.discounts.presets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          No discount presets added yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {settings.discounts.presets.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>
                          {p.type === "percent"
                            ? `${p.value}%`
                            : `${settings.general.currency} ${p.value.toFixed(2)}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingDiscount(p);
                                setDiscountDraft({
                                  name: p.name,
                                  type: p.type,
                                  value: String(p.value),
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => removeDiscountPreset(p.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === "Developers" && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-foreground">Webhooks</p>
                  <p className="text-sm text-muted-foreground">
                    Create webhooks to receive an API request on events of interest. This app
                    doesn't have an outbound delivery worker, so hooks are saved here but not
                    actually fired — this list is the configuration record for when that's added.
                  </p>
                </div>
                <Button onClick={() => setAddWebhookOpen(true)} className="gap-1.5">
                  <Plus className="h-4 w-4" /> Add New
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Url</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Authorisation Header</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.webhooks.hooks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          No data
                        </TableCell>
                      </TableRow>
                    )}
                    {settings.webhooks.hooks.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono text-sm">{h.url}</TableCell>
                        <TableCell>{h.event}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {h.authHeader || "—"}
                        </TableCell>
                        <TableCell>{h.active ? "Active" : "Disabled"}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeWebhook(h.id)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === "Product" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Product Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Require SKU on new products?"
                  desc="If enabled, a SKU must be entered when creating a product."
                >
                  <BoolSelect
                    value={draft.product.skuRequired}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, product: { ...d.product, skuRequired: v } }))
                    }
                    yesLabel="Yes, Required"
                    noLabel="No, Optional"
                  />
                </SettingRow>
                <SettingRow
                  label="Auto-generate barcodes?"
                  desc="Automatically assign a barcode to products that don't have one."
                >
                  <BoolSelect
                    value={draft.product.barcodeAutoGenerate}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, product: { ...d.product, barcodeAutoGenerate: v } }))
                    }
                    yesLabel="Yes, Auto-generate"
                    noLabel="No, Manual Only"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("product")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Customer" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Customer Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Default Credit Limit"
                  desc="Applied to new customers unless overridden."
                >
                  <Input
                    type="number"
                    min={0}
                    value={draft.customer.defaultCreditLimit}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        customer: {
                          ...d.customer,
                          defaultCreditLimit: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Require mobile number on create?"
                  desc="If enabled, a mobile number is required when adding a new customer."
                >
                  <BoolSelect
                    value={draft.customer.requireMobileOnCreate}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        customer: { ...d.customer, requireMobileOnCreate: v },
                      }))
                    }
                    yesLabel="Yes, Required"
                    noLabel="No, Optional"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("customer")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Transfer" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Transfer Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Require approval for transfers?"
                  desc="Stock transfers between locations must be approved before stock moves."
                >
                  <BoolSelect
                    value={draft.transfer.requireApprovalForTransfers}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        transfer: { ...d.transfer, requireApprovalForTransfers: v },
                      }))
                    }
                    yesLabel="Yes, Require Approval"
                    noLabel="No, Auto-approve"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("transfer")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Purchases" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Purchases Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Require supplier GST/TIN number?"
                  desc="Purchase Invoices cannot be submitted without a supplier GST number."
                >
                  <BoolSelect
                    value={draft.purchases.requireGstNumberForSupplier}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        purchases: { ...d.purchases, requireGstNumberForSupplier: v },
                      }))
                    }
                    yesLabel="Yes, Required"
                    noLabel="No, Optional"
                  />
                </SettingRow>
                <SettingRow
                  label="Default Payment Terms (days)"
                  desc="Used to pre-fill the due date on new Purchase Invoices."
                >
                  <Input
                    type="number"
                    min={0}
                    value={draft.purchases.defaultPaymentTermsDays}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        purchases: {
                          ...d.purchases,
                          defaultPaymentTermsDays: parseInt(e.target.value, 10) || 0,
                        },
                      }))
                    }
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("purchases")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Tax" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Tax Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="GST %"
                  desc="Applied to every sale on the Sell page and used for new bills' tax calculation."
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={draft.tax.gstPercent}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        tax: { ...d.tax, gstPercent: parseFloat(e.target.value) || 0 },
                      }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Tax Label"
                  desc="Label shown on receipts and invoices for this tax."
                >
                  <Input
                    value={draft.tax.gstLabel}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tax: { ...d.tax, gstLabel: e.target.value } }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="GST TIN"
                  desc="Taxpayer Identification Number, as it appears on your GST Registration Certificate — printed on the GST Return report."
                >
                  <Input
                    value={draft.tax.gstTin}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tax: { ...d.tax, gstTin: e.target.value } }))
                    }
                    placeholder="e.g. 1000000GST501"
                  />
                </SettingRow>
                <SettingRow
                  label="Taxpayer Name"
                  desc="Your name/business name as it appears on your GST Registration Certificate."
                >
                  <Input
                    value={draft.tax.taxpayerName}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, tax: { ...d.tax, taxpayerName: e.target.value } }))
                    }
                  />
                </SettingRow>
                <SettingRow
                  label="Tax-inclusive pricing?"
                  desc="If enabled, product prices already include tax."
                >
                  <BoolSelect
                    value={draft.tax.taxInclusivePricing}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, tax: { ...d.tax, taxInclusivePricing: v } }))
                    }
                    yesLabel="Yes, Inclusive"
                    noLabel="No, Exclusive"
                  />
                </SettingRow>
                <SettingRow
                  label={`Plastic Bag Charge (${draft.general.currency} per bag)`}
                  desc={
                    'Charged when the cashier ticks "Plastic Bag" on the Sell page, per bag provided.'
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={draft.tax.bagFeeRate}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        tax: { ...d.tax, bagFeeRate: parseFloat(e.target.value) || 0 },
                      }))
                    }
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("tax")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Tax" && (
            <Card className="mt-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-foreground">Other Taxes</p>
                  <p className="text-sm text-muted-foreground">
                    Additional named tax rates, separate from GST above — a reference list for now,
                    not yet applied automatically at checkout.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setTaxDraft({ name: "", type: "percent", value: "" });
                    setAddTaxOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add New Tax
                </Button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.tax.customTaxes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                          No other taxes added yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {settings.tax.customTaxes.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>
                          {t.type === "unit"
                            ? `${settings.general.currency} ${t.value.toFixed(2)} / unit`
                            : `${t.value}%`}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingTax(t);
                                setTaxDraft({ name: t.name, type: t.type, value: String(t.value) });
                              }}
                            >
                              Edit
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => removeTax(t.id)}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {tab === "Service Fees" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Service Fee Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Enable Service Fee?"
                  desc="Adds an extra charge line to bills (not yet applied automatically at checkout)."
                >
                  <BoolSelect
                    value={draft.serviceFees.enabled}
                    onChange={(v) =>
                      setDraft((d) => ({ ...d, serviceFees: { ...d.serviceFees, enabled: v } }))
                    }
                    yesLabel="Yes, Enable"
                    noLabel="No, Disable"
                  />
                </SettingRow>
                <SettingRow
                  label="Fee %"
                  desc="Percentage of the bill subtotal charged as a service fee."
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.1"
                    value={draft.serviceFees.feePercent}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        serviceFees: {
                          ...d.serviceFees,
                          feePercent: parseFloat(e.target.value) || 0,
                        },
                      }))
                    }
                  />
                </SettingRow>
                <SettingRow label="Fee Label" desc="Label shown on receipts for this fee.">
                  <Input
                    value={draft.serviceFees.feeLabel}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        serviceFees: { ...d.serviceFees, feeLabel: e.target.value },
                      }))
                    }
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("serviceFees")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Printing" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Printing Settings</p>
              <div className="mt-2">
                <SettingRow
                  label="Default Print Template"
                  desc="Used automatically when printing a new sale. Manage templates from Admin > Print Templates."
                >
                  <Select
                    value={printSettings.defaultTemplateId}
                    onValueChange={(v) => printTemplatesStore.setDefault(v as PrintTemplateId)}
                  >
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
                </SettingRow>
                <SettingRow
                  label="Automatically print bill on save?"
                  desc="Skip the manual Print button and print immediately after a sale is saved."
                >
                  <BoolSelect
                    value={settings.printing.autoPrintOnSave}
                    onChange={(v) =>
                      settingsStore.updateSection("printing", { autoPrintOnSave: v })
                    }
                    yesLabel="Yes, Auto-print"
                    noLabel="No, Ask Each Time"
                  />
                </SettingRow>
                <SettingRow label="Print Copies" desc="Number of copies to print per sale.">
                  <Input
                    type="number"
                    min={1}
                    value={draft.printing.printCopies}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        printing: { ...d.printing, printCopies: parseInt(e.target.value, 10) || 1 },
                      }))
                    }
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("printing")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Local Data" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Local Data</p>
              <p className="text-sm text-muted-foreground">
                Dhipos runs entirely in this browser — all data (products, bills, settings) is
                stored locally and never leaves this device.
              </p>
              <div className="mt-2">
                <SettingRow
                  label="Remind me to back up local data?"
                  desc="Shows a reminder to export/back up your data periodically."
                >
                  <BoolSelect
                    value={draft.localData.autoBackupReminder}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        localData: { ...d.localData, autoBackupReminder: v },
                      }))
                    }
                    yesLabel="Yes, Remind Me"
                    noLabel="No, Don't Remind"
                  />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => saveSection("localData")}>Update Settings</Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!editingFormatType} onOpenChange={(v) => !v && setEditingFormatType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingFormatType} number format</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Input
              value={formatDraft}
              onChange={(e) => setFormatDraft(e.target.value)}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFormatType(null)}>
              Cancel
            </Button>
            <Button onClick={saveFormatEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMethod} onOpenChange={(v) => !v && setEditingMethod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingMethod?.name} payment method</DialogTitle>
          </DialogHeader>
          {editingMethod?.key && (
            <p className="text-xs text-muted-foreground">
              Renaming this updates its label on the Sell page immediately — the underlying record
              it saves against on bills/reports doesn't change.
            </p>
          )}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={methodDraft.name}
                onChange={(e) => setMethodDraft((m) => ({ ...m, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input
                value={methodDraft.type}
                onChange={(e) => setMethodDraft((m) => ({ ...m, type: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Input
                value={methodDraft.details}
                onChange={(e) => setMethodDraft((m) => ({ ...m, details: e.target.value }))}
                placeholder="e.g. account number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMethod(null)}>
              Cancel
            </Button>
            <Button onClick={saveMethodEdit} disabled={!methodDraft.name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addMethodOpen} onOpenChange={setAddMethodOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Payment Method</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Cash, Card, and Bank Transfer are the only methods with a full collection workflow (cash
            tendered, card slip #, transfer slip) on the Sell page. A custom name here is saved as a
            reference/record but won't appear as a selectable option at Sell.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={methodDraft.name}
                onChange={(e) => setMethodDraft((m) => ({ ...m, name: e.target.value }))}
                placeholder="e.g. Store Credit"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input
                value={methodDraft.type}
                onChange={(e) => setMethodDraft((m) => ({ ...m, type: e.target.value }))}
                placeholder="e.g. manual"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Input
                value={methodDraft.details}
                onChange={(e) => setMethodDraft((m) => ({ ...m, details: e.target.value }))}
                placeholder="e.g. account number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMethodOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addMethod} disabled={!methodDraft.name.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addWebhookOpen} onOpenChange={setAddWebhookOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input
                value={webhookDraft.url}
                onChange={(e) => setWebhookDraft((w) => ({ ...w, url: e.target.value }))}
                placeholder="https://example.com/webhook"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Event</Label>
              <Select
                value={webhookDraft.event}
                onValueChange={(v) => setWebhookDraft((w) => ({ ...w, event: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bill.created">Bill Created</SelectItem>
                  <SelectItem value="bill.voided">Bill Voided</SelectItem>
                  <SelectItem value="purchase_invoice.approved">
                    Purchase Invoice Approved
                  </SelectItem>
                  <SelectItem value="product.created">Product Created</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Authorisation Header</Label>
              <Input
                value={webhookDraft.authHeader}
                onChange={(e) => setWebhookDraft((w) => ({ ...w, authHeader: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddWebhookOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addWebhook} disabled={!webhookDraft.url.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addTaxOpen} onOpenChange={setAddTaxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Tax</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={taxDraft.name}
                onChange={(e) => setTaxDraft((t) => ({ ...t, name: e.target.value }))}
                placeholder="e.g. Environmental Levy"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate</Label>
              <div className="flex gap-2">
                <Select
                  value={taxDraft.type}
                  onValueChange={(v) =>
                    setTaxDraft((t) => ({ ...t, type: v as "percent" | "unit" }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="unit">Per Unit ({settings.general.currency})</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={taxDraft.value}
                  onChange={(e) => setTaxDraft((t) => ({ ...t, value: e.target.value }))}
                  placeholder={taxDraft.type === "unit" ? "e.g. 2.00" : "e.g. 3"}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTaxOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addTax} disabled={!taxDraft.name.trim() || !taxDraft.value}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTax} onOpenChange={(v) => !v && setEditingTax(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingTax?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={taxDraft.name}
                onChange={(e) => setTaxDraft((t) => ({ ...t, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rate</Label>
              <div className="flex gap-2">
                <Select
                  value={taxDraft.type}
                  onValueChange={(v) =>
                    setTaxDraft((t) => ({ ...t, type: v as "percent" | "unit" }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="unit">Per Unit ({settings.general.currency})</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={taxDraft.value}
                  onChange={(e) => setTaxDraft((t) => ({ ...t, value: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTax(null)}>
              Cancel
            </Button>
            <Button onClick={saveTaxEdit} disabled={!taxDraft.name.trim() || !taxDraft.value}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addDiscountOpen} onOpenChange={setAddDiscountOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Discount Preset</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={discountDraft.name}
                onChange={(e) => setDiscountDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Staff Discount"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <div className="flex gap-2">
                <Select
                  value={discountDraft.type}
                  onValueChange={(v) =>
                    setDiscountDraft((d) => ({ ...d, type: v as "percent" | "amount" }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="amount">Amount ({settings.general.currency})</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={discountDraft.value}
                  onChange={(e) => setDiscountDraft((d) => ({ ...d, value: e.target.value }))}
                  placeholder={discountDraft.type === "amount" ? "e.g. 10.00" : "e.g. 10"}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDiscountOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addDiscountPreset}
              disabled={!discountDraft.name.trim() || !discountDraft.value}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDiscount} onOpenChange={(v) => !v && setEditingDiscount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingDiscount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={discountDraft.name}
                onChange={(e) => setDiscountDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <div className="flex gap-2">
                <Select
                  value={discountDraft.type}
                  onValueChange={(v) =>
                    setDiscountDraft((d) => ({ ...d, type: v as "percent" | "amount" }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="amount">Amount ({settings.general.currency})</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.1}
                  value={discountDraft.value}
                  onChange={(e) => setDiscountDraft((d) => ({ ...d, value: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDiscount(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveDiscountEdit}
              disabled={!discountDraft.name.trim() || !discountDraft.value}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
