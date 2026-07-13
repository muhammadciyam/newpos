import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — DhiPOS" },
      { name: "description", content: "Configure your store, taxes, and receipts." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="mx-auto grid max-w-4xl gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Store Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Store Name</Label>
              <Input defaultValue="DhiPOS Store" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input defaultValue="USD" />
            </div>
            <div className="space-y-1.5">
              <Label>Tax Rate (%)</Label>
              <Input defaultValue="5" />
            </div>
            <div className="space-y-1.5">
              <Label>Receipt Footer</Label>
              <Input defaultValue="Thank you for your purchase!" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {[
              { l: "Print receipts automatically", d: "Print after every successful checkout" },
              { l: "Enable barcode scanner", d: "Listen for USB scanner input on POS screen" },
              { l: "Show low-stock warnings", d: "Alert when items dip below 15 units" },
            ].map((p) => (
              <div key={p.l} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{p.l}</p>
                  <p className="text-xs text-muted-foreground">{p.d}</p>
                </div>
                <Switch defaultChecked />
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button onClick={() => toast.success("Settings saved")}>Save Changes</Button>
        </div>
      </div>
    </AppShell>
  );
}