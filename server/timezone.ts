/**
 * Timezone utility functions for bucketing data in the user's local time.
 */

/**
 * Get the current date and hour in a specific timezone.
 * Returns { date: "YYYY-MM-DD", hour: 0-23 } in the user's local time.
 */
export function getLocalDateTime(timezone: string): { date: string; hour: number } {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === "year")?.value || "2026";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);

    return { date: `${year}-${month}-${day}`, hour };
  } catch {
    // Fallback to UTC if timezone is invalid
    const now = new Date();
    return {
      date: now.toISOString().split("T")[0],
      hour: now.getUTCHours(),
    };
  }
}

/**
 * Given a date string (YYYY-MM-DD) and a timezone, compute the UTC epoch
 * milliseconds for the start (00:00:00.000) and end (23:59:59.999) of that
 * local day. This is used to build correct API query windows.
 *
 * Strategy: We start with UTC midnight of the target date, use Intl to determine
 * what local time that corresponds to, compute the offset, then adjust to find
 * the UTC instant of local midnight. A verification step handles DST edge cases.
 */
export function getLocalDayBounds(
  dateStr: string,
  timezone: string
): { startMs: number; endMs: number } {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);

    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const getLocalParts = (utcMs: number) => {
      const parts = fmt.formatToParts(new Date(utcMs));
      return {
        year: parseInt(parts.find((p) => p.type === "year")?.value || "0", 10),
        month: parseInt(parts.find((p) => p.type === "month")?.value || "0", 10),
        day: parseInt(parts.find((p) => p.type === "day")?.value || "0", 10),
        hour: parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10),
        minute: parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10),
        second: parseInt(parts.find((p) => p.type === "second")?.value || "0", 10),
      };
    };

    // Start with UTC midnight of the target date as initial guess
    const guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const local = getLocalParts(guess);

    // Compare local date to target date using numeric YYYYMMDD
    const targetDateNum = year * 10000 + month * 100 + day;
    const localDateNum = local.year * 10000 + local.month * 100 + local.day;

    let offsetMs: number;
    if (localDateNum === targetDateNum) {
      // Same day: offset = local time since midnight
      offsetMs = (local.hour * 3600 + local.minute * 60 + local.second) * 1000;
    } else if (localDateNum > targetDateNum) {
      // Local is ahead (east of UTC): UTC midnight is already next local day
      offsetMs =
        (local.hour * 3600 + local.minute * 60 + local.second) * 1000 + 86400000;
    } else {
      // Local is behind (west of UTC): UTC midnight is still previous local day
      offsetMs =
        (local.hour * 3600 + local.minute * 60 + local.second) * 1000 - 86400000;
    }

    // UTC time of local midnight = UTC_midnight_of_date - offset
    let startMs = guess - offsetMs;

    // Verify and fine-tune (handles DST transition edge cases)
    const verify = getLocalParts(startMs);
    const verifyDateNum = verify.year * 10000 + verify.month * 100 + verify.day;
    if (verifyDateNum !== targetDateNum || verify.hour !== 0) {
      if (verifyDateNum === targetDateNum) {
        // Right day but wrong hour — subtract the extra time
        startMs -= (verify.hour * 3600 + verify.minute * 60 + verify.second) * 1000;
      }
    }

    const endMs = startMs + 86400000 - 1;
    return { startMs, endMs };
  } catch {
    // Fallback: treat dateStr as UTC
    const [year, month, day] = dateStr.split("-").map(Number);
    const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return { startMs, endMs: startMs + 86400000 - 1 };
  }
}

/**
 * Get yesterday's date in a specific timezone.
 */
export function getYesterdayLocal(timezone: string): string {
  try {
    const yesterday = new Date(Date.now() - 86400000);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(yesterday);
    const year = parts.find((p) => p.type === "year")?.value || "2026";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  } catch {
    return new Date(Date.now() - 86400000).toISOString().split("T")[0];
  }
}
