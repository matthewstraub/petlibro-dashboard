import { describe, it, expect } from "vitest";
import {
  eventsInWindow,
  eventsOnDay,
  groupPointEvents,
  isRealDateKey,
  rangeEventsInWindow,
  validateManualEvent,
  type ChartEvent,
  type EventType,
} from "./events";

let seq = 0;
function ev(type: EventType, startDate: string, endDate?: string): ChartEvent {
  return {
    id: `e${++seq}`,
    type,
    source: type === "filter" || type === "cleaning" ? "petlibro" : "manual",
    startDate,
    endDate,
    title: `${type} ${startDate}`,
  };
}

describe("groupPointEvents", () => {
  it("groups same-day events into one marker", () => {
    // Filter and cleaning are usually reset together — one marker, not two
    // lines drawn over each other.
    const groups = groupPointEvents(
      [ev("filter", "2026-08-15"), ev("cleaning", "2026-08-15"), ev("vet", "2026-08-20")],
      "2026-08-01",
      "2026-08-31"
    );
    expect(groups.map(g => [g.dateKey, g.events.length])).toEqual([
      ["2026-08-15", 2],
      ["2026-08-20", 1],
    ]);
  });

  it("sorts by date regardless of input order", () => {
    const groups = groupPointEvents(
      [ev("vet", "2026-08-20"), ev("food", "2026-08-02")],
      "2026-08-01",
      "2026-08-31"
    );
    expect(groups.map(g => g.dateKey)).toEqual(["2026-08-02", "2026-08-20"]);
  });

  it("drops events outside the window, inclusive at both ends", () => {
    const groups = groupPointEvents(
      [ev("vet", "2026-07-31"), ev("vet", "2026-08-01"), ev("vet", "2026-08-31"), ev("vet", "2026-09-01")],
      "2026-08-01",
      "2026-08-31"
    );
    expect(groups.map(g => g.dateKey)).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("leaves range events to the band renderer", () => {
    expect(groupPointEvents([ev("travel", "2026-08-05", "2026-08-10")], "2026-08-01", "2026-08-31")).toEqual([]);
  });

  it("honours hidden types", () => {
    const groups = groupPointEvents(
      [ev("filter", "2026-08-15"), ev("cleaning", "2026-08-15")],
      "2026-08-01",
      "2026-08-31",
      new Set<EventType>(["filter"])
    );
    expect(groups[0].events.map(e => e.type)).toEqual(["cleaning"]);
  });
});

describe("rangeEventsInWindow", () => {
  it("clips a trip that straddles the window start", () => {
    const [band] = rangeEventsInWindow([ev("travel", "2026-06-18", "2026-07-15")], "2026-07-01", "2026-07-31");
    expect([band.x1, band.x2]).toEqual(["2026-07-01", "2026-07-15"]);
  });

  it("clips a trip that runs past the window end", () => {
    const [band] = rangeEventsInWindow([ev("travel", "2026-07-20", "2026-08-10")], "2026-07-01", "2026-07-31");
    expect([band.x1, band.x2]).toEqual(["2026-07-20", "2026-07-31"]);
  });

  it("drops a trip entirely outside the window", () => {
    expect(rangeEventsInWindow([ev("travel", "2026-05-01", "2026-05-10")], "2026-07-01", "2026-07-31")).toEqual([]);
  });

  it("ignores point events", () => {
    expect(rangeEventsInWindow([ev("vet", "2026-07-05")], "2026-07-01", "2026-07-31")).toEqual([]);
  });
});

describe("eventsOnDay", () => {
  it("includes point events on the day and ranges covering it", () => {
    const events = [ev("vet", "2026-07-05"), ev("travel", "2026-07-01", "2026-07-10"), ev("food", "2026-07-06")];
    expect(eventsOnDay(events, "2026-07-05").map(e => e.type).sort()).toEqual(["travel", "vet"]);
  });

  it("treats a range's last day as covered", () => {
    expect(eventsOnDay([ev("travel", "2026-07-01", "2026-07-10")], "2026-07-10")).toHaveLength(1);
    expect(eventsOnDay([ev("travel", "2026-07-01", "2026-07-10")], "2026-07-11")).toHaveLength(0);
  });

  it("honours hidden types", () => {
    expect(eventsOnDay([ev("vet", "2026-07-05")], "2026-07-05", new Set<EventType>(["vet"]))).toEqual([]);
  });
});

describe("eventsInWindow", () => {
  it("returns overlapping events newest first", () => {
    const list = eventsInWindow(
      [ev("vet", "2026-07-05"), ev("food", "2026-07-20"), ev("travel", "2026-06-25", "2026-07-02")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(list.map(e => e.startDate)).toEqual(["2026-07-20", "2026-07-05", "2026-06-25"]);
  });
});

describe("isRealDateKey", () => {
  it("accepts real days and rejects impossible ones", () => {
    expect(isRealDateKey("2026-02-28")).toBe(true);
    expect(isRealDateKey("2024-02-29")).toBe(true);
    expect(isRealDateKey("2026-02-29")).toBe(false);
    expect(isRealDateKey("2026-02-30")).toBe(false);
    expect(isRealDateKey("2026-13-01")).toBe(false);
    expect(isRealDateKey("2026-1-01")).toBe(false);
    expect(isRealDateKey(undefined)).toBe(false);
  });
});

describe("validateManualEvent", () => {
  const ok = { type: "vet" as EventType, startDate: "2026-09-22", title: "Dental cleaning" };

  it("accepts a valid point event", () => {
    expect(validateManualEvent(ok)).toBeNull();
  });

  it("accepts a valid trip", () => {
    expect(
      validateManualEvent({ type: "travel", startDate: "2026-06-18", endDate: "2026-07-15", title: "Away" })
    ).toBeNull();
  });

  it("refuses Petlibro-only types — those come from the fountain", () => {
    expect(validateManualEvent({ ...ok, type: "filter" })).toMatch(/can't be created/);
    expect(validateManualEvent({ ...ok, type: "cleaning" })).toMatch(/can't be created/);
  });

  it("refuses an unknown type", () => {
    expect(validateManualEvent({ ...ok, type: "party" as EventType })).not.toBeNull();
  });

  it("requires a non-blank title", () => {
    expect(validateManualEvent({ ...ok, title: "   " })).toMatch(/title/);
  });

  it("caps title and note length", () => {
    expect(validateManualEvent({ ...ok, title: "x".repeat(201) })).toMatch(/title/);
    expect(validateManualEvent({ ...ok, note: "x".repeat(2001) })).toMatch(/note/);
    expect(validateManualEvent({ ...ok, title: "x".repeat(200), note: "x".repeat(2000) })).toBeNull();
  });

  it("rejects an impossible date", () => {
    expect(validateManualEvent({ ...ok, startDate: "2026-02-30" })).toMatch(/date/);
  });

  it("requires an end date for a trip, on or after the start", () => {
    expect(validateManualEvent({ type: "travel", startDate: "2026-06-18", title: "Away" })).toMatch(/end date/);
    expect(
      validateManualEvent({ type: "travel", startDate: "2026-06-18", endDate: "2026-06-10", title: "Away" })
    ).toMatch(/before/);
  });

  it("caps a trip at a year, which is almost always an end-date typo", () => {
    expect(
      validateManualEvent({ type: "travel", startDate: "2026-01-01", endDate: "2027-06-01", title: "Away" })
    ).toMatch(/at most/);
  });

  it("rejects an end date on a single-day type", () => {
    expect(validateManualEvent({ ...ok, endDate: "2026-09-23" })).toMatch(/Only a trip/);
  });
});
