import { describe, it, expect } from "vitest";
import { getDailyDetail, getHourlyLogsForDate } from "./db";

describe("Daily Detail endpoint", () => {
  it("getDailyDetail returns summary and hourly arrays", async () => {
    // Test with a date that likely has no data - should return null summary and empty hourly
    const result = await getDailyDetail(1, "2020-01-01");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("hourly");
    expect(Array.isArray(result.hourly)).toBe(true);
    // No data for this date, so summary should be null
    expect(result.summary).toBeNull();
    expect(result.hourly).toHaveLength(0);
  });

  it("getHourlyLogsForDate returns an array", async () => {
    const result = await getHourlyLogsForDate(1, "2020-01-01");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("getDailyDetail handles today's date without error", async () => {
    const today = new Date().toISOString().split("T")[0];
    const result = await getDailyDetail(1, today);
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("hourly");
    expect(Array.isArray(result.hourly)).toBe(true);
  });
});
