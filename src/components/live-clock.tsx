import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings-store";

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

// Always visible in the header (see AppShell) — the shop's configured timezone (Settings >
// General > Timezone, auto-detected/kept in sync from this device) drives the displayed
// time, not just this device's own clock, so every device in the shop shows the same time
// regardless of what timezone that particular device happens to be set to.
export function LiveClock() {
  const timezone = useSettings().general.timezone;
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
