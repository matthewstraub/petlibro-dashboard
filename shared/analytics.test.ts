import { describe, it, expect } from "vitest";
import {
  addDaysToKey,
  daysBetweenKeys,
  enumerateDateKeys,
  buildSeries,
  summarize,
  computeTrend,
  isDateKey,
  MAX_WINDOW_DAYS,
  type DailyRow,
  type SeriesPoint,
} from "./analytics";

/** Build consecutive daily rows starting at startKey, one per value. */
function rowsFrom(startKey: string, values: number[]): DailyRow[] {
  return values.map((totalMl, i) => ({ dateKey: addDaysToKey(startKey, i), totalMl }));
}

/** Build displayed points directly, for summary/trend tests. */
function pointsFrom(
  startKey: string,
  values: Array<number | null>,
  partialKey?: string
): SeriesPoint[] {
  return values.map((totalMl, i) => {
    const dateKey = addDaysToKey(startKey, i);
    return {
      dateKey,
      totalMl,
      avg7: null,
      avg30: null,
      isPartial: dateKey === partialKey,
      isZero: totalMl !== null && totalMl <= 0,
    };
  });
}

describe("date key arithmetic", () => {
  it("addDaysToKey crosses a month boundary", () => {
    expect(addDaysToKey("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("addDaysToKey crosses a year boundary", () => {
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("addDaysToKey handles February in a non-leap year", () => {
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("addDaysToKey handles February in a leap year", () => {
    expect(addDaysToKey("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDaysToKey("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("addDaysToKey computes the 29-day lead-in offset", () => {
    expect(addDaysToKey("2026-08-16", -(MAX_WINDOW_DAYS - 1))).toBe("2026-07-18");
  });

  it("addDaysToKey is unaffected by DST transitions", () => {
    // US spring-forward (Mar 8 2026) and fall-back (Nov 1 2026): UTC arithmetic
    // must still advance exactly one calendar day across both.
    expect(addDaysToKey("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDaysToKey("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToKey("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("addDaysToKey with zero returns the same key", () => {
    expect(addDaysToKey("2026-08-16", 0)).toBe("2026-08-16");
  });

  it("daysBetweenKeys counts whole days and signs the direction", () => {
    expect(daysBetweenKeys("2026-08-01", "2026-08-16")).toBe(15);
    expect(daysBetweenKeys("2026-08-16", "2026-08-16")).toBe(0);
    expect(daysBetweenKeys("2026-08-16", "2026-08-01")).toBe(-15);
  });

  it("daysBetweenKeys spans a DST transition without drift", () => {
    expect(daysBetweenKeys("2026-03-01", "2026-03-31")).toBe(30);
    expect(daysBetweenKeys("2026-10-15", "2026-11-15")).toBe(31);
  });

  it("enumerateDateKeys is dense and inclusive", () => {
    expect(enumerateDateKeys("2026-08-01", "2026-08-05")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("enumerateDateKeys returns a single key for a one-day range", () => {
    expect(enumerateDateKeys("2026-08-16", "2026-08-16")).toEqual(["2026-08-16"]);
  });

  it("enumerateDateKeys returns empty for an inverted range", () => {
    expect(enumerateDateKeys("2026-08-16", "2026-08-01")).toEqual([]);
  });

  it("isDateKey accepts YYYY-MM-DD and rejects everything else", () => {
    expect(isDateKey("2026-08-16")).toBe(true);
    expect(isDateKey("2026-8-16")).toBe(false);
    expect(isDateKey("2026-08-16T00:00:00Z")).toBe(false);
    expect(isDateKey(null)).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe("buildSeries", () => {
  it("returns one point per calendar day in the display range", () => {
    const rows = rowsFrom("2026-08-01", [100, 110, 120, 130, 150]);
    const series = buildSeries(rows, { startKey: "2026-08-01", endKey: "2026-08-05" });

    expect(series).toHaveLength(5);
    expect(series.map(p => p.dateKey)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
    expect(series.map(p => p.totalMl)).toEqual([100, 110, 120, 130, 150]);
  });

  it("computes a 7-day average equal to the mean of those seven days", () => {
    const rows = rowsFrom("2026-08-01", [100, 100, 100, 100, 100, 100, 100]);
    const series = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });

    expect(series[0].avg7).toBe(100);
  });

  it("averages the correct seven days when values differ", () => {
    // 08-01..08-07 = 10,20,30,40,50,60,70 -> mean 40
    const rows = rowsFrom("2026-08-01", [10, 20, 30, 40, 50, 60, 70]);
    const series = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });

    expect(series[0].avg7).toBe(40);
  });

  it("yields null for a 30-day window with only seven days of data", () => {
    const rows = rowsFrom("2026-08-01", [100, 100, 100, 100, 100, 100, 100]);
    const series = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });

    // 7 observations against a required 18 (ceil(30 * 0.6)) -> not enough
    expect(series[0].avg30).toBeNull();
  });

  it("marks a missing day as null without disturbing its neighbours", () => {
    const rows: DailyRow[] = [
      { dateKey: "2026-08-01", totalMl: 100 },
      // 2026-08-02 missing
      { dateKey: "2026-08-03", totalMl: 140 },
    ];
    const series = buildSeries(rows, { startKey: "2026-08-01", endKey: "2026-08-03" });

    expect(series.map(p => p.totalMl)).toEqual([100, null, 140]);
  });

  it("emits a value at exactly the minimum observation count", () => {
    // Window 08-01..08-07, 5 of 7 present, required = ceil(7 * 0.6) = 5
    const rows = rowsFrom("2026-08-01", [100, 100, 100, 100, 100]);
    const series = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });

    expect(series[0].avg7).toBe(100);
  });

  it("emits null one observation below the minimum", () => {
    // 4 of 7 present, required 5
    const rows = rowsFrom("2026-08-01", [100, 100, 100, 100]);
    const series = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });

    expect(series[0].avg7).toBeNull();
  });

  it("uses lead-in rows for the averages without plotting them", () => {
    // 14 days of data, but only the last 3 are displayed
    const rows = rowsFrom("2026-07-25", new Array(14).fill(200));
    const series = buildSeries(rows, { startKey: "2026-08-05", endKey: "2026-08-07" });

    expect(series).toHaveLength(3);
    expect(series[0].dateKey).toBe("2026-08-05");
    // The average is populated on the very first displayed day, which is only
    // possible if days before startKey were counted.
    expect(series[0].avg7).toBe(200);
  });

  it("plots today's value but keeps it out of the rolling averages", () => {
    const rows: DailyRow[] = [
      ...rowsFrom("2026-08-01", [100, 100, 100, 100, 100, 100, 100]),
      { dateKey: "2026-08-08", totalMl: 20 }, // today so far: incomplete
    ];
    const series = buildSeries(rows, {
      startKey: "2026-08-08",
      endKey: "2026-08-08",
      todayKey: "2026-08-08",
    });

    expect(series[0].totalMl).toBe(20);
    expect(series[0].isPartial).toBe(true);
    // Excluding the partial day, the window holds 6 complete days of 100
    expect(series[0].avg7).toBe(100);
  });

  it("marks only today as partial", () => {
    const rows = rowsFrom("2026-08-01", [100, 100, 100]);
    const series = buildSeries(rows, {
      startKey: "2026-08-01",
      endKey: "2026-08-03",
      todayKey: "2026-08-03",
    });

    expect(series.map(p => p.isPartial)).toEqual([false, false, true]);
  });

  it("collapses duplicate rows for one date instead of summing them", () => {
    const rows: DailyRow[] = [
      { dateKey: "2026-08-01", totalMl: 100 },
      { dateKey: "2026-08-01", totalMl: 120 },
    ];
    const series = buildSeries(rows, { startKey: "2026-08-01", endKey: "2026-08-01" });

    expect(series[0].totalMl).toBe(120);
  });

  it("ignores malformed rows", () => {
    const rows = [
      { dateKey: "2026-08-01", totalMl: 100 },
      { dateKey: "not-a-date", totalMl: 999 },
      { dateKey: "2026-08-02", totalMl: Number.NaN },
    ] as DailyRow[];
    const series = buildSeries(rows, { startKey: "2026-08-01", endKey: "2026-08-02" });

    expect(series.map(p => p.totalMl)).toEqual([100, null]);
  });

  it("returns an empty series for an inverted range", () => {
    const rows = rowsFrom("2026-08-01", [100, 100]);
    expect(buildSeries(rows, { startKey: "2026-08-05", endKey: "2026-08-01" })).toEqual([]);
  });

  it("returns nulls throughout when there is no data at all", () => {
    const series = buildSeries([], { startKey: "2026-08-01", endKey: "2026-08-03" });

    expect(series).toHaveLength(3);
    expect(series.every(p => p.totalMl === null && p.avg7 === null && p.avg30 === null)).toBe(true);
  });

  it("honours a custom minimum observation ratio", () => {
    // 2 of 7 present. Default ratio would reject; a 0.25 ratio requires only 2.
    const rows = rowsFrom("2026-08-06", [100, 100]);

    const strict = buildSeries(rows, { startKey: "2026-08-07", endKey: "2026-08-07" });
    expect(strict[0].avg7).toBeNull();

    const lenient = buildSeries(rows, {
      startKey: "2026-08-07",
      endKey: "2026-08-07",
      minObservationRatio: 0.25,
    });
    expect(lenient[0].avg7).toBe(100);
  });
});

describe("zero-intake days", () => {
  // A stored 0 means the fountain went unused — travel, or switched off. For a
  // resident pet that is absence, not a low reading, so it must not be averaged.
  it("marks a stored zero distinctly from a missing day", () => {
    const rows: DailyRow[] = [
      { dateKey: "2026-06-01", totalMl: 100 },
      { dateKey: "2026-06-02", totalMl: 0 },
      // 2026-06-03 absent entirely
    ];
    const series = buildSeries(rows, { startKey: "2026-06-01", endKey: "2026-06-03" });

    expect(series.map(p => p.totalMl)).toEqual([100, 0, null]);
    expect(series.map(p => p.isZero)).toEqual([false, true, false]);
  });

  it("keeps zero days out of the rolling average", () => {
    // Six real days at 100 plus one zero. The mean must stay 100, not 6/7 of it.
    const rows: DailyRow[] = [
      ...rowsFrom("2026-06-01", [100, 100, 100, 100, 100, 100]),
      { dateKey: "2026-06-07", totalMl: 0 },
    ];
    const series = buildSeries(rows, { startKey: "2026-06-07", endKey: "2026-06-07" });

    expect(series[0].avg7).toBe(100);
    expect(series[0].avg7).not.toBe(600 / 7);
  });

  it("breaks the line rather than flatlining at zero across a travel block", () => {
    // A full week away: no intake observations at all in the window.
    const rows = rowsFrom("2026-06-01", [0, 0, 0, 0, 0, 0, 0]);
    const series = buildSeries(rows, { startKey: "2026-06-07", endKey: "2026-06-07" });

    // Null, not 0 — the chart draws a gap instead of a line pinned to the axis.
    expect(series[0].avg7).toBeNull();
  });

  it("excludes zero days from the mean and the best day", () => {
    const points = pointsFrom("2026-06-01", [100, 0, 200]);
    const summary = summarize(points);

    expect(summary.meanMl).toBe(150);
    expect(summary.daysRecorded).toBe(2);
    expect(summary.zeroDays).toBe(1);
    expect(summary.totalMl).toBe(300);
  });

  it("counts zero days toward coverage but not toward intake days", () => {
    // 5 days: 2 with intake, 2 zeros, 1 missing.
    const points = pointsFrom("2026-06-01", [100, 0, 0, 200, null]);
    const summary = summarize(points);

    expect(summary.daysRecorded).toBe(2);
    expect(summary.zeroDays).toBe(2);
    expect(summary.missingDays).toBe(1);
    // Four of five days have a record, even though only two measured intake.
    expect(summary.coveragePct).toBe(80);
  });

  it("keeps zero days out of the trend comparison", () => {
    // Both halves genuinely average 100; the recent half just has travel in it.
    // Counting the zeros would invent a decline.
    const points = pointsFrom("2026-06-01", [
      ...new Array(10).fill(100),
      ...new Array(5).fill(100),
      ...new Array(5).fill(0),
    ]);
    const trend = computeTrend(points);

    expect(trend.recentMean).toBe(100);
    expect(trend.priorMean).toBe(100);
    expect(trend.direction).toBe("flat");
  });

  it("reports insufficient rather than a false trend when a half is all travel", () => {
    const points = pointsFrom("2026-06-01", [
      ...new Array(10).fill(100),
      ...new Array(10).fill(0),
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("insufficient");
    expect(trend.recentDays).toBe(0);
  });

  it("does not treat today's zero as a travel day", () => {
    // Today legitimately reads 0 early in the morning; it is already excluded
    // as partial, and must not also inflate the zero-day count.
    const points = pointsFrom("2026-06-01", [100, 100, 0], "2026-06-03");
    const summary = summarize(points);

    expect(summary.zeroDays).toBe(0);
    expect(summary.daysRecorded).toBe(2);
  });
});

describe("summarize", () => {
  it("reports coverage over the full range", () => {
    // 10 days, 8 recorded
    const points = pointsFrom("2026-08-01", [100, 100, null, 100, 100, 100, null, 100, 100, 100]);
    const summary = summarize(points);

    expect(summary.daysInRange).toBe(10);
    expect(summary.daysRecorded).toBe(8);
    expect(summary.coveragePct).toBe(80);
  });

  it("excludes missing days from the mean rather than counting them as zero", () => {
    const points = pointsFrom("2026-08-01", [100, null, 200]);
    const summary = summarize(points);

    // Mean of the two recorded days, not 300/3
    expect(summary.meanMl).toBe(150);
    expect(summary.totalMl).toBe(300);
  });

  it("excludes the partial day from the mean and total", () => {
    const points = pointsFrom("2026-08-01", [100, 200, 20], "2026-08-03");
    const summary = summarize(points);

    expect(summary.daysRecorded).toBe(2);
    expect(summary.meanMl).toBe(150);
    expect(summary.totalMl).toBe(300);
  });

  it("identifies the best day", () => {
    const points = pointsFrom("2026-08-01", [100, 250, 180]);
    const summary = summarize(points);

    expect(summary.bestDay).toEqual({ dateKey: "2026-08-02", totalMl: 250 });
  });

  it("returns null rather than NaN when nothing was recorded", () => {
    const points = pointsFrom("2026-08-01", [null, null, null]);
    const summary = summarize(points);

    expect(summary.meanMl).toBeNull();
    expect(summary.bestDay).toBeNull();
    expect(summary.totalMl).toBe(0);
    expect(summary.coveragePct).toBe(0);
  });

  it("handles an empty range without dividing by zero", () => {
    const summary = summarize([]);

    expect(summary.daysInRange).toBe(0);
    expect(summary.coveragePct).toBe(0);
    expect(summary.meanMl).toBeNull();
  });
});

describe("computeTrend", () => {
  it("reports a rising trend with the exact percentage", () => {
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(100),
      ...new Array(10).fill(120),
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("up");
    expect(trend.priorMean).toBe(100);
    expect(trend.recentMean).toBe(120);
    expect(trend.percentChange).toBeCloseTo(20, 10);
    expect(trend.priorDays).toBe(10);
    expect(trend.recentDays).toBe(10);
  });

  it("reports a falling trend", () => {
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(120),
      ...new Array(10).fill(100),
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("down");
    expect(trend.percentChange).toBeCloseTo(-16.666, 2);
  });

  it("calls a small change flat", () => {
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(100),
      ...new Array(10).fill(102),
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("flat");
    expect(trend.percentChange).toBeCloseTo(2, 10);
  });

  it("treats a change just past the threshold as a trend", () => {
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(100),
      ...new Array(10).fill(106),
    ]);

    expect(computeTrend(points).direction).toBe("up");
  });

  it("honours a custom flat threshold", () => {
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(100),
      ...new Array(10).fill(108),
    ]);

    expect(computeTrend(points, { flatThresholdPct: 20 }).direction).toBe("flat");
  });

  it("declines to call a trend when a half has too few recorded days", () => {
    // Recent half holds only 4 recorded days against a minimum of 5
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(100),
      ...new Array(4).fill(120),
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("insufficient");
    expect(trend.percentChange).toBeNull();
    expect(trend.recentDays).toBe(4);
  });

  it("declines to call a trend on an empty range", () => {
    expect(computeTrend([]).direction).toBe("insufficient");
  });

  it("declines to call a trend on a short range", () => {
    const points = pointsFrom("2026-08-01", [100, 110, 120, 130]);
    expect(computeTrend(points).direction).toBe("insufficient");
  });

  it("reports insufficient, not a divide-by-zero, when the earlier half is all zeros", () => {
    // Zeros are absence rather than measurement, so an all-zero half leaves
    // nothing to compare against. Previously this produced a percentage off a
    // zero baseline; now there is simply no baseline.
    const points = pointsFrom("2026-08-01", [
      ...new Array(10).fill(0),
      ...new Array(10).fill(100),
    ]);
    const trend = computeTrend(points);

    expect(trend.direction).toBe("insufficient");
    expect(trend.percentChange).toBeNull();
    expect(trend.priorDays).toBe(0);
  });

  it("ignores the partial day when comparing halves", () => {
    // Today reads low because the day is incomplete; it must not create a
    // downward trend on its own.
    const points = pointsFrom(
      "2026-08-01",
      [...new Array(10).fill(100), ...new Array(9).fill(100), 5],
      "2026-08-20"
    );
    const trend = computeTrend(points);

    expect(trend.direction).toBe("flat");
    expect(trend.recentMean).toBe(100);
    expect(trend.recentDays).toBe(9);
  });
});
