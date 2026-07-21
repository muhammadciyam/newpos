// A short, always-available fallback for browsers/environments where the modern
// Intl.supportedValuesOf API (below) isn't implemented — covers this app's own region plus a
// few common neighbors so the Timezone dropdown is never left with just one option.
const FALLBACK_TIMEZONES = [
  "Indian/Maldives",
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "UTC",
];

// The full IANA timezone list, sourced from the browser itself rather than hand-maintained.
export function listTimezones(): string[] {
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  if (typeof supportedValuesOf === "function") {
    try {
      return supportedValuesOf("timeZone");
    } catch {
      // fall through to the static list
    }
  }
  return FALLBACK_TIMEZONES;
}

// This device's own OS-level timezone — used to auto-fill Settings > General > Timezone and
// to format the header's live clock.
export function detectDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}
