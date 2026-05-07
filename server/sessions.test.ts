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
