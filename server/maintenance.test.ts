import { describe, it, expect } from "vitest";
import { maintenanceEventsFromRealInfo, resetDateKey } from "./maintenance";

// Observed live from realInfo on 2026-08-16 (PLWF105, America/New_York):
// filterStartWorkingTime and machineCleaningTime were both this value —
// 2026-08-15T04:00:00Z, i.e. local midnight on Aug 15 in EDT.
const AUG_15_NY_MIDNIGHT = 1786766400000;
const NOW = Date.UTC(2026, 9, 19, 12); // 2026-10-19

describe("resetDateKey", () => {
  it("reads the observed timestamp as the local day it was stored for", () => {
    expect(resetDateKey(AUG_15_NY_MIDNIGHT, "America/New_York", NOW)).toBe("2026-08-15");
  });

  it("needs the user's zone east of UTC, where UTC would be a day early", () => {
    // Tokyo local midnight on Aug 15 is 15:00 UTC on Aug 14.
    const tokyoMidnight = Date.UTC(2026, 7, 14, 15);
    expect(resetDateKey(tokyoMidnight, "Asia/Tokyo", NOW)).toBe("2026-08-15");
    expect(resetDateKey(tokyoMidnight, "UTC", NOW)).toBe("2026-08-14");
  });

  it("ignores missing, zero, and non-numeric values", () => {
    for (const bad of [undefined, null, 0, Number.NaN, "1786766400000", {}]) {
      expect(resetDateKey(bad, "America/New_York", NOW)).toBeNull();
    }
  });

  it("ignores implausibly old values", () => {
    expect(resetDateKey(Date.UTC(2010, 0, 1), "America/New_York", NOW)).toBeNull();
  });

  it("ignores a reset in the future, beyond a day of clock skew", () => {
    expect(resetDateKey(NOW + 3 * 86400000, "America/New_York", NOW)).toBeNull();
    expect(resetDateKey(NOW + 3600000, "America/New_York", NOW)).not.toBeNull();
  });

  it("falls back to the UTC date for an invalid zone rather than dropping the event", () => {
    expect(resetDateKey(AUG_15_NY_MIDNIGHT, "Not/AZone", NOW)).toBe("2026-08-15");
  });
});

describe("maintenanceEventsFromRealInfo", () => {
  it("produces one filter and one cleaning event from a snapshot", () => {
    const events = maintenanceEventsFromRealInfo(
      { filterStartWorkingTime: AUG_15_NY_MIDNIGHT, machineCleaningTime: AUG_15_NY_MIDNIGHT },
      "America/New_York",
      NOW
    );
    expect(events.map(e => [e.type, e.startDate, e.externalKey])).toEqual([
      ["filter", "2026-08-15", "filter:2026-08-15"],
      ["cleaning", "2026-08-15", "cleaning:2026-08-15"],
    ]);
  });

  it("keys on the reset day, so the same snapshot every 4 hours dedupes to one marker", () => {
    const a = maintenanceEventsFromRealInfo({ filterStartWorkingTime: AUG_15_NY_MIDNIGHT }, "America/New_York", NOW);
    const b = maintenanceEventsFromRealInfo({ filterStartWorkingTime: AUG_15_NY_MIDNIGHT }, "America/New_York", NOW);
    expect(a[0].externalKey).toBe(b[0].externalKey);
  });

  it("gives a new reset a new key, so it becomes a new marker", () => {
    const later = AUG_15_NY_MIDNIGHT + 14 * 86400000;
    const [first] = maintenanceEventsFromRealInfo({ filterStartWorkingTime: AUG_15_NY_MIDNIGHT }, "America/New_York", NOW);
    const [second] = maintenanceEventsFromRealInfo({ filterStartWorkingTime: later }, "America/New_York", NOW);
    expect(second.externalKey).toBe("filter:2026-08-29");
    expect(second.externalKey).not.toBe(first.externalKey);
  });

  it("records only what the snapshot has", () => {
    const events = maintenanceEventsFromRealInfo({ machineCleaningTime: AUG_15_NY_MIDNIGHT }, "America/New_York", NOW);
    expect(events.map(e => e.type)).toEqual(["cleaning"]);
  });

  it("returns nothing for a missing snapshot", () => {
    expect(maintenanceEventsFromRealInfo(null, "America/New_York", NOW)).toEqual([]);
    expect(maintenanceEventsFromRealInfo({}, "America/New_York", NOW)).toEqual([]);
  });
});
