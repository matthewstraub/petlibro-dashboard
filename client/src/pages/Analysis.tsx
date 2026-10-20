import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  CalendarCheck,
  CalendarPlus,
  CalendarRange,
  Droplets,
  Eye,
  EyeOff,
  Loader2,
  Minus,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUnit } from "@/contexts/UnitContext";
import { buildSeries, summarize, computeTrend, type SeriesPoint } from "@shared/analytics";
import { formatDateKey } from "@shared/dates";
import {
  eventsInWindow,
  eventsOnDay,
  groupPointEvents,
  rangeEventsInWindow,
  type ChartEvent,
  type EventType,
} from "@shared/events";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import { EVENT_CATEGORIES, EVENT_TYPE_ORDER } from "@/lib/event-categories";
import { useChartEvents } from "@/hooks/useChartEvents";
import { EventDialog } from "@/components/analysis/EventDialog";
import {
  CHIP_SPAN_PX,
  EVENT_LANE_HEIGHT,
  EventMarkerLabel,
} from "@/components/analysis/EventMarkerLabel";
import { EventsPanel } from "@/components/analysis/EventsPanel";

type PresetId = "30d" | "90d" | "all" | "custom";

const PRESETS: Array<{ id: PresetId; label: string; rangeDays: number | null }> = [
  { id: "30d", label: "30 days", rangeDays: 30 },
  { id: "90d", label: "90 days", rangeDays: 90 },
  { id: "all", label: "All time", rangeDays: null },
  { id: "custom", label: "Custom", rangeDays: null },
];

/** Local Date -> "YYYY-MM-DD", reading local parts so the picked day is kept. */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const VISIBILITY_KEY = "petlibro-analysis-event-visibility";

/**
 * Past this many days, maintenance-only days drop their chip and keep just the
 * hairline. Filter and cleaning recur every couple of weeks, so on a long range
 * they would otherwise fill the lane and bury the events that tell a story.
 */
const DENSE_RANGE_DAYS = 90;

/** Left margin + Y-axis width + right margin, for estimating the plot's width. */
const PLOT_INSET_PX = 80;

/** Per-viewer preference, so it lives in localStorage rather than the database. */
function loadVisibility(): { show: boolean; hidden: EventType[] } {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? "null");
    if (parsed && typeof parsed.show === "boolean" && Array.isArray(parsed.hidden)) return parsed;
  } catch {}
  return { show: true, hidden: [] };
}

const SERIES_LABELS: Record<string, { label: string; partialLabel?: string }> = {
  totalMl: { label: "Daily intake", partialLabel: "Today so far" },
  avg7: { label: "7-day average" },
  avg30: { label: "30-day average" },
};

/**
 * Formats an ALREADY-CONVERTED display value.
 *
 * Mirrors useUnit().format()'s rounding but performs no conversion of its own —
 * chart payload values have already been through convert(). Calling format()
 * here would convert a second time.
 */
function formatConverted(value: number, unit: "ml" | "oz"): string {
  return unit === "oz" ? value.toFixed(2) : Math.round(value).toString();
}

