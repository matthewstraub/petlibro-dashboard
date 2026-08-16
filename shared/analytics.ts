/**
 * Pure analytics helpers for long-term daily consumption analysis.
 *
 * Everything here operates on "date keys" — plain "YYYY-MM-DD" strings — rather
 * than JS Date objects. Values arrive already formatted by MySQL, so no Date is
 * ever constructed from driver output and the usual timezone-shift bugs cannot
 * occur. Internal calendar arithmetic uses UTC, which is immune to DST.
 *
 * No imports, no I/O: every function is deterministic and unit-tested.
 */

/** A single day's recorded total, as returned by the database. */
export interface DailyRow {
  dateKey: string;
  totalMl: number;
}

/** One day of the displayed range, with rolling averages attached. */
export interface SeriesPoint {
  dateKey: string;
  /** null when no data was recorded for this day. */
  totalMl: number | null;
  avg7: number | null;
  avg30: number | null;
  /** True only for the current local day, whose row is always incomplete. */
  isPartial: boolean;
}

export interface RangeSummary {
  daysInRange: number;
  daysRecorded: number;
  coveragePct: number;
  /** Mean of recorded, non-partial days. null when nothing was recorded. */
  meanMl: number | null;
  totalMl: number;
  bestDay: { dateKey: string; totalMl: number } | null;
}

export interface TrendVerdict {
  direction: "up" | "down" | "flat" | "insufficient";
  percentChange: number | null;
  recentMean: number | null;
  priorMean: number | null;
  recentDays: number;
  priorDays: number;
}

export interface BuildSeriesOptions {
  startKey: string;
  endKey: string;
  /** The user's current local day. Its value is plotted but never averaged. */
  todayKey?: string;
  /** Trailing window sizes, in calendar days. Defaults to [7, 30]. */
  windows?: [number, number];
  /**
   * Fraction of a window's calendar days that must have data before the window
   * yields a value. Below this, the average would describe a different, sparser
   * period than it claims to, so we emit null instead.
   */
  minObservationRatio?: number;
}

export interface ComputeTrendOptions {
  /** Below this magnitude a change is reported as "flat" rather than a trend. */
  flatThresholdPct?: number;
  /** Each half needs at least this many recorded days to support a verdict. */
  minHalfDays?: number;
}

const MS_PER_DAY = 86400000;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_WINDOWS: [number, number] = [7, 30];
export const DEFAULT_MIN_OBSERVATION_RATIO = 0.6;
export const DEFAULT_FLAT_THRESHOLD_PCT = 5;
export const DEFAULT_MIN_HALF_DAYS = 5;

/** Widest trailing window, i.e. how many days of lead-in data a query needs. */
export const MAX_WINDOW_DAYS = Math.max(...DEFAULT_WINDOWS);

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_PATTERN.test(value);
}

function keyToUtcMs(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function utcMsToKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getUTCFullYear().toString().padStart(4, "0");
  const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Shift a date key by a whole number of calendar days.
 * Uses UTC arithmetic so DST transitions never add or drop a day.
 */
export function addDaysToKey(dateKey: string, days: number): string {
  return utcMsToKey(keyToUtcMs(dateKey) + days * MS_PER_DAY);
}

/** Whole days from startKey to endKey. Negative when endKey precedes startKey. */
export function daysBetweenKeys(startKey: string, endKey: string): number {
  return Math.round((keyToUtcMs(endKey) - keyToUtcMs(startKey)) / MS_PER_DAY);
}

/** Every date key from startKey to endKey inclusive. Empty if the range is inverted. */
export function enumerateDateKeys(startKey: string, endKey: string): string[] {
  const span = daysBetweenKeys(startKey, endKey);
  if (span < 0) return [];

  const keys: string[] = [];
  let ms = keyToUtcMs(startKey);
  for (let i = 0; i <= span; i++) {
    keys.push(utcMsToKey(ms));
    ms += MS_PER_DAY;
  }
  return keys;
}

/**
 * Build a dense per-day series over [startKey, endKey] with trailing rolling
 * averages attached.
 *
 * `rows` should span an extra MAX_WINDOW_DAYS - 1 days behind startKey so the
 * averages are populated from the first displayed day rather than ramping up.
 * Rows outside the display range feed the math but produce no SeriesPoint.
 *
 * Rolling windows are measured in *calendar* days, not in rows: a gap must not
 * silently stretch a "7-day" average across twelve days of real time.
 */
export function buildSeries(rows: DailyRow[], options: BuildSeriesOptions): SeriesPoint[] {
  const {
    startKey,
    endKey,
    todayKey,
    windows = DEFAULT_WINDOWS,
    minObservationRatio = DEFAULT_MIN_OBSERVATION_RATIO,
  } = options;

  // Duplicate rows for one date are two snapshots of the same cumulative
  // counter, not two separate amounts, so the largest is the correct one —
  // summing would double-count. Taking the max also makes this independent of
  // row order, unlike last-write-wins. The SQL layer already collapses
  // duplicates the same way; this is the backstop for any other caller.
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!isDateKey(row.dateKey) || !Number.isFinite(row.totalMl)) continue;
    const existing = byDate.get(row.dateKey);
    if (existing === undefined || row.totalMl > existing) {
      byDate.set(row.dateKey, row.totalMl);
    }
  }

  const [shortWindow, longWindow] = windows;

  /** Mean of recorded days in the `size` calendar days ending at dateKey. */
  const trailingAverage = (dateKey: string, size: number): number | null => {
    const required = Math.ceil(size * minObservationRatio);
    let sum = 0;
    let count = 0;

    for (let back = 0; back < size; back++) {
      const key = addDaysToKey(dateKey, -back);
      // Today's row is incomplete; letting it into a trailing average would
      // drag every window down for the rest of the day.
      if (key === todayKey) continue;
      const value = byDate.get(key);
      if (value !== undefined) {
        sum += value;
        count++;
      }
    }

    if (count === 0 || count < required) return null;
    return sum / count;
  };

  return enumerateDateKeys(startKey, endKey).map(dateKey => {
    const recorded = byDate.get(dateKey);
    return {
      dateKey,
      totalMl: recorded === undefined ? null : recorded,
      avg7: trailingAverage(dateKey, shortWindow),
      avg30: trailingAverage(dateKey, longWindow),
      isPartial: dateKey === todayKey,
    };
  });
}

