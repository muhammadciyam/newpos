import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  todayIso,
  startOfWeekIso,
  endOfWeekIso,
  startOfMonthIso,
  endOfMonthIso,
  isoToDate,
  dateToIso,
} from "@/lib/report-utils";

export type ReportRange = { from: string; to: string };

// Shared by every date-filterable report page: three quick presets (Day/Week/Month,
// relative to today) plus a calendar popover for picking an exact day or custom range.
export function ReportDateRangeControl({
  value,
  onChange,
}: {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected: DateRange = { from: isoToDate(value.from), to: isoToDate(value.to) };
  const label = value.from === value.to ? value.from : `${value.from} ~ ${value.to}`;

  return (
    <div className="flex flex-wrap items-end gap-1.5">
      <div className="flex overflow-hidden rounded-md border border-input">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none border-r border-input"
          onClick={() => {
            const d = todayIso();
            onChange({ from: d, to: d });
          }}
        >
          Day
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none border-r border-input"
          onClick={() => onChange({ from: startOfWeekIso(), to: endOfWeekIso() })}
        >
          Week
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-none"
          onClick={() => onChange({ from: startOfMonthIso(), to: endOfMonthIso() })}
        >
          Month
        </Button>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={selected}
            onSelect={(range) => {
              if (!range?.from) return;
              onChange({ from: dateToIso(range.from), to: dateToIso(range.to ?? range.from) });
              if (range.to) setOpen(false);
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
