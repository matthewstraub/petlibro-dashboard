import { describe, it, expect, vi } from "vitest";
import { getLocalDateTime, getYesterdayLocal } from "./timezone";

describe("Timezone utilities", () => {
  it("getLocalDateTime returns valid date and hour for America/New_York", () => {
    const result = getLocalDateTime("America/New_York");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("getLocalDateTime returns valid date and hour for Asia/Tokyo", () => {
    const result = getLocalDateTime("Asia/Tokyo");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
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
    expect(yesterday < today).toBe(true);
  });

  it("getYesterdayLocal falls back gracefully for invalid timezone", () => {
    const result = getYesterdayLocal("Invalid/Timezone");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Timezone graceful fallback", () => {
  it("getLocalDateTime defaults to UTC for invalid timezone without crashing", () => {
    // This simulates what happens when timezone column is missing and defaults to empty
    const result = getLocalDateTime("");
    // Should not crash - falls back to UTC
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });

  it("getYesterdayLocal defaults to UTC for empty timezone without crashing", () => {
    const result = getYesterdayLocal("");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("timezone fallback value 'America/New_York' is valid", () => {
    const result = getLocalDateTime("America/New_York");
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.hour).toBeGreaterThanOrEqual(0);
    expect(result.hour).toBeLessThanOrEqual(23);
  });
});
