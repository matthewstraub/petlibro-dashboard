/**
 * Calendar-day helpers.
 *
 * Everything here operates on "date keys" — plain "YYYY-MM-DD" strings — because
 * a daily total is a calendar day, not an instant. Round-tripping one through a
 * bare `new Date(...)` re-interprets it in whatever zone happens to be in play
 * and shifts it by a day.
 */

/**
 * Normalize a daily-log `date` field to a "YYYY-MM-DD" key.
 *
 * A MySQL DATE column comes back from mysql2 as a JS `Date` pinned to midnight
 * in the *server process's* zone, and superjson revives it as a `Date` in the
 * browser. Production runs UTC, so the UTC parts of that instant are the
 * calendar day the row means; reading local parts instead — which is what any
 * `toLocale*` call does — moves every row back a day for viewers west of UTC.
 * Strings are already keys, or ISO timestamps whose leading date part is one.
 */
export function toDateKey(value: string | Date): string {
  if (typeof value === "string") return value.split("T")[0];
  return value.toISOString().split("T")[0];
}

/**
 * Format a "YYYY-MM-DD" key for display.
 *
 * Builds the Date from parts so it lands on *local* midnight. `new Date(key)`
 * would parse as UTC midnight and render as the previous day for anyone west of
 * UTC.
 */
export function formatDateKey(key: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", options);
}
