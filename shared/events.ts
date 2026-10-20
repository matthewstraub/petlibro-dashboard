/**
 * Chart events — things that happened in the pet's life or to the fountain,
 * plotted as markers over the intake chart so a change in drinking can be read
 * against what was going on at the time.
 *
 * Two sources:
 *  - "petlibro": filter replacements and machine cleanings reported by the
 *    fountain itself. Read-only.
 *  - "manual": food changes, medication, vet visits, travel, free-form notes.
 *
 * Dates are "YYYY-MM-DD" keys, the same calendar-day convention as the rest of
 * the analytics, so an event lines up with the chart's category axis exactly.
 */

export type EventType =
  | "filter"
  | "cleaning"
  | "food"
  | "medication"
  | "vet"
  | "travel"
  | "note";

export type EventSource = "petlibro" | "manual";

export interface ChartEvent {
  id: string;
  type: EventType;
  source: EventSource;
  /** The day it happened, or the first day of a range event. */
  startDate: string;
  /** Last day, inclusive. Only range events (travel) carry one. */
  endDate?: string;
  title: string;
  note?: string;
}

/** Types the fountain reports on its own; never created by hand. */
export const PETLIBRO_EVENT_TYPES: readonly EventType[] = ["filter", "cleaning"];

/** Types a person can create, edit and delete. */
export const MANUAL_EVENT_TYPES: readonly EventType[] = ["food", "medication", "vet", "travel", "note"];

/** Types that span days and render as a shaded band rather than a line. */
export const RANGE_EVENT_TYPES: readonly EventType[] = ["travel"];

export const EVENT_TITLE_MAX = 200;
export const EVENT_NOTE_MAX = 2000;
/** A trip longer than a year is almost certainly a typo in the end date. */
export const MAX_RANGE_EVENT_DAYS = 366;

export function isRangeType(type: EventType): boolean {
  return RANGE_EVENT_TYPES.includes(type);
}

export function isManualType(type: string): type is EventType {
  return (MANUAL_EVENT_TYPES as readonly string[]).includes(type);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A "YYYY-MM-DD" that is also a real calendar day — the regex alone allows 02-30. */
export function isRealDateKey(key: unknown): key is string {
  if (typeof key !== "string" || !DATE_KEY.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  return asUtc.getUTCFullYear() === y && asUtc.getUTCMonth() === m - 1 && asUtc.getUTCDate() === d;
}

export interface ManualEventInput {
  type: EventType;
  startDate: string;
  endDate?: string;
  title: string;
  note?: string;
}

/**
 * The rules a hand-entered event must satisfy, shared by the form and the
 * server so the two cannot disagree. Returns an error message, or null if valid.
 */
export function validateManualEvent(input: ManualEventInput): string | null {
  if (!isManualType(input.type)) return "That event type can't be created by hand";
  if (!isRealDateKey(input.startDate)) return "Pick a valid date";

  const title = input.title?.trim() ?? "";
  if (title.length === 0) return "Give the event a title";
  if (title.length > EVENT_TITLE_MAX) return `Keep the title under ${EVENT_TITLE_MAX} characters`;
  if ((input.note?.length ?? 0) > EVENT_NOTE_MAX) {
    return `Keep the note under ${EVENT_NOTE_MAX} characters`;
  }

  if (isRangeType(input.type)) {
    if (!isRealDateKey(input.endDate)) return "Pick an end date";
    if (input.endDate < input.startDate) return "The end date is before the start date";
    const span =
      (Date.UTC(...ymd(input.endDate)) - Date.UTC(...ymd(input.startDate))) / 86400000 + 1;
    if (span > MAX_RANGE_EVENT_DAYS) return `A range can be at most ${MAX_RANGE_EVENT_DAYS} days`;
  } else if (input.endDate !== undefined && input.endDate !== null) {
    return "Only a trip can span several days";
  }
  return null;
}

function ymd(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m - 1, d];
}

/** All point events falling on one day, so same-day events share one marker. */
export interface EventDayGroup {
  dateKey: string;
  events: ChartEvent[];
}

/** A range event clipped to the visible window. */
export interface ClippedRange {
  event: ChartEvent;
  x1: string;
  x2: string;
}

/**
 * Point events inside [startKey, endKey], grouped by day and sorted by date.
 *
 * Grouping matters because filter and cleaning resets usually happen together:
 * two markers on one day would draw over each other, while one marker carrying
 * both reads correctly and leaves room on dense ranges.
 */
export function groupPointEvents(
  events: ChartEvent[],
  startKey: string,
  endKey: string,
  hidden: ReadonlySet<EventType> = new Set()
): EventDayGroup[] {
  const byDay = new Map<string, ChartEvent[]>();
  for (const event of events) {
    if (isRangeType(event.type) || hidden.has(event.type)) continue;
    if (event.startDate < startKey || event.startDate > endKey) continue;
    const list = byDay.get(event.startDate) ?? [];
    list.push(event);
    byDay.set(event.startDate, list);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([dateKey, list]) => ({ dateKey, events: list }));
}

/**
 * Range events that overlap [startKey, endKey], clipped to it.
 *
 * A trip that began before the visible window still shades the part that is
 * visible; one that ended before it is dropped entirely.
 */
export function rangeEventsInWindow(
  events: ChartEvent[],
  startKey: string,
  endKey: string,
  hidden: ReadonlySet<EventType> = new Set()
): ClippedRange[] {
  const result: ClippedRange[] = [];
  for (const event of events) {
    if (!isRangeType(event.type) || hidden.has(event.type)) continue;
    const last = event.endDate ?? event.startDate;
    if (last < startKey || event.startDate > endKey) continue;
    result.push({
      event,
      x1: event.startDate < startKey ? startKey : event.startDate,
      x2: last > endKey ? endKey : last,
    });
  }
  return result.sort((a, b) => (a.x1 < b.x1 ? -1 : a.x1 > b.x1 ? 1 : 0));
}

/** Every visible event touching a day — point events on it, ranges covering it. */
export function eventsOnDay(
  events: ChartEvent[],
  dateKey: string,
  hidden: ReadonlySet<EventType> = new Set()
): ChartEvent[] {
  return events.filter(event => {
    if (hidden.has(event.type)) return false;
    if (isRangeType(event.type)) {
      return event.startDate <= dateKey && dateKey <= (event.endDate ?? event.startDate);
    }
    return event.startDate === dateKey;
  });
}

/** Events overlapping a window, newest first — the order the list shows them in. */
export function eventsInWindow(
  events: ChartEvent[],
  startKey: string,
  endKey: string,
  hidden: ReadonlySet<EventType> = new Set()
): ChartEvent[] {
  return events
    .filter(event => {
      if (hidden.has(event.type)) return false;
      const last = event.endDate ?? event.startDate;
      return last >= startKey && event.startDate <= endKey;
    })
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));
}
