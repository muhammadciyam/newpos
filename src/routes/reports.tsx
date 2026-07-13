import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — DhiPOS" },
      { name: "description", content: "Sales analytics and performance reports." },
    ],
  }),
  component: ReportsPage,
});

const weekly = [
  { d: "Mon", v: 62 },
  { d: "Tue", v: 78 },
  { d: "Wed", v: 54 },
  { d: "Thu", v: 92 },
  { d: "Fri", v: 100 },
  { d: "Sat", v: 84 },
  { d: "Sun", v: 70 },
];

function ReportsPage() {
  const max = Math.max(...weekly.map((w) => w.v));
  return (
    <AppShell title="Reports">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Weekly Performance</h2>
          <p className="text-sm text-muted-foreground">Sales overview for the last 7 days</p>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Sales by Day</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-64 items-end justify-between gap-3">
              {weekly.map((w) => (
                <div key={w.d} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md bg-[image:var(--gradient-primary)] transition-all"
                    style={{ height: `${(w.v / max) * 100}%` }}
                  />
                  <span className="text-xs text-muted-foreground">{w.d}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { l: "Total Revenue", v: "$8,942.10" },
            { l: "Orders", v: "312" },
            { l: "Avg. Ticket", v: "$28.65" },
          ].map((s) => (
            <Card key={s.l}>
              <CardContent className="p-5">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.l}</p>
                <p className="mt-2 text-2xl font-bold">{s.v}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}