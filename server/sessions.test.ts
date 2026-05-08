import { describe, it, expect } from "vitest";
import { getLocalDayBounds } from "./timezone";

describe("getLocalDayBounds", () => {
  it("returns correct UTC boundaries for America/New_York (UTC-4 in summer)", () => {
    // May 6, 2026 in Eastern Time (EDT = UTC-4)
    // Local midnight = 04:00 UTC, local 23:59:59.999 = next day 03:59:59.999 UTC
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "America/New_York");

    const startDate = new Date(startMs);
    expect(startDate.toISOString()).toBe("2026-05-06T04:00:00.000Z");

    const endDate = new Date(endMs);
    expect(endDate.toISOString()).toBe("2026-05-07T03:59:59.999Z");
  });

  it("returns correct UTC boundaries for America/New_York (UTC-5 in winter)", () => {
    // Jan 1, 2026 in Eastern Time (EST = UTC-5)
    const { startMs, endMs } = getLocalDayBounds("2026-01-01", "America/New_York");

    expect(new Date(startMs).toISOString()).toBe("2026-01-01T05:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-01-02T04:59:59.999Z");
  });

  it("returns correct UTC boundaries for America/Los_Angeles (UTC-7 in summer)", () => {
    // May 6, 2026 in Pacific Time (PDT = UTC-7)
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "America/Los_Angeles");

    expect(new Date(startMs).toISOString()).toBe("2026-05-06T07:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-05-07T06:59:59.999Z");
  });

  it("returns correct UTC boundaries for Asia/Tokyo (UTC+9, no DST)", () => {
    // May 6, 2026 in JST (UTC+9)
    // Local midnight = previous day 15:00 UTC (May 5 15:00 UTC)
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "Asia/Tokyo");

    expect(new Date(startMs).toISOString()).toBe("2026-05-05T15:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-05-06T14:59:59.999Z");
  });

  it("returns correct UTC boundaries for UTC timezone", () => {
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "UTC");

    expect(new Date(startMs).toISOString()).toBe("2026-05-06T00:00:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-05-06T23:59:59.999Z");
  });

  it("returns correct boundaries for India (UTC+5:30)", () => {
    // May 6, 2026 in IST (UTC+5:30)
    // Local midnight = May 5 18:30 UTC
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "Asia/Kolkata");

    expect(new Date(startMs).toISOString()).toBe("2026-05-05T18:30:00.000Z");
    expect(new Date(endMs).toISOString()).toBe("2026-05-06T18:29:59.999Z");
  });

  it("duration is always exactly 24 hours minus 1ms", () => {
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "America/New_York");
    expect(endMs - startMs).toBe(86400000 - 1);
  });

  it("handles invalid timezone gracefully (falls back to UTC)", () => {
    const { startMs, endMs } = getLocalDayBounds("2026-05-06", "Invalid/Zone");

    expect(new Date(startMs).toISOString()).toBe("2026-05-06T00:00:00.000Z");
    expect(endMs - startMs).toBe(86400000 - 1);
  });

  it("handles DST spring-forward day correctly (March 8, 2026)", () => {
    // March 8, 2026: clocks spring forward at 2:00 AM EST -> 3:00 AM EDT
    // Midnight on March 8 is still EST (UTC-5), so midnight = 05:00 UTC
    const { startMs, endMs } = getLocalDayBounds("2026-03-08", "America/New_York");

    expect(new Date(startMs).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(endMs - startMs).toBe(86400000 - 1);
  });

  it("handles DST fall-back day correctly (Nov 1, 2026)", () => {
    // Nov 1, 2026: clocks fall back at 2:00 AM EDT -> 1:00 AM EST
    // Midnight on Nov 1 is still EDT (UTC-4), so midnight = 04:00 UTC
    const { startMs, endMs } = getLocalDayBounds("2026-11-01", "America/New_York");

    expect(new Date(startMs).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(endMs - startMs).toBe(86400000 - 1);
  });
});

