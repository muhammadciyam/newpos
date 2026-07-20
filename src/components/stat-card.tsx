import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { iconColors, type IconColor } from "@/lib/icon-colors";

export function StatCard({
  label,
  value,
  change,
  changeSuffix = "%",
  neutral,
  icon: Icon,
  color = "blue",
  className,
}: {
  label: string;
  value: string;
  change?: number;
  changeSuffix?: string;
  neutral?: boolean;
  icon?: LucideIcon;
  color?: IconColor;
  className?: string;
}) {
  const positive = (change ?? 0) > 0;
  const isZero = !change;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-black/5",
              iconColors[color],
            )}
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2.25} />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {change !== undefined && !neutral && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-sm font-medium",
              isZero ? "text-muted-foreground" : positive ? "text-emerald-600" : "text-destructive",
            )}
          >
            {!isZero &&
              (positive ? (
                <ArrowUp className="h-3.5 w-3.5" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" />
              ))}
            {isZero ? "—" : `${Math.abs(change!).toFixed(1)}${changeSuffix}`}
          </span>
        )}
      </div>
    </Card>
  );
}
