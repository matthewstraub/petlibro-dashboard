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
    // Use en-CA locale for YYYY-MM-DD format
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