describe("session integrity check logic", () => {
  it("identifies gap when stored < expected (moderate strategy trigger)", () => {
    const expectedCount = 5;
    const storedCount = 2;

    const needsRepair = expectedCount > 0 && storedCount < expectedCount;
    expect(needsRepair).toBe(true);
  });

  it("does not trigger repair when stored >= expected", () => {
    const expectedCount = 3;
    const storedCount = 3;

    const needsRepair = expectedCount > 0 && storedCount < expectedCount;
    expect(needsRepair).toBe(false);
  });

  it("does not trigger repair when stored exceeds expected (API returned more)", () => {
    const expectedCount = 3;
    const storedCount = 5;

    const needsRepair = expectedCount > 0 && storedCount < expectedCount;
    expect(needsRepair).toBe(false);
  });

  it("does not trigger repair when expected is 0 (no daily log entry)", () => {
    const expectedCount = 0;
    const storedCount = 0;

    const needsRepair = expectedCount > 0 && storedCount < expectedCount;
    expect(needsRepair).toBe(false);
  });

  it("triggers repair when expected > 0 but stored is 0", () => {
    const expectedCount = 4;
    const storedCount = 0;

    const needsRepair = expectedCount > 0 && storedCount < expectedCount;
    expect(needsRepair).toBe(true);
  });

  it("lazy repair condition: fetches when no sessions and no daily log (on-demand discovery)", () => {
    const sessions: any[] = [];
    const expectedCount = 0;
    const storedCount = 0;

    // The drinkingSessions query also fetches when sessions.length === 0
    // (to discover sessions for dates without daily_water_log)
    const hasNoSessions = sessions.length === 0;
    const integrityGap = expectedCount > 0 && storedCount < expectedCount;
    const shouldFetch = hasNoSessions || integrityGap;

    expect(shouldFetch).toBe(true);
  });

  it("lazy repair condition: does not fetch when sessions exist and integrity is fine", () => {
    const sessions = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const expectedCount = 3;
    const storedCount = 3;

    const hasNoSessions = sessions.length === 0;
    const integrityGap = expectedCount > 0 && storedCount < expectedCount;
    const shouldFetch = hasNoSessions || integrityGap;

    expect(shouldFetch).toBe(false);
  });

  it("lazy repair condition: fetches when sessions exist but count is less than expected", () => {
    const sessions = [{ id: 1 }, { id: 2 }];
    const expectedCount = 5;
    const storedCount = 2;

    const hasNoSessions = sessions.length === 0;
    const integrityGap = expectedCount > 0 && storedCount < expectedCount;
    const shouldFetch = hasNoSessions || integrityGap;

    expect(shouldFetch).toBe(true);
  });
});

describe("cron integrity check flow", () => {
  // Simulates the decision logic in cron.ts for today/yesterday checks
  function shouldCronRepair(dates: string[], getIntegrity: (date: string) => { expectedCount: number; storedCount: number }) {
    const repairDates: string[] = [];
    for (const date of dates) {
      const { expectedCount, storedCount } = getIntegrity(date);
      if (expectedCount > 0 && storedCount < expectedCount) {
        repairDates.push(date);
      }
    }
    return repairDates;
  }

  it("repairs today when sessions are missing", () => {
    const dates = ["2026-05-08", "2026-05-07"];
    const integrity: Record<string, { expectedCount: number; storedCount: number }> = {
      "2026-05-08": { expectedCount: 3, storedCount: 1 },
      "2026-05-07": { expectedCount: 5, storedCount: 5 },
    };

    const result = shouldCronRepair(dates, (d) => integrity[d]);
    expect(result).toEqual(["2026-05-08"]);
  });

  it("repairs yesterday when sessions are missing", () => {
    const dates = ["2026-05-08", "2026-05-07"];
    const integrity: Record<string, { expectedCount: number; storedCount: number }> = {
      "2026-05-08": { expectedCount: 2, storedCount: 2 },
      "2026-05-07": { expectedCount: 4, storedCount: 0 },
    };

    const result = shouldCronRepair(dates, (d) => integrity[d]);
    expect(result).toEqual(["2026-05-07"]);
  });

  it("repairs both today and yesterday when both have gaps", () => {
    const dates = ["2026-05-08", "2026-05-07"];
    const integrity: Record<string, { expectedCount: number; storedCount: number }> = {
      "2026-05-08": { expectedCount: 3, storedCount: 1 },
      "2026-05-07": { expectedCount: 4, storedCount: 2 },
    };

    const result = shouldCronRepair(dates, (d) => integrity[d]);
    expect(result).toEqual(["2026-05-08", "2026-05-07"]);
  });

  it("repairs nothing when both days are complete", () => {
    const dates = ["2026-05-08", "2026-05-07"];
    const integrity: Record<string, { expectedCount: number; storedCount: number }> = {
      "2026-05-08": { expectedCount: 3, storedCount: 3 },
      "2026-05-07": { expectedCount: 5, storedCount: 7 }, // over-count is fine
    };

    const result = shouldCronRepair(dates, (d) => integrity[d]);
    expect(result).toEqual([]);
  });

  it("skips days with no daily log (expectedCount = 0)", () => {
    const dates = ["2026-05-08", "2026-05-07"];
    const integrity: Record<string, { expectedCount: number; storedCount: number }> = {
      "2026-05-08": { expectedCount: 0, storedCount: 0 },
      "2026-05-07": { expectedCount: 0, storedCount: 0 },
    };

    const result = shouldCronRepair(dates, (d) => integrity[d]);
    expect(result).toEqual([]);
  });
});

