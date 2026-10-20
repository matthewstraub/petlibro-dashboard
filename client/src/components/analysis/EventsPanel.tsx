import { CalendarPlus, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EVENT_CATEGORIES } from "@/lib/event-categories";
import { formatDateKey } from "@shared/dates";
import type { ChartEvent } from "@shared/events";

function formatWhen(event: ChartEvent): string {
  const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (event.endDate && event.endDate !== event.startDate) {
    return `${formatDateKey(event.startDate, short)} – ${formatDateKey(event.endDate, short)}`;
  }
  return formatDateKey(event.startDate, { weekday: "short", month: "short", day: "numeric" });
}

export function EventsPanel({
  events,
  hiddenCount,
  onAdd,
  onEdit,
}: {
  /** Events in the visible window that are not hidden, newest first. */
  events: ChartEvent[];
  /** Events in the window filtered out by the category toggles. */
  hiddenCount: number;
  onAdd: () => void;
  onEdit: (event: ChartEvent) => void;
}) {
  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Events in this range</CardTitle>
          <CardDescription className="mt-1.5">
            {events.length === 0
              ? "Nothing logged for these dates yet."
              : `${events.length} event${events.length === 1 ? "" : "s"}`}
            {hiddenCount > 0 && ` · ${hiddenCount} hidden by the filters above`}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onAdd}>
          <CalendarPlus className="h-4 w-4" />
          Add event
        </Button>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Log a food change, a vet visit, medication, or a trip and it will appear on the chart.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 max-h-[340px] overflow-y-auto -mx-2 pr-1">
            {events.map(event => {
              const cat = EVENT_CATEGORIES[event.type];
              const Icon = cat.icon;
              const editable = event.source === "manual";
              return (
                <li key={event.id} className="flex items-start gap-3 px-2 py-2.5 group">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
                    style={{ borderColor: cat.color }}
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{event.title}</span>
                      {event.source === "petlibro" && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          From Petlibro
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {cat.label} · {formatWhen(event)}
                    </p>
                    {event.note && (
                      <p className="text-xs text-muted-foreground/80 mt-1">{event.note}</p>
                    )}
                  </div>
                  {editable && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-60 group-hover:opacity-100 shrink-0"
                      onClick={() => onEdit(event)}
                      aria-label={`Edit ${event.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
