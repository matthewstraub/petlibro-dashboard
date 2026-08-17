import { describe, it, expect } from "vitest";
import {
  parseDailyHistory,
  parseMonthlyHistory,
  enumerateMonthKeys,
  monthKeyOf,
  isMonthKey,
  selectDaysToWrite,
  type BackfillDay,
} from "./backfill";

function day(dateKey: string, totalMl = 100): BackfillDay {
  return { dateKey, totalMl, drinkingCount: 5, avgDrinkDuration: 20, totalDrinkingTime: 100 };
}

/**
 * Shaped exactly like a real `dimension: "month"` response captured from a live
 * PLWF105 account on 2026-08-16: parallel arrays keyed by `xdate`, zeros for
 * days the fountain reported nothing.
 */
function monthResponse(
  monthKey: string,
  days: Array<{ day: number; ml: number; times: number; avgDur: number }>,
  daysInMonth = 31
) {
  const xdate: string[] = [];
  const waterIntake: number[] = [];
  const drinkTimes: number[] = [];
  const avgDrinkDuration: number[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const match = days.find(x => x.day === d);
    xdate.push(`${monthKey}-${String(d).padStart(2, "0")}`);
    waterIntake.push(match?.ml ?? 0);
    drinkTimes.push(match?.times ?? 0);
    avgDrinkDuration.push(match?.avgDur ?? 0);
  }

  return {
    legendData: ["Water Intake"],
    waterIntake,
    drinkTimes,
    avgDrinkDuration,
    xdate,
    totalMl: waterIntake.reduce((a, b) => a + b, 0),
    avgDrinkMl: 0,
    dailyAvgDrinkMl: 0,
  };
}