/** Recorded, complete days — the basis for every summary statistic. */
function completePoints(points: SeriesPoint[]): Array<{ dateKey: string; totalMl: number }> {
  const result: Array<{ dateKey: string; totalMl: number }> = [];
  for (const point of points) {
    if (point.totalMl !== null && !point.isPartial) {
      result.push({ dateKey: point.dateKey, totalMl: point.totalMl });
    }
  }
  return result;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Summarise the displayed range. Missing days are excluded from the mean rather
 * than counted as zero — a sync outage should not read as a cat that stopped
 * drinking — and coverage is reported so the gap is visible.
 */
export function summarize(points: SeriesPoint[]): RangeSummary {
  const complete = completePoints(points);
  const daysInRange = points.length;
  const daysRecorded = complete.length;

  let bestDay: { dateKey: string; totalMl: number } | null = null;
  for (const day of complete) {
    if (!bestDay || day.totalMl > bestDay.totalMl) bestDay = day;
  }

  return {
    daysInRange,
    daysRecorded,
    coveragePct: daysInRange === 0 ? 0 : (daysRecorded / daysInRange) * 100,
    meanMl: mean(complete.map(d => d.totalMl)),
    totalMl: complete.reduce((sum, d) => sum + d.totalMl, 0),
    bestDay,
  };
}

/**
 * Compare the second half of the range against the first.
 *
 * Split-half rather than a regression slope: the resulting number is exactly the
 * one the accompanying sentence claims ("averaged X, versus Y before"), it needs
 * no evenly spaced observations so gaps cost nothing, and a reader can check it
 * by eye against the chart.
 */
export function computeTrend(
  points: SeriesPoint[],
  options: ComputeTrendOptions = {}
): TrendVerdict {
  const {
    flatThresholdPct = DEFAULT_FLAT_THRESHOLD_PCT,
    minHalfDays = DEFAULT_MIN_HALF_DAYS,
  } = options;

  const insufficient = (recentDays = 0, priorDays = 0): TrendVerdict => ({
    direction: "insufficient",
    percentChange: null,
    recentMean: null,
    priorMean: null,
    recentDays,
    priorDays,
  });

  if (points.length === 0) return insufficient();

  // Split on the calendar midpoint of the range, not on the midpoint of the
  // recorded days, so each half covers an equal span of real time.
  const midpointIndex = Math.floor(points.length / 2);
  const prior = completePoints(points.slice(0, midpointIndex));
  const recent = completePoints(points.slice(midpointIndex));

  if (prior.length < minHalfDays || recent.length < minHalfDays) {
    return insufficient(recent.length, prior.length);
  }

  const priorMean = mean(prior.map(d => d.totalMl))!;
  const recentMean = mean(recent.map(d => d.totalMl))!;

  // A zero baseline has no meaningful percentage change to report.
  if (priorMean === 0) {
    return {
      direction: recentMean > 0 ? "up" : "flat",
      percentChange: null,
      recentMean,
      priorMean,
      recentDays: recent.length,
      priorDays: prior.length,
    };
  }

  const percentChange = ((recentMean - priorMean) / priorMean) * 100;
  const direction =
    Math.abs(percentChange) < flatThresholdPct ? "flat" : percentChange > 0 ? "up" : "down";

  return {
    direction,
    percentChange,
    recentMean,
    priorMean,
    recentDays: recent.length,
    priorDays: prior.length,
  };
}