function AnalysisTooltip({ active, payload, label, unit, unitLabel, eventsForDay }: any) {
  if (!active || !payload?.length) return null;

  const dayEvents: ChartEvent[] = eventsForDay ? eventsForDay(label) : [];

  const isPartial = Boolean(payload[0]?.payload?.isPartial);
  const isZero = Boolean(payload[0]?.payload?.isZero) && !isPartial;

  // Recharts still emits an entry for null series values; without this filter a
  // gap day renders "NaN" in mL mode and throws on .toFixed in oz mode.
  const rows = payload
    .filter((entry: any) => entry.value != null && Number.isFinite(entry.value))
    // On a no-intake day the daily 0 is noise — "0.00 fl oz" reads as a
    // measurement when it means the fountain went unused. The note below says so
    // in words instead. Rolling averages still show, since they span other days.
    .filter((entry: any) => !(isZero && entry.dataKey === "totalMl"))
    .map((entry: any) => {
      // Key off dataKey, never name: `name` is human copy for the legend, and
      // branching on it is what makes Trends.tsx's tooltip drop the unit.
      const meta = SERIES_LABELS[entry.dataKey];
      if (!meta) return null;
      return {
        key: entry.dataKey,
        name: isPartial && meta.partialLabel ? meta.partialLabel : meta.label,
        color: entry.color ?? entry.stroke ?? entry.fill,
        text: `${formatConverted(entry.value, unit)} ${unitLabel}`,
      };
    })
    .filter(Boolean);

  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl min-w-[180px] max-w-[280px]">
      <p className="text-xs text-muted-foreground">
        {formatDateKey(label, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </p>
      {isZero && <p className="text-sm text-muted-foreground mt-1">No drinking recorded</p>}
      {rows.length === 0 && !isZero ? (
        <p className="text-sm text-muted-foreground mt-1">No data recorded</p>
      ) : (
        rows.map((row: any) => (
          <div key={row.key} className="flex items-baseline justify-between gap-4 mt-1">
            <span className="text-xs" style={{ color: row.color }}>
              {row.name}
            </span>
            <span className="text-sm font-semibold tabular-nums">{row.text}</span>
          </div>
        ))
      )}
      {isPartial && (
        <p className="text-[11px] text-muted-foreground mt-1.5">Today is still in progress</p>
      )}
      {dayEvents.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/60 space-y-1.5">
          {dayEvents.map(event => {
            const cat = EVENT_CATEGORIES[event.type];
            const Icon = cat.icon;
            return (
              <div key={event.id} className="flex items-start gap-2">
                {/* The icon carries the category color; the text stays in text tokens. */}
                <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: cat.color }} />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug">{event.title}</p>
                  {event.note && (
                    <p className="text-[11px] text-muted-foreground leading-snug">{event.note}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  unit,
  sub,
}: {
  icon: typeof Droplets;
  label: string;
  value: string | null;
  unit?: string;
  sub?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-4 pb-4 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs">{label}</span>
        </div>
        {value === null ? (
          <p className="text-lg text-muted-foreground">—</p>
        ) : (
          <>
            <p className="text-xl font-bold">
              {value}
              {unit && <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Analysis() {
  const { convert, format: formatValue, label: unitLabel, unit, toggleUnit } = useUnit();
  const [presetId, setPresetId] = useState<PresetId>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const { events, addEvent, updateEvent, removeEvent } = useChartEvents();
  const [showEvents, setShowEvents] = useState(() => loadVisibility().show);
  const [hiddenTypes, setHiddenTypes] = useState<Set<EventType>>(
    () => new Set(loadVisibility().hidden)
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChartEvent | null>(null);
  const [defaultDateKey, setDefaultDateKey] = useState(() => toLocalDateKey(new Date()));

  useEffect(() => {
    try {
      localStorage.setItem(
        VISIBILITY_KEY,
        JSON.stringify({ show: showEvents, hidden: Array.from(hiddenTypes) })
      );
    } catch {}
  }, [showEvents, hiddenTypes]);

  const isCustom = presetId === "custom";
  // A half-picked range (start chosen, end pending) isn't a window yet.
  const customComplete = Boolean(customRange?.from && customRange?.to);
  const activePreset = PRESETS.find(p => p.id === presetId)!;

  const queryInput = useMemo(() => {
    if (isCustom && customRange?.from && customRange?.to) {
      return {
        rangeDays: null,
        range: {
          startDate: toLocalDateKey(customRange.from),
          endDate: toLocalDateKey(customRange.to),
        },
      };
    }
    return { rangeDays: activePreset.rangeDays };
  }, [isCustom, customRange, activePreset]);

  const query = trpc.history.dailySeries.useQuery(queryInput, {
    staleTime: 5 * 60_000,
    // Don't fire on a half-picked custom range; keep the last result on screen.
    enabled: !isCustom || customComplete,
  });

  // All analytics run in mL. Nothing here converts.
  const points: SeriesPoint[] = useMemo(() => {
    if (!query.data) return [];
    const { rows, startKey, endKey, todayKey } = query.data;
    return buildSeries(rows, { startKey, endKey, todayKey });
  }, [query.data]);

  const summary = useMemo(() => summarize(points), [points]);
  const trend = useMemo(() => computeTrend(points), [points]);

  // The single conversion step: mL -> display units, for the chart only.
  // The explicit null checks are load-bearing — convert(null) returns 0 in oz
  // mode but null in mL mode, so without them every gap becomes a zero bar
  // after toggling to fl oz.
  const chartData = useMemo(
    () =>
      points.map(p => ({
        dateKey: p.dateKey,
        isPartial: p.isPartial,
        isZero: p.isZero,
        totalMl: p.totalMl === null ? null : convert(p.totalMl),
        avg7: p.avg7 === null ? null : convert(p.avg7),
        avg30: p.avg30 === null ? null : convert(p.avg30),
      })),
    [points, convert]
  );

  // ---- Events ---------------------------------------------------------------
  const windowStart = query.data?.startKey;
  const windowEnd = query.data?.endKey;

  // The master toggle hides every marker on the chart. The list below still
  // honours only the category chips, because it is where events are managed.
  const chartHidden = useMemo(
    () => (showEvents ? hiddenTypes : new Set<EventType>(EVENT_TYPE_ORDER)),
    [showEvents, hiddenTypes]
  );

  const dayGroups = useMemo(
    () => (windowStart && windowEnd ? groupPointEvents(events, windowStart, windowEnd, chartHidden) : []),
    [events, windowStart, windowEnd, chartHidden]
  );
  const bands = useMemo(
    () => (windowStart && windowEnd ? rangeEventsInWindow(events, windowStart, windowEnd, chartHidden) : []),
    [events, windowStart, windowEnd, chartHidden]
  );
  const windowEvents = useMemo(
    () => (windowStart && windowEnd ? eventsInWindow(events, windowStart, windowEnd) : []),
    [events, windowStart, windowEnd]
  );
  const listedEvents = windowEvents.filter(e => !hiddenTypes.has(e.type));
  const countsByType = useMemo(() => {
    const counts: Partial<Record<EventType, number>> = {};
    for (const e of windowEvents) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [windowEvents]);

  // The chart's rendered width, so chip collisions can be judged in pixels.
  // A callback ref rather than useRef + useEffect: the chart only mounts after
  // the loading branches, and a callback ref re-attaches whenever it does.
  const [chartWidth, setChartWidth] = useState(900);
  const observerRef = useRef<ResizeObserver | null>(null);
  const chartBoxRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(entries => setChartWidth(entries[0].contentRect.width));
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  /**
   * Which lane row each chip goes in, keyed "day:<date>" or "band:<id>". A day
   * missing from the map gets no chip — just its hairline.
   *
   * Greedy two-row dodge: a chip takes the top row unless the previous top-row
   * chip is closer than CHIP_SPAN_PX, then the second row, and if both are
   * crowded, whichever row's last chip is further away.
   */
  const chipRows = useMemo(() => {
    const rows = new Map<string, number>();
    if (chartData.length === 0) return rows;

    const dense = chartData.length > DENSE_RANGE_DAYS;
    const indexOf = new Map(chartData.map((d, i) => [d.dateKey, i] as const));
    const pxPerDay = Math.max(0.5, (chartWidth - PLOT_INSET_PX) / chartData.length);

    const slots: Array<{ key: string; x: number }> = [];
    for (const group of dayGroups) {
      const maintenanceOnly = group.events.every(e => EVENT_CATEGORIES[e.type].recessive);
      if (dense && maintenanceOnly) continue;
      const i = indexOf.get(group.dateKey);
      if (i !== undefined) slots.push({ key: `day:${group.dateKey}`, x: (i + 0.5) * pxPerDay });
    }
    for (const band of bands) {
      const i = indexOf.get(band.x1);
      if (i !== undefined) slots.push({ key: `band:${band.event.id}`, x: i * pxPerDay + 12 });
    }
    slots.sort((a, b) => a.x - b.x);

    const lastX = [-Infinity, -Infinity];
    for (const slot of slots) {
      const row =
        slot.x - lastX[0] >= CHIP_SPAN_PX
          ? 0
          : slot.x - lastX[1] >= CHIP_SPAN_PX
            ? 1
            : lastX[0] <= lastX[1]
              ? 0
              : 1;
      rows.set(slot.key, row);
      lastX[row] = slot.x;
    }
    return rows;
  }, [chartData, chartWidth, dayGroups, bands]);

  // The lane exists only while there are chips to put in it, so hiding events
  // gives the space back to the plot.
  const laneShown = chipRows.size > 0;

  const openCreate = (dateKey?: string) => {
    setEditing(null);
    setDefaultDateKey(dateKey ?? query.data?.todayKey ?? toLocalDateKey(new Date()));
    setDialogOpen(true);
  };
  const openEdit = (event: ChartEvent) => {
    if (event.source !== "manual") return;
    setEditing(event);
    setDialogOpen(true);
  };
  const toggleType = (type: EventType) =>
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  /**
   * With dot={false} a non-null point flanked by nulls draws nothing, because a
   * line segment needs two points. Isolated days between outages would silently
   * vanish, so render a dot for exactly those.
   */
  const renderIsolatedDot = (props: any) => {
    const { cx, cy, index, dataKey, stroke } = props;
    const blank = <circle key={`${dataKey}-${index}`} r={0} />;
    if (cx == null || cy == null) return blank;
    if (chartData[index - 1]?.[dataKey as "avg7"] != null) return blank;
    if (chartData[index + 1]?.[dataKey as "avg7"] != null) return blank;
    return <circle key={`${dataKey}-${index}`} cx={cx} cy={cy} r={2} fill={stroke} />;
  };

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analysis</h1>
        <p className="text-muted-foreground mt-1">How daily water intake is trending over time</p>
      </div>
      <Button variant="outline" size="sm" onClick={toggleUnit} className="gap-1.5 text-xs">
        {unit === "ml" ? "mL" : "fl oz"}
      </Button>
    </div>
  );

  const presetRow = (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-lg bg-secondary p-1">
          {PRESETS.map(preset => (
            <Button
              key={preset.id}
              size="sm"
              variant="ghost"
              aria-pressed={presetId === preset.id}
              onClick={() => setPresetId(preset.id)}
              className={cn(
                "h-7 px-3 text-xs",
                presetId === preset.id && "bg-background shadow-sm"
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {isCustom && (
          <DateRangePicker
            range={customRange}
            onSelect={setCustomRange}
            disabled={date => date > new Date()}
            placeholder="Pick a date range"
          />
        )}
      </div>
      {summary.daysInRange > 0 && (
        <span className="text-xs text-muted-foreground">
          {summary.daysRecorded} of {summary.daysInRange} days with intake
          {summary.zeroDays > 0 && ` · ${summary.zeroDays} with none`}
          {summary.missingDays > 0 && ` · ${summary.missingDays} missing`}
        </span>
      )}
    </div>
  );

  // Custom selected but only half-picked: prompt rather than falling through to
  // the no-data card, which would read as "you have no history".
  if (isCustom && !customComplete) {
    return (
      <div className="space-y-6">
        {header}
        {presetRow}
        <Card className="glass-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <CalendarRange className="h-5 w-5" />
              <div>
                <p className="font-medium text-foreground">
                  {customRange?.from ? "Pick an end date" : "Pick a date range"}
                </p>
                <p className="text-sm mt-1">
                  {customRange?.from
                    ? "Choose the day the range should end on."
                    : "Choose a start and end date to analyse any window you like."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isLoading || query.isFetching) {
    return (
      <div className="space-y-6">
        {header}
        {presetRow}
        <Card className="glass-card">
          <CardContent className="pt-6 flex items-center justify-center h-[360px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-6">
        {header}
        <Card className="glass-card border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <div className="flex-1">
                <p className="font-medium">Couldn't load history</p>
                <p className="text-sm text-muted-foreground mt-1">{query.error.message}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (summary.daysRecorded === 0) {
    return (
      <div className="space-y-6">
        {header}
        {presetRow}
        <Card className="glass-card border-amber-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-medium">No historical data yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Data will appear here once your fountain starts syncing. Visit the Dashboard to
                  trigger a sync.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rangeLabel = `${summary.daysInRange} days`;
  // "over the last N days" is only true for a window ending today. A custom
  // range that ended in April needs naming, not a relative phrase.
  const endsToday = query.data ? query.data.endKey === query.data.todayKey : true;
  const periodPhrase =
    endsToday || !query.data
      ? `over the last ${rangeLabel}`
      : `from ${formatDateKey(query.data.startKey, { month: "short", day: "numeric" })} to ${formatDateKey(query.data.endKey, { month: "short", day: "numeric" })}`;
  const TrendIcon =
    trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend.direction === "up"
      ? "text-emerald-400"
      : trend.direction === "down"
        ? "text-red-400"
        : "text-muted-foreground";

  let headline: string;
  let subline: string;
  if (trend.direction === "insufficient") {
    headline = "Not enough data to call a trend yet";
    subline = `Comparing two halves of this range needs at least 5 recorded days in each. You have ${trend.priorDays} and ${trend.recentDays}.`;
  } else if (trend.percentChange === null) {
    // Baseline of zero: a percentage would be meaningless, so report direction only.
    headline = trend.direction === "up" ? `Up ${periodPhrase}` : `Holding steady ${periodPhrase}`;
    subline = `The earlier half averaged ${formatValue(trend.priorMean ?? 0)} ${unitLabel}/day, so there's no percentage to report.`;
  } else if (trend.direction === "flat") {
    headline = `Holding steady ${periodPhrase}`;
    subline = `Averaging ${formatValue(trend.recentMean!)} ${unitLabel}/day — about the same as the ${trend.priorDays} days before.`;
  } else {
    const pct = Math.abs(Math.round(trend.percentChange));
    headline = `${trend.direction === "up" ? "Up" : "Down"} ${pct}% ${periodPhrase}`;
    subline = `Averaging ${formatValue(trend.recentMean!)} ${unitLabel}/day, versus ${formatValue(trend.priorMean!)} ${unitLabel}/day before that.`;
  }

  const latestAvg7 = [...points].reverse().find(p => p.avg7 !== null)?.avg7 ?? null;
  const hasAnyAvg30 = points.some(p => p.avg30 !== null);

  return (
    <div className="space-y-6">
      {header}

      <Card className="glass-card glow-primary">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <TrendIcon className={cn("h-6 w-6 mt-0.5 shrink-0", trendColor)} />
            <div>
              <p className="text-2xl font-bold tracking-tight">{headline}</p>
              <p className="text-sm text-muted-foreground mt-1">{subline}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {presetRow}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Daily intake with rolling averages</CardTitle>
          <CardDescription>
            Days with no recorded data are left blank, and days where the fountain recorded no
            drinking at all — travel, or the fountain switched off — are excluded too. Both are
            left out of the averages rather than counted as zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Events toolbar: master toggle, one chip per category present in
              this range (doubling as the event legend), and add. */}
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                aria-pressed={showEvents}
                onClick={() => setShowEvents(s => !s)}
              >
                {showEvents ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {showEvents ? "Events shown" : "Events hidden"}
              </Button>
              {EVENT_TYPE_ORDER.filter(t => countsByType[t]).map(t => {
                const cat = EVENT_CATEGORIES[t];
                const Icon = cat.icon;
                const on = showEvents && !hiddenTypes.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    disabled={!showEvents}
                    onClick={() => toggleType(t)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border h-7 px-2.5 text-xs transition-colors",
                      on
                        ? "border-border bg-secondary/60 text-foreground"
                        : "border-border/40 text-muted-foreground/60 line-through decoration-muted-foreground/40",
                      !showEvents && "opacity-40 cursor-not-allowed no-underline"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: on ? cat.color : undefined }} />
                    {cat.label}
                    <span className="text-muted-foreground tabular-nums no-underline">
                      {countsByType[t]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => openCreate()}
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Add event
              </Button>
            </div>
          </div>

          <div className="h-[400px]" ref={chartBoxRef}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                // The extra top margin is the event lane: chips sit above the plot
                // so they never land on top of tall bars.
                margin={{ top: laneShown ? EVENT_LANE_HEIGHT + 4 : 10, right: 10, left: 10, bottom: 20 }}
                // Click any day to log an event on it, pre-filled.
                onClick={(state: any) => {
                  if (state?.activeLabel) openCreate(String(state.activeLabel));
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 250)" />
                <XAxis
                  dataKey="dateKey"
                  stroke="oklch(0.6 0.02 220)"
                  fontSize={11}
                  tickFormatter={(key: string) =>
                    formatDateKey(key, { month: "short", day: "numeric" })
                  }
                  minTickGap={28}
                  interval="preserveStartEnd"
                  label={{
                    value: "Day",
                    position: "insideBottom",
                    offset: -2,
                    style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 },
                  }}
                />
                <YAxis
                  stroke="oklch(0.6 0.02 220)"
                  fontSize={12}
                  label={{
                    value: unitLabel,
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "oklch(0.6 0.02 220)", fontSize: 11 },
                  }}
                />
                <Tooltip
                  cursor={{ fill: "oklch(0.3 0.01 250 / 35%)" }}
                  content={
                    <AnalysisTooltip
                      unit={unit}
                      unitLabel={unitLabel}
                      eventsForDay={(key: string) => eventsOnDay(events, key, chartHidden)}
                    />
                  }
                />
                {/* Below the plot now: the top is the event lane. */}
                <Legend
                  verticalAlign="bottom"
                  align="right"
                  height={28}
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  formatter={(value: string) => (
                    <span style={{ color: "oklch(0.65 0.02 220)" }}>{value}</span>
                  )}
                />

                {/* Range events (travel) as faint bands. JSX order is z-order in
                    Recharts 2.15 — isFront is declared but not consumed — so these
                    sit first, behind the bars. Must be direct children of the
                    chart: Recharts finds them by element type, so they cannot be
                    wrapped in a component. */}
                {bands.map(({ event, x1, x2 }) => (
                  <ReferenceArea
                    key={event.id}
                    x1={x1}
                    x2={x2}
                    fill={EVENT_CATEGORIES[event.type].color}
                    fillOpacity={0.1}
                    stroke="none"
                    ifOverflow="hidden"
                    label={
                      <EventMarkerLabel
                        events={[event]}
                        onSelect={openEdit}
                        inset={12}
                        row={chipRows.get(`band:${event.id}`) ?? 0}
                      />
                    }
                  />
                ))}

                {/* fill stays on the Bar as well as the Cells: the tooltip reads
                    entry.color from the Bar itself. */}
                <Bar
                  dataKey="totalMl"
                  name="Daily intake"
                  legendType="rect"
                  fill="oklch(0.6 0.12 210)"
                  fillOpacity={0.45}
                  radius={[2, 2, 0, 0]}
                  isAnimationActive={false}
                >
                  {chartData.map(d => (
                    <Cell
                      key={d.dateKey}
                      fill="oklch(0.6 0.12 210)"
                      fillOpacity={d.isPartial ? 0.15 : 0.45}
                      stroke={d.isPartial ? "oklch(0.6 0.12 210)" : undefined}
                      strokeDasharray={d.isPartial ? "3 2" : undefined}
                    />
                  ))}
                </Bar>

                {/* connectNulls={false} is what draws gaps as breaks rather than
                    bridging them. It is the Line default, but stated explicitly
                    because it is the point of the feature. */}
                <Line
                  type="monotone"
                  dataKey="avg7"
                  name="7-day average"
                  legendType="plainline"
                  stroke="oklch(0.75 0.1 175)"
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  connectNulls={false}
                  dot={renderIsolatedDot}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="avg30"
                  name="30-day average"
                  legendType="plainline"
                  stroke="oklch(0.65 0.15 195)"
                  strokeWidth={2.75}
                  connectNulls={false}
                  dot={renderIsolatedDot}
                  activeDot={{ r: 3.5 }}
                  isAnimationActive={false}
                />

                {/* Point events last, so their lines and chips sit on top. A day's
                    line takes the color of its most prominent event — a food
                    change on a maintenance day reads as a food change. */}
                {dayGroups.map(group => {
                  const lead =
                    group.events.find(e => !EVENT_CATEGORIES[e.type].recessive) ?? group.events[0];
                  const cat = EVENT_CATEGORIES[lead.type];
                  const row = chipRows.get(`day:${group.dateKey}`);
                  return (
                    <ReferenceLine
                      key={group.dateKey}
                      x={group.dateKey}
                      stroke={cat.color}
                      strokeOpacity={cat.recessive ? 0.45 : 0.85}
                      strokeWidth={cat.recessive ? 1 : 1.5}
                      strokeDasharray="3 3"
                      ifOverflow="hidden"
                      label={
                        row === undefined ? undefined : (
                          <EventMarkerLabel events={group.events} onSelect={openEdit} row={row} />
                        )
                      }
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {/* Only true when the window actually reaches today — a custom range
                ending in the past has no in-progress day to caveat. */}
            {points.some(p => p.isPartial) &&
              "Today is still in progress and is excluded from the averages and the trend. "}
            {!hasAnyAvg30 &&
              "The 30-day average appears once there are 18 recorded days to draw on."}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Droplets}
          label={`Average per day · ${rangeLabel}`}
          value={summary.meanMl === null ? null : formatValue(summary.meanMl)}
          unit={unitLabel}
        />
        <StatTile
          icon={Activity}
          label="7-day average (latest)"
          value={latestAvg7 === null ? null : formatValue(latestAvg7)}
          unit={unitLabel}
        />
        <StatTile
          icon={Trophy}
          label="Highest day"
          value={summary.bestDay === null ? null : formatValue(summary.bestDay.totalMl)}
          unit={unitLabel}
          sub={
            summary.bestDay
              ? formatDateKey(summary.bestDay.dateKey, { month: "short", day: "numeric" })
              : undefined
          }
        />
        <StatTile
          icon={CalendarCheck}
          label="Days with intake"
          value={`${summary.daysRecorded}`}
          unit={`of ${summary.daysInRange}`}
          sub={
            summary.zeroDays > 0
              ? `${summary.zeroDays} no-intake day${summary.zeroDays === 1 ? "" : "s"} excluded`
              : `${Math.round(summary.coveragePct)}% coverage`
          }
        />
      </div>

      <EventsPanel
        events={listedEvents}
        hiddenCount={windowEvents.length - listedEvents.length}
        onAdd={() => openCreate()}
        onEdit={openEdit}
      />

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDateKey={defaultDateKey}
        onSave={input => (editing ? updateEvent(editing.id, input) : addEvent(input))}
        onDelete={editing ? () => removeEvent(editing.id) : undefined}
      />
    </div>
  );
}