describe("month key helpers", () => {
  it("isMonthKey accepts YYYY-MM and rejects other shapes", () => {
    expect(isMonthKey("2026-03")).toBe(true);
    expect(isMonthKey("2026-12")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-3")).toBe(false);
    expect(isMonthKey("2026-03-01")).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });

  it("monthKeyOf extracts the month from a date key", () => {
    expect(monthKeyOf("2026-03-14")).toBe("2026-03");
  });

  it("enumerateMonthKeys is inclusive", () => {
    expect(enumerateMonthKeys("2026-02", "2026-05")).toEqual([
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });

  it("enumerateMonthKeys rolls over the year boundary", () => {
    expect(enumerateMonthKeys("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("enumerateMonthKeys returns a single month for an equal range", () => {
    expect(enumerateMonthKeys("2026-03", "2026-03")).toEqual(["2026-03"]);
  });

  it("enumerateMonthKeys returns empty for an inverted or malformed range", () => {
    expect(enumerateMonthKeys("2026-05", "2026-02")).toEqual([]);
    expect(enumerateMonthKeys("nonsense", "2026-02")).toEqual([]);
  });
});

/** Shaped like a real `dimension: "day"` response: 24 hourly buckets. */
function dayResponse(hours: Array<{ hour: number; ml: number; times: number }>) {
  const xdate: string[] = [];
  const waterIntake: number[] = [];
  const drinkTimes: number[] = [];
  for (let h = 0; h < 24; h++) {
    const match = hours.find(x => x.hour === h);
    xdate.push(`${String(h).padStart(2, "0")}:00`);
    waterIntake.push(match?.ml ?? 0);
    drinkTimes.push(match?.times ?? 0);
  }
  return { waterIntake, drinkTimes, avgDrinkDuration: new Array(24).fill(0), xdate, totalMl: 0 };
}

describe("parseDailyHistory", () => {
  it("returns all 24 hours, including quiet ones", () => {
    // Unlike a zero DAY, a quiet hour is a real observation about when the pet
    // drinks — that is precisely what the Time-of-Day chart is for.
    const hours = parseDailyHistory(dayResponse([{ hour: 8, ml: 42, times: 3 }]));

    expect(hours).toHaveLength(24);
    expect(hours[8]).toEqual({ hour: 8, totalMl: 42, drinkingCount: 3 });
    expect(hours[9]).toEqual({ hour: 9, totalMl: 0, drinkingCount: 0 });
  });

  it("keys the hour off xdate rather than the array index", () => {
    const data = dayResponse([{ hour: 3, ml: 10, times: 1 }]);
    // Response arrives offset — index 0 is 01:00, not 00:00.
    data.xdate = data.xdate.slice(1).concat("24:00");
    const hours = parseDailyHistory(data);

    expect(hours[0].hour).toBe(1);
    // "24:00" is not a valid hour and is dropped rather than wrapping to 0.
    expect(hours.some(h => h.hour === 0)).toBe(false);
    expect(hours).toHaveLength(23);
  });

  it("drops malformed and out-of-range hour labels", () => {
    const data = dayResponse([{ hour: 5, ml: 20, times: 2 }]);
    data.xdate[0] = "nonsense";
    data.xdate[1] = "99:00";
    const hours = parseDailyHistory(data);

    expect(hours).toHaveLength(22);
    expect(hours.find(h => h.hour === 5)?.totalMl).toBe(20);
  });

  it("de-duplicates a repeated hour", () => {
    const data = dayResponse([{ hour: 7, ml: 30, times: 2 }]);
    data.xdate[8] = "07:00";
    const hours = parseDailyHistory(data);

    expect(hours.filter(h => h.hour === 7)).toHaveLength(1);
  });

  it("coerces numeric strings", () => {
    const data = dayResponse([{ hour: 2, ml: 15, times: 1 }]);
    (data.waterIntake as any)[2] = "15.5";
    (data.drinkTimes as any)[2] = "1";
    const hours = parseDailyHistory(data);

    expect(hours[2].totalMl).toBeCloseTo(15.5, 5);
    expect(hours[2].drinkingCount).toBe(1);
  });

  it("returns 24 zeroed hours for a travel day", () => {
    const hours = parseDailyHistory(dayResponse([]));

    expect(hours).toHaveLength(24);
    expect(hours.every(h => h.totalMl === 0 && h.drinkingCount === 0)).toBe(true);
  });

  it("returns empty for null or shapeless responses", () => {
    expect(parseDailyHistory(null)).toEqual([]);
    expect(parseDailyHistory({} as any)).toEqual([]);
  });
});

describe("selectDaysToWrite", () => {
  const todayKey = "2026-08-16";

  it("writes days that have no existing row", () => {
    const result = selectDaysToWrite([day("2026-03-01"), day("2026-03-02")], {
      existing: new Set(),
      todayKey,
    });

    expect(result.toWrite.map(d => d.dateKey)).toEqual(["2026-03-01", "2026-03-02"]);
    expect(result.skippedExisting).toBe(0);
  });

  it("leaves existing rows alone by default", () => {
    const result = selectDaysToWrite([day("2026-03-01"), day("2026-03-02")], {
      existing: new Set(["2026-03-01"]),
      todayKey,
    });

    expect(result.toWrite.map(d => d.dateKey)).toEqual(["2026-03-02"]);
    expect(result.skippedExisting).toBe(1);
  });

  it("replaces existing rows when overwrite is set", () => {
    const result = selectDaysToWrite([day("2026-03-01"), day("2026-03-02")], {
      existing: new Set(["2026-03-01"]),
      todayKey,
      overwrite: true,
    });

    expect(result.toWrite).toHaveLength(2);
    expect(result.skippedExisting).toBe(0);
  });

  it("never writes today, because the day is still in progress", () => {
    const result = selectDaysToWrite([day("2026-08-15"), day(todayKey, 12)], {
      existing: new Set(),
      todayKey,
    });

    expect(result.toWrite.map(d => d.dateKey)).toEqual(["2026-08-15"]);
    expect(result.skippedToday).toBe(1);
  });

  it("never writes today even with overwrite set", () => {
    const result = selectDaysToWrite([day(todayKey, 12)], {
      existing: new Set(),
      todayKey,
      overwrite: true,
    });

    expect(result.toWrite).toEqual([]);
    expect(result.skippedToday).toBe(1);
  });

  it("does not write future days", () => {
    const result = selectDaysToWrite([day("2026-09-01")], { existing: new Set(), todayKey });
    expect(result.toWrite).toEqual([]);
  });

  it("is idempotent: a second run with the first run's output writes nothing", () => {
    const days = [day("2026-03-01"), day("2026-03-02")];
    const first = selectDaysToWrite(days, { existing: new Set(), todayKey });
    const afterFirst = new Set(first.toWrite.map(d => d.dateKey));

    const second = selectDaysToWrite(days, { existing: afterFirst, todayKey });
    expect(second.toWrite).toEqual([]);
    expect(second.skippedExisting).toBe(2);
  });
});

describe("parseMonthlyHistory", () => {
  it("maps a day's parallel array entries onto a daily row", () => {
    const data = monthResponse("2026-03", [{ day: 2, ml: 133, times: 11, avgDur: 42 }]);
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days).toHaveLength(1);
    expect(days[0]).toEqual({
      dateKey: "2026-03-02",
      totalMl: 133,
      drinkingCount: 11,
      avgDrinkDuration: 42,
      // total is recovered from the reported average: 11 * 42
      totalDrinkingTime: 462,
    });
  });

  it("omits zero days rather than writing them as zeros", () => {
    // A month where only three days reported anything.
    const data = monthResponse("2026-03", [
      { day: 1, ml: 85, times: 6, avgDur: 30 },
      { day: 2, ml: 133, times: 11, avgDur: 42 },
      { day: 15, ml: 90, times: 7, avgDur: 25 },
    ]);
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days.map(d => d.dateKey)).toEqual(["2026-03-01", "2026-03-02", "2026-03-15"]);
    // 31 days in the response, only 3 rows out — the rest stay absent so a sync
    // outage never masquerades as a day of no drinking.
    expect(days).toHaveLength(3);
  });

  it("keeps a day that recorded sessions but zero volume", () => {
    const data = monthResponse("2026-03", [{ day: 4, ml: 0, times: 2, avgDur: 12 }]);
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days).toHaveLength(1);
    expect(days[0].totalMl).toBe(0);
    expect(days[0].drinkingCount).toBe(2);
  });

  it("keys off xdate rather than the array index", () => {
    // A February response: 28 entries, so index-derived dates would drift.
    const data = monthResponse("2026-02", [{ day: 28, ml: 41, times: 2, avgDur: 20 }], 28);
    const days = parseMonthlyHistory(data, { monthKey: "2026-02" });

    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe("2026-02-28");
  });

  it("drops entries that fall outside the requested month", () => {
    const data = monthResponse("2026-03", [{ day: 1, ml: 85, times: 6, avgDur: 30 }]);
    data.xdate[0] = "2026-02-28"; // response spilling outside its month
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days).toHaveLength(0);
  });

  it("ignores malformed date entries", () => {
    const data = monthResponse("2026-03", [
      { day: 1, ml: 85, times: 6, avgDur: 30 },
      { day: 2, ml: 133, times: 11, avgDur: 42 },
    ]);
    data.xdate[0] = "not-a-date";
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days.map(d => d.dateKey)).toEqual(["2026-03-02"]);
  });

  it("de-duplicates repeated dates", () => {
    const data = monthResponse("2026-03", [
      { day: 1, ml: 85, times: 6, avgDur: 30 },
      { day: 2, ml: 133, times: 11, avgDur: 42 },
    ]);
    data.xdate[1] = "2026-03-01"; // same date twice
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe("2026-03-01");
  });

  it("coerces numeric strings, which MySQL-backed APIs often return", () => {
    const data = monthResponse("2026-03", [{ day: 1, ml: 85, times: 6, avgDur: 30 }]);
    (data.waterIntake as any)[0] = "85.5";
    (data.drinkTimes as any)[0] = "6";
    (data.avgDrinkDuration as any)[0] = "30";
    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });

    expect(days[0].totalMl).toBeCloseTo(85.5, 5);
    expect(days[0].drinkingCount).toBe(6);
    expect(days[0].totalDrinkingTime).toBe(180);
  });

  it("returns empty for an all-zero month, which is what pre-retention periods look like", () => {
    // Petlibro answers code 0 with all zeros for anything past ~170 days.
    const data = monthResponse("2025-06", [], 30);
    expect(parseMonthlyHistory(data, { monthKey: "2025-06" })).toEqual([]);
  });

  it("returns empty for null or empty responses", () => {
    expect(parseMonthlyHistory(null)).toEqual([]);
    expect(parseMonthlyHistory({} as any)).toEqual([]);
    expect(parseMonthlyHistory({ xdate: [], waterIntake: [] } as any)).toEqual([]);
  });

  it("survives arrays shorter than xdate", () => {
    const data = monthResponse("2026-03", [
      { day: 1, ml: 85, times: 6, avgDur: 30 },
      { day: 2, ml: 133, times: 11, avgDur: 42 },
    ]);
    data.waterIntake = data.waterIntake.slice(0, 1);
    data.drinkTimes = data.drinkTimes.slice(0, 1);
    data.avgDrinkDuration = data.avgDrinkDuration.slice(0, 1);

    const days = parseMonthlyHistory(data, { monthKey: "2026-03" });
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe("2026-03-01");
  });

  it("works without a monthKey filter", () => {
    const data = monthResponse("2026-03", [{ day: 1, ml: 85, times: 6, avgDur: 30 }]);
    expect(parseMonthlyHistory(data)).toHaveLength(1);
  });

  it("reproduces the observed February boundary month", () => {
    // Live capture: Feb 2026 held exactly one day, the 28th, at 41 mL —
    // the truncated tail of Petlibro's ~170-day retention window.
    const data = monthResponse("2026-02", [{ day: 28, ml: 41, times: 2, avgDur: 21 }], 28);
    const days: BackfillDay[] = parseMonthlyHistory(data, { monthKey: "2026-02" });

    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe("2026-02-28");
    expect(days[0].totalMl).toBe(41);
  });
});
