import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatDateKey, toDateKey } from "./dates";

/**
 * The bug these helpers exist to prevent is invisible in UTC — it only appears
 * when the viewer's zone is behind the zone the row's Date was built in. So the
 * suite pins a western zone rather than trusting whatever the machine runs in,
 * and asserts that the pin took effect.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "America/New_York";
});

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** A row dated 2026-08-16, as mysql2 builds it on a UTC server. */
const utcMidnight = new Date(Date.UTC(2026, 7, 16));

describe("test setup", () => {
  it("runs west of UTC, so a UTC-midnight Date lands on the previous day", () => {
    expect(utcMidnight.getTimezoneOffset()).toBe(240);
    expect(utcMidnight.getDate()).toBe(15);
  });
});

describe("toDateKey", () => {
  it("reads a Date's UTC parts", () => {
    expect(toDateKey(utcMidnight)).toBe("2026-08-16");
  });

  it("passes a key through unchanged", () => {
    expect(toDateKey("2026-08-16")).toBe("2026-08-16");
  });

  it("takes the date part of an ISO timestamp", () => {
    expect(toDateKey("2026-08-16T00:00:00.000Z")).toBe("2026-08-16");
  });
});

describe("formatDateKey", () => {
  it("formats a key as the day it names", () => {
    expect(formatDateKey("2026-08-16", { month: "short", day: "numeric" })).toBe("Aug 16");
  });

  it("does not shift the day the way new Date(key) does", () => {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    expect(new Date("2026-08-16").toLocaleDateString("en-US", options)).toBe("Aug 15");
    expect(formatDateKey("2026-08-16", options)).toBe("Aug 16");
  });

  it("holds across month and year boundaries", () => {
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    expect(formatDateKey("2026-09-01", options)).toBe("Sep 1");
    expect(formatDateKey("2027-01-01", options)).toBe("Jan 1");
  });

  it("labels a server-built Date with its own calendar day", () => {
    expect(formatDateKey(toDateKey(utcMidnight), { month: "short", day: "numeric" })).toBe("Aug 16");
    expect(
      formatDateKey(toDateKey(new Date(Date.UTC(2026, 8, 1))), { month: "short", day: "numeric" }),
    ).toBe("Sep 1");
  });
});
