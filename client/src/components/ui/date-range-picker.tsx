import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type { DateRange };

interface DateRangePickerProps {
  range: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  className?: string;
  disabled?: (date: Date) => boolean;
  /** Months shown side by side. Two makes picking a span across months easy. */
  numberOfMonths?: number;
  placeholder?: string;
}

/**
 * Two-date sibling of `DatePicker`, which hardcodes `mode="single"`.
 *
 * `Calendar` already ships the range classNames (`range_start`, `range_middle`,
 * `range_end`), so this is mostly the trigger label and the popover.
 */
export function DateRangePicker({
  range,
  onSelect,
  className,
  disabled,
  numberOfMonths = 2,
  placeholder = "Pick a date range",
}: DateRangePickerProps) {
  const label = !range?.from
    ? placeholder
    : range.to
      ? `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`
      : // Mid-selection: one end chosen, waiting for the other.
        `${format(range.from, "MMM d, yyyy")} – …`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 justify-start text-left text-xs font-normal",
            !range?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 shrink-0" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          onSelect={onSelect}
          disabled={disabled}
          numberOfMonths={numberOfMonths}
          defaultMonth={range?.from}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
