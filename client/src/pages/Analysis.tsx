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
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  CalendarCheck,
  Droplets,
  Loader2,
  Minus,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useUnit } from "@/contexts/UnitContext";
import { buildSeries, summarize, computeTrend, type SeriesPoint } from "@shared/analytics";

const PRESETS = [
  { label: "30 days", rangeDays: 30 as number | null },
  { label: "90 days", rangeDays: 90 as number | null },
  { label: "All time", rangeDays: null as number | null },
];

/**
 * Format a "YYYY-MM-DD" key for display.
 *
 * Builds the Date from parts so it lands on *local* midnight. `new Date(key)`
 * would parse as UTC midnight and render as the previous day for anyone west of
 * UTC — the bug already present in Trends.tsx's formatDate.
 */
function formatDateKey(key: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", options);
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

function AnalysisTooltip({ active, payload, label, unit, unitLabel }: any) {
  if (!active || !payload?.length) return null;

  const isPartial = Boolean(payload[0]?.payload?.isPartial);

  // Recharts still emits an entry for null series values; without this filter a
  // gap day renders "NaN" in mL mode and throws on .toFixed in oz mode.
  const rows = payload
    .filter((entry: any) => entry.value != null && Number.isFinite(entry.value))
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
    <div className="bg-popover border border-border rounded-lg px-3 py-2 shadow-xl min-w-[180px]">
      <p className="text-xs text-muted-foreground">
        {formatDateKey(label, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </p>
      {rows.length === 0 ? (
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
  const [rangeDays, setRangeDays] = useState<number | null>(30);

  const query = trpc.history.dailySeries.useQuery({ rangeDays }, { staleTime: 5 * 60_000 });

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
        totalMl: p.totalMl === null ? null : convert(p.totalMl),
        avg7: p.avg7 === null ? null : convert(p.avg7),
        avg30: p.avg30 === null ? null : convert(p.avg30),
      })),
    [points, convert]
  );

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
      <div className="inline-flex items-center gap-1 rounded-lg bg-secondary p-1">
        {PRESETS.map(preset => (
          <Button
            key={preset.label}
            size="sm"
            variant="ghost"
            aria-pressed={rangeDays === preset.rangeDays}
            onClick={() => setRangeDays(preset.rangeDays)}
            className={cn(
              "h-7 px-3 text-xs",
              rangeDays === preset.rangeDays && "bg-background shadow-sm"
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {summary.daysInRange > 0 && (
        <span className="text-xs text-muted-foreground">
          {summary.daysRecorded} of {summary.daysInRange} days recorded
          {summary.daysRecorded < summary.daysInRange &&
            ` · ${summary.daysInRange - summary.daysRecorded} missing`}
        </span>
      )}
    </div>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        {header}
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
    headline =
      trend.direction === "up"
        ? `Up over the last ${rangeLabel}`
        : `Holding steady over the last ${rangeLabel}`;
    subline = `The earlier half averaged ${formatValue(trend.priorMean ?? 0)} ${unitLabel}/day, so there's no percentage to report.`;
  } else if (trend.direction === "flat") {
    headline = `Holding steady over the last ${rangeLabel}`;
    subline = `Averaging ${formatValue(trend.recentMean!)} ${unitLabel}/day — about the same as the ${trend.priorDays} days before.`;
  } else {
    const pct = Math.abs(Math.round(trend.percentChange));
    headline = `${trend.direction === "up" ? "Up" : "Down"} ${pct}% over the last ${rangeLabel}`;
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
            Days with no recorded data are left blank. They're excluded from the averages, not
            counted as zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
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
                  content={<AnalysisTooltip unit={unit} unitLabel={unitLabel} />}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  wrapperStyle={{ fontSize: 11, paddingBottom: 8 }}
                  formatter={(value: string) => (
                    <span style={{ color: "oklch(0.65 0.02 220)" }}>{value}</span>
                  )}
                />

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
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Today is still in progress and is excluded from the averages and the trend.
            {!hasAnyAvg30 &&
              " The 30-day average appears once there are 18 recorded days to draw on."}
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
          label="Days recorded"
          value={`${summary.daysRecorded}`}
          unit={`of ${summary.daysInRange}`}
          sub={`${Math.round(summary.coveragePct)}% coverage`}
        />
      </div>
    </div>
  );
}
