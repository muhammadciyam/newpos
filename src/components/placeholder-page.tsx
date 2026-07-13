import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function PlaceholderPage({
  title,
  description,
  icon: Icon,
  empty,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  empty: string;
}) {
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Card className="flex flex-col items-center gap-2 p-16 text-center text-muted-foreground">
          <Icon className="h-10 w-10" />
          <p className="font-medium text-foreground">{empty}</p>
        </Card>
      </div>
    </AppShell>
  );
}
