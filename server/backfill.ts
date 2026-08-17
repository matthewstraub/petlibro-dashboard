/**
 * Pure helpers for reconstructing daily history from the Petlibro
 * `/data/deviceDrinkWater/history` endpoint.
 *
 * No I/O — everything here is deterministic and unit-tested against a response
 * captured from a live PLWF105 account.
 */
import type { DrinkHistoryData } from "./petlibro-api";

/** One recovered day, shaped for `upsertDailyLog`. */
export interface BackfillDay {
  dateKey: string;
  totalMl: number;
  drinkingCount: number;
  totalDrinkingTime: number;
  avgDrinkDuration: number;
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Petlibro retains roughly 170 days of history; anything older comes back as a
 * well-formed all-zero response. Fetching a wider window than this is wasted
 * calls, so it bounds the default range.
 */
export const RETENTION_DAYS = 170;

export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && MONTH_KEY_PATTERN.test(value);
}

/** Coerce a value the API may hand back as a number or a numeric string. */
function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** The "YYYY-MM" a date key belongs to. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * Every "YYYY-MM" from startMonth to endMonth inclusive.
 * Returns [] if the range is inverted, so a caller can't loop forever.
 */
export function enumerateMonthKeys(startMonth: string, endMonth: string): string[] {
  if (!isMonthKey(startMonth) || !isMonthKey(endMonth) || startMonth > endMonth) return [];

  const keys: string[] = [];
  let [year, month] = startMonth.split("-").map(Number);

  while (true) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    keys.push(key);
    if (key === endMonth) break;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return keys;
}

/** One hour of a day, from a `dimension: "day"` response. */
export interface BackfillHour {
  hour: number;
  totalMl: number;
  drinkingCount: number;
}

/**
 * Turn one `dimension: "day"` response into per-hour rows.
 *
 * This is the genuine hourly breakdown. What the live sync has been storing in
 * `hourly_water_log` is the *cumulative day total* filed under whichever hour
 * the sync happened to run, so the Time-of-Day chart has been showing sync
 * timing rather than drinking behaviour.
 *
 * Hours come from the response's own `xdate` ("00:00".."23:00") rather than the
 * array index, for the same reason the monthly parser keys off dates: a short
 * or offset array cannot then shift every bucket.
 *
 * Unlike the daily parser, zero hours are KEPT. A quiet hour is a real
 * observation about when a pet drinks — the whole point of the chart — and
 * unlike a zero *day* it does not imply the pet was absent.
 */
export function parseDailyHistory(data: DrinkHistoryData | null): BackfillHour[] {
  if (!data) return [];

  const labels = Array.isArray(data.xdate) ? data.xdate : [];
  const intake = Array.isArray(data.waterIntake) ? data.waterIntake : [];
  const times = Array.isArray(data.drinkTimes) ? data.drinkTimes : [];

  const hours: BackfillHour[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (typeof label !== "string") continue;

    const match = /^(\d{1,2}):\d{2}$/.exec(label);
    if (!match) continue;
    const hour = Number(match[1]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || seen.has(hour)) continue;

    seen.add(hour);
    hours.push({
      hour,
      totalMl: toNumber(intake[i]),
      drinkingCount: Math.round(toNumber(times[i])),
    });
  }

  return hours;
}

/**
 * Decide which recovered days should actually be written.
 *
 * Two rules, both about not destroying good data:
 *  - Today is never written. The day is still in progress and the live sync
 *    owns it; a backfill would overwrite a growing total with a stale snapshot.
 *  - Days that already have a row are left alone unless `overwrite` is set, so
 *    a re-run is safe and the existing sync's values stay authoritative.
 */
export function selectDaysToWrite(
  days: BackfillDay[],
  options: { existing: Set<string> | ReadonlySet<string>; todayKey: string; overwrite?: boolean }
): { toWrite: BackfillDay[]; skippedExisting: number; skippedToday: number } {
  const { existing, todayKey, overwrite = false } = options;
  const toWrite: BackfillDay[] = [];
  let skippedExisting = 0;
  let skippedToday = 0;

  for (const day of days) {
    if (day.dateKey >= todayKey) {
      skippedToday++;
      continue;
    }
    if (!overwrite && existing.has(day.dateKey)) {
      skippedExisting++;
      continue;
    }
    toWrite.push(day);
  }

  return { toWrite, skippedExisting, skippedToday };
}

/**
 * Turn one `dimension: "month"` response into daily rows.
 *
 * Days are keyed off the response's own `xdate` array rather than computed from
 * the month, so a short month or an off-by-one on the API's side can't silently
 * shift every row.
 *
 * **Zero days are omitted, not written as zeros.** The API returns 0 both for
 * "the fountain reported nothing" and for "your cat genuinely drank nothing",
 * and those are indistinguishable here. Writing a 0 row would make a sync
 * outage look like a day of no drinking — exactly the confusion the Analysis
 * page's gap handling exists to avoid. A missing row stays missing.
 */
export function parseMonthlyHistory(
  data: DrinkHistoryData | null,
  options: { monthKey?: string } = {}
): BackfillDay[] {
  if (!data) return [];

  const dates = Array.isArray(data.xdate) ? data.xdate : [];
  const intake = Array.isArray(data.waterIntake) ? data.waterIntake : [];
  const times = Array.isArray(data.drinkTimes) ? data.drinkTimes : [];
  const durations = Array.isArray(data.avgDrinkDuration) ? data.avgDrinkDuration : [];

  const days: BackfillDay[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < dates.length; i++) {
    const dateKey = dates[i];
    if (typeof dateKey !== "string" || !DATE_KEY_PATTERN.test(dateKey)) continue;
    // Guard against a response whose xdate spills outside the month requested.
    if (options.monthKey && monthKeyOf(dateKey) !== options.monthKey) continue;
    if (seen.has(dateKey)) continue;

    const totalMl = toNumber(intake[i]);
    const drinkingCount = Math.round(toNumber(times[i]));
    const avgDrinkDuration = Math.round(toNumber(durations[i]));

    // No evidence the fountain recorded anything — leave the day absent.
    if (totalMl <= 0 && drinkingCount <= 0) continue;

    seen.add(dateKey);
    days.push({
      dateKey,
      totalMl,
      drinkingCount,
      avgDrinkDuration,
      // The API reports an average, not a total; recover the total so the
      // column matches what the live sync stores from `petEatingTime`.
      totalDrinkingTime: Math.round(drinkingCount * avgDrinkDuration),
    });
  }

  return days;
}
