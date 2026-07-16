// Shared by the report pages (src/routes/report-*.tsx). Bills/register sessions store
// their timestamp as "16-Jul-26, 04:40" — these convert that to/from an ISO yyyy-mm-dd
// so it can be compared against <input type="date"> values.

export function toIsoDate(stamp: string): string | null {
  const datePart = stamp.split(",")[0]?.trim();
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/.exec(datePart ?? "");
  if (!m) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIdx = months.indexOf(m[2]);
  if (monthIdx === -1) return null;
  const year = 2000 + parseInt(m[3], 10);
  const day = m[1].padStart(2, "0");
  const month = String(monthIdx + 1).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoToDate(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function todayIso(): string {
  return dateToIso(new Date());
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dateToIso(d);
}

// Monday-start week, matching this app's date pickers elsewhere.
export function startOfWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateToIso(d);
}

export function endOfWeekIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + (6 - ((d.getDay() + 6) % 7)));
  return dateToIso(d);
}

export function startOfMonthIso(): string {
  const d = new Date();
  return dateToIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonthIso(): string {
  const d = new Date();
  return dateToIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
