import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  change,
  changeSuffix = "%",
  neutral,
  className,
}: {
  label: string;
  value: string;
  change?: number;
  changeSuffix?: string;
  neutral?: boolean;
  className?: string;
}) {
  const positive = (change ?? 0) > 0;
  const isZero = !change;

  return (
    <Card className={cn("p-5", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {change !== undefined && !neutral && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-medium",
              isZero ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-destructive",
            )}
          >
            {!isZero && (positive ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)}
            {isZero ? "—" : `${Math.abs(change!).toFixed(1)}${changeSuffix}`}
          </span>
        )}
      </div>
    </Card>
  );
}