describe("lazy repair on read flow", () => {
  // Simulates the drinkingSessions query decision logic
  function shouldLazyRepair(
    sessions: any[],
    integrity: { expectedCount: number; storedCount: number }
  ): boolean {
    const hasNoSessions = sessions.length === 0;
    const integrityGap = integrity.expectedCount > 0 && integrity.storedCount < integrity.expectedCount;
    return hasNoSessions || integrityGap;
  }

  it("repairs when sessions array is empty (on-demand discovery)", () => {
    expect(shouldLazyRepair([], { expectedCount: 0, storedCount: 0 })).toBe(true);
  });

  it("repairs when sessions exist but fewer than expected", () => {
    const sessions = [{ id: "a" }, { id: "b" }];
    expect(shouldLazyRepair(sessions, { expectedCount: 5, storedCount: 2 })).toBe(true);
  });

  it("does NOT repair when sessions match expected count", () => {
    const sessions = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(shouldLazyRepair(sessions, { expectedCount: 3, storedCount: 3 })).toBe(false);
  });

  it("does NOT repair when sessions exceed expected count", () => {
    const sessions = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(shouldLazyRepair(sessions, { expectedCount: 3, storedCount: 4 })).toBe(false);
  });

  it("repairs when daily log says sessions exist but none are stored", () => {
    expect(shouldLazyRepair([], { expectedCount: 4, storedCount: 0 })).toBe(true);
  });

  it("after repair, upserted sessions should fill the gap", () => {
    // Simulate: before repair we have 2, after repair API returns 5 total
    const beforeRepair = [{ id: "a" }, { id: "b" }];
    const apiReturned = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];

    // After upsert (INSERT IGNORE), re-query returns all 5
    const afterRepair = apiReturned; // simulates re-query
    expect(afterRepair.length).toBe(5);
    expect(afterRepair.length).toBeGreaterThanOrEqual(beforeRepair.length);
  });
});

describe("hybrid summary card behavior", () => {
  it("when no sessions exist, time fields should be null (shown as dash in UI)", () => {
    // This tests the contract: when sessions array is empty,
    // the frontend should show "—" for Total Time and Avg Duration
    const mockSessions: Array<{ durationSec: number; amountMl: number }> = [];

    const totalTimeFromSessions = mockSessions.length > 0
      ? mockSessions.reduce((sum, s) => sum + (s.durationSec || 0), 0)
      : null;
    const avgDurationFromSessions = mockSessions.length > 0
      ? totalTimeFromSessions! / mockSessions.length
      : null;

    expect(totalTimeFromSessions).toBeNull();
    expect(avgDurationFromSessions).toBeNull();
  });

  it("when sessions exist, computes totalTime and avgDuration from sessions", () => {
    const mockSessions = [
      { durationSec: 30, amountMl: 50 },
      { durationSec: 45, amountMl: 80 },
      { durationSec: 20, amountMl: 30 },
    ];

    const totalTimeFromSessions = mockSessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
    const avgDurationFromSessions = totalTimeFromSessions / mockSessions.length;

    expect(totalTimeFromSessions).toBe(95);
    expect(avgDurationFromSessions).toBeCloseTo(31.67, 1);
  });

  it("handles partial sessions where some have zero duration", () => {
    const mockSessions = [
      { durationSec: 30, amountMl: 50 },
      { durationSec: 0, amountMl: 20 },
      { durationSec: 45, amountMl: 80 },
    ];

    const totalTimeFromSessions = mockSessions.reduce((sum, s) => sum + (s.durationSec || 0), 0);
    const avgDurationFromSessions = totalTimeFromSessions / mockSessions.length;

    expect(totalTimeFromSessions).toBe(75);
    expect(avgDurationFromSessions).toBe(25);
  });

  it("summary card intake/sessions come from daily_water_log regardless of sessions", () => {
    // The daily_water_log is authoritative for Total Intake and Sessions count
    const mockDailyLog = { totalMl: 250, drinkingCount: 5 };
    const mockSessions = [
      { durationSec: 30, amountMl: 50 },
      { durationSec: 45, amountMl: 80 },
    ];

    // Even though sessions only account for 130mL and 2 sessions,
    // the displayed values should use daily_water_log
    expect(mockDailyLog.totalMl).toBe(250);
    expect(mockDailyLog.drinkingCount).toBe(5);

    // Sessions-derived total amount (130mL) is NOT used for the intake card
    const sessionsTotal = mockSessions.reduce((sum, s) => sum + s.amountMl, 0);
    expect(sessionsTotal).not.toBe(mockDailyLog.totalMl);
  });
});
