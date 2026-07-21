import { useEffect, useState } from "react";
import { useCurrentOutletId } from "@/lib/auth-store";
import { useOutlets } from "@/lib/outlets-store";

function formatClock(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    // An unrecognized/invalid saved timeZone string — fall back to the device's own local
    // time rather than crashing the header.
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  }
}

// Always visible in the header (see AppShell) — driven by the current outlet's own timezone
// (Admin > Locations, Super Admin only — each outlet can be set differently), not just this
// device's own clock, so every device at that outlet shows the same time regardless of what
// timezone that particular device happens to be set to.
export function LiveClock() {
  const outletId = useCurrentOutletId();
  const outlets = useOutlets();
  const timezone = outlets.find((o) => o.id === outletId)?.timezone ?? "Indian/Maldives";
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden flex-col items-end leading-tight md:flex">
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {formatClock(now, timezone)}
      </span>
      <span className="text-[11px] text-muted-foreground">{timezone}</span>
    </div>
  );
}
