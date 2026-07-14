import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function RestrictedPage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <Card className="flex flex-col items-center gap-2 p-16 text-center text-muted-foreground">
          <ShieldAlert className="h-10 w-10" />
          <p className="font-medium text-foreground">Access restricted</p>
          <p className="max-w-sm text-sm">Your role doesn't have permission to view this page. Contact an admin if you need access.</p>
        </Card>
      </div>
    </AppShell>
  );
}
