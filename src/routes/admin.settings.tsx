import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { paymentMethods, cashDenominations, numberFormats } from "@/lib/pos-data";
import { useHasPermission } from "@/lib/permissions";
import { RestrictedPage } from "@/components/restricted-page";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Dhipos" }],
  }),
  component: SettingsPage,
});

const tabs = [
  "Modules", "General", "Numbering", "Sales", "Payments", "My Dhipos",
  "Product", "Customer", "Transfer", "Purchases", "Restaurant", "Inventory",
  "Discounts", "Tax", "Service Fees", "Printing", "Local Data", "Developers",
];

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
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

function YesNoSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <Select defaultValue={defaultValue}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={defaultValue}>{defaultValue}</SelectItem>
        <SelectItem value="alt">Alternative</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SettingsPage() {
  const canManage = useHasPermission("settings.manage");
  const [tab, setTab] = useState("Modules");
  const [stockAdjustmentTypes, setStockAdjustmentTypes] = useState([
    "Lost / Stolen", "Expired", "Stock Recount", "Damaged",
  ]);

  if (!canManage) return <RestrictedPage />;

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
              </p>
              <div className="mt-4 space-y-6">
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Base Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Catalogue Management</li>
                    </ul>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Point of Sale Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Allows you to make sales and manage registers at outlets</li>
                      <li>Allows you to manage Gift Cards and redeem them at outlets</li>
                    </ul>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-start justify-between gap-4 border-t border-border pt-5">
                  <div>
                    <p className="font-semibold text-foreground">Inventory Module</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                      <li>Allows you to manage inventory of your stock items</li>
                      <li>Allows you to create Purchase Orders and manage Suppliers</li>
                      <li>Allows you to create Transfer Requests, and transfer inventory between locations</li>
                    </ul>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </Card>
          )}

          {tab === "General" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">General Settings</p>
              <div className="mt-2">
                <SettingRow label="Currency" desc="The company currency code to be used through out the system. Eg: $, MVR">
                  <Input defaultValue="MVR" />
                </SettingRow>
                <SettingRow label="Timezone" desc="Timezone your shop is set up at. By default all dates will be shown in this timezone">
                  <Select defaultValue="maldives">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maldives">Indian/Maldives</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow label="Unique Customer Mobile Numbers?" desc="Validate customer mobile numbers to be unique?">
                  <YesNoSelect defaultValue="Yes, Unique" />
                </SettingRow>
                <SettingRow label="Optimise loading of bill history?" desc="To load bill history faster, simple page navigation will be served.">
                  <YesNoSelect defaultValue="Yes, Enable" />
                </SettingRow>
                <SettingRow label="SMS ShortCode?" desc="SMS sent to your customers will be send from this name. Must only contain capital letters (A-Z) and numbers. No spaces and must be less than 11 characters">
                  <Input defaultValue="SEVENMART" />
                </SettingRow>
                <SettingRow label="Company Logo" desc="Upload a PNG logo file (maximum 30kb) which will be the default logo printed on generated documents.">
                  <Input type="file" accept="image/png" />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => toast.success("General settings updated")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Numbering" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Number Formats</p>
              <p className="text-sm text-muted-foreground">
                You can configure different formats for numbers generated throughout the application.
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
                    {numberFormats.map((f) => (
                      <TableRow key={f.type}>
                        <TableCell className="font-medium">{f.type}</TableCell>
                        <TableCell className="font-mono text-sm">{f.format}</TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={() => toast(`Edit ${f.type} number format`)}>
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
                <SettingRow label="Company Sales Email" desc="Quotations, Sales Receipts sent to customers will be cc'd to this email. This email will also be set as the Reply-To email address">
                  <Input placeholder="Email address" />
                </SettingRow>
                <SettingRow label="Can edit sales price?" desc="Can sales price be edited when making sales?">
                  <YesNoSelect defaultValue="No, Can't Edit" />
                </SettingRow>
                <SettingRow label="Allow sales below cost?" desc="Can sales be made for price lower than cost? This ensures discounted sales can never be below the cost price of items.">
                  <YesNoSelect defaultValue="No, Can't Sell" />
                </SettingRow>
                <SettingRow label="Restrict selling products from expired batches?" desc="Disallow selling products from expired batches.">
                  <YesNoSelect defaultValue="No, Allow Sales" />
                </SettingRow>
                <SettingRow label="Can sell without enough stock?" desc="Can items be sold without enough stock? Stock count will become negative in this case">
                  <YesNoSelect defaultValue="No, Can't Sell" />
                </SettingRow>
                <SettingRow label="Should bill date be register date?" desc="If set, the bill date will be the date the register session was opened and not the actual calendar at the time of bill creation">
                  <YesNoSelect defaultValue="No, Calendar Date" />
                </SettingRow>
                <SettingRow label="Allow to set Bill Date when creating a bill?" desc="If enabled, you can select a bill date while creating a bill.">
                  <YesNoSelect defaultValue="No, Cannot modify date" />
                </SettingRow>
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button onClick={() => toast.success("Sales settings updated")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Payments" && (
            <div className="flex flex-col gap-4">
              <Card className="p-5">
                <p className="text-xl font-bold text-foreground">Payment Methods</p>
                <p className="text-sm text-muted-foreground">You can configure different payment methods to collect payments</p>
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
                      {paymentMethods.map((m) => (
                        <TableRow key={m.name}>
                          <TableCell>
                            <p className="font-medium text-foreground">{m.name}</p>
                            {m.details && <p className="text-xs text-muted-foreground">{m.details}</p>}
                          </TableCell>
                          <TableCell>{m.type}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" disabled={m.name === "Cash"} onClick={() => toast(`Edit ${m.name} payment method`)}>
                                Edit
                              </Button>
                              {m.name !== "Cash" && (
                                <Button variant="destructive" size="sm" onClick={() => toast.success(`${m.name} payment method removed`)}>
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
                <Button className="mt-4" onClick={() => toast("Add payment method form opened")}>Add Payment Method</Button>
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
                My Dhipos allows your customers to pay and view their bills, view credit balances and see loyalty
                points.
              </p>
              <div className="mt-2">
                <SettingRow label="Enable My Dhipos?" desc="Enables your customers to pay and view their bills, view credit balance and see loyalty points using my.dhipos.com. If you enable this your customers will be able to see all bills linked to their mobile numbers">
                  <YesNoSelect defaultValue="No, Disable" />
                </SettingRow>
                <SettingRow label="Enable E-Bill QR?" desc="If enabled, an e-bill QR code will be added to all generated invoices. Your customers will be able to see their digital bill by scanning the QR code.">
                  <YesNoSelect defaultValue="Yes, Enable" />
                </SettingRow>
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="font-semibold text-foreground">Online Payments</p>
                <p className="text-sm text-muted-foreground">
                  Your customers will be able to pay their invoices online. Supported type: Bank Transfer — users
                  will be able to copy account details and upload transfer receipts.
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
                    {stockAdjustmentTypes.map((k) => (
                      <TableRow key={k}>
                        <TableCell>{k}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setStockAdjustmentTypes((types) => types.filter((t) => t !== k))}
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
                onClick={() => setStockAdjustmentTypes((types) => [...types, `Custom Type ${types.length + 1}`])}
              >
                Add New
              </Button>
              <div className="mt-4">
                <SettingRow label="Location Level Reorder Limit" desc="You can enable this to support defining separate reorder limits at location level.">
                  <YesNoSelect defaultValue="No, Disable" />
                </SettingRow>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => toast.success("Inventory settings updated")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Restaurant" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Restaurant Settings</p>
              <div className="mt-2">
                <SettingRow label="Enable Restaurant Module?" desc="Are any of your outlets restaurants">
                  <YesNoSelect defaultValue="No, Disable Module" />
                </SettingRow>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => toast.success("Restaurant settings updated")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Discounts" && (
            <Card className="p-5">
              <p className="text-xl font-bold text-foreground">Discount Settings</p>
              <div className="mt-2">
                <SettingRow label="Gift cards" desc="Gift cards of pre-defined amounts which can be redeemed once">
                  <YesNoSelect defaultValue="No, Disable" />
                </SettingRow>
                <SettingRow label="Enable Loyalty Programs?" desc="Create and manage loyalty programs to engage with your loyal customers. You can manage loyalty programs at Company Admin > Loyalty Programs.">
                  <YesNoSelect defaultValue="Yes, Enable" />
                </SettingRow>
                <SettingRow label="Only Fixed Discounts?" desc="Only allow pre-defined discounts on bills?">
                  <YesNoSelect defaultValue="No, Any Discount Allowed" />
                </SettingRow>
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button onClick={() => toast.success("Discount settings updated")}>Update Settings</Button>
              </div>
            </Card>
          )}

          {tab === "Developers" && (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-foreground">Webhooks</p>
                  <p className="text-sm text-muted-foreground">Create webhooks to receive an API request on events of interest.</p>
                </div>
                <Button onClick={() => toast("Add webhook form opened")}>Add New</Button>
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
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

          {["Product", "Customer", "Transfer", "Purchases", "Tax", "Service Fees", "Printing", "Local Data"].includes(tab) && (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              {tab} settings — nothing configured yet.
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
