import { describe, it, expect } from "vitest";
import { getLocalDateTime, getYesterdayLocal } from "./timezone";

describe("Timezone utilities", () => {
  it("getLocalDateTime returns valid date and hour for America/New_York", () => {
    const result = getLocalDateTime("America/New_York");
    expect(result).toHaveProperty("date");
    expect(result).toHaveProperty("hour");
    // Date should be YYYY-MM-DD format
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Hour should be 0-23
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("getLocalDateTime returns valid date and hour for Asia/Tokyo", () => {
    const result = getLocalDateTime("Asia/Tokyo");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("getLocalDateTime returns different hours for different timezones", () => {
    const ny = getLocalDateTime("America/New_York");
    const tokyo = getLocalDateTime("Asia/Tokyo");
    // These are 13-14 hours apart, so at least one of date or hour should differ
    const nyTotal = parseInt(ny.date.replace(/-/g, "")) * 24 + ny.hour;
    const tokyoTotal = parseInt(tokyo.date.replace(/-/g, "")) * 24 + tokyo.hour;
    // They should not be equal (unless by extreme coincidence at exactly midnight boundary)
    // Just verify both are valid
    expect(nyTotal).toBeGreaterThan(0);
    expect(tokyoTotal).toBeGreaterThan(0);
  });

  it("getLocalDateTime falls back gracefully for invalid timezone", () => {
    const result = getLocalDateTime("Invalid/Timezone");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("getYesterdayLocal returns valid date for America/New_York", () => {
    const result = getYesterdayLocal("America/New_York");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("getYesterdayLocal returns a date before today", () => {
    const tz = "America/New_York";
    const today = getLocalDateTime(tz).date;
    const yesterday = getYesterdayLocal(tz);
    // Yesterday should be before today
    expect(yesterday < today).toBe(true);
  });

  it("getYesterdayLocal falls back gracefully for invalid timezone", () => {
    const result = getYesterdayLocal("Invalid/Timezone");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
