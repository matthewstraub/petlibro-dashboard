/**
 * Fountain maintenance events, recorded from realInfo.
 *
 * Petlibro exposes only the MOST RECENT filter replacement and machine cleaning
 * (`filterStartWorkingTime`, `machineCleaningTime` on /device/device/realInfo);
 * no endpoint is known to return past resets, and the fountain never emits a
 * reset event — a reset is just a change in Petlibro's database. So the sync
 * snapshots those two timestamps on every run and records an event the first
 * time it sees each value. History accrues from the first sync after this ships.
 *
 * Keyed on the reset timestamps rather than next-due or remaining-days, because
 * editing the replacement frequency shifts those without anything being reset.
 */
import type { EventType } from "@shared/events";
import type { PetlibroAPI } from "./petlibro-api";
import { recordPetlibroEvents } from "./db";

export interface MaintenanceSnapshot {
  filterStartWorkingTime?: number | null;
  machineCleaningTime?: number | null;
}

export interface MaintenanceEvent {
  type: EventType;
  startDate: string;
  title: string;
  note: string;
  externalKey: string;
}

/** Anything before the fountain line existed is a zero or a garbage value. */
const EARLIEST_PLAUSIBLE_MS = Date.UTC(2020, 0, 1);

/**
 * The local calendar day of an epoch-ms reset time, or null if implausible.
 *
 * Petlibro stores these at the device's local midnight, so the day must be read
 * in the user's zone. Reading it in UTC happens to work for US zones (local
 * midnight is early morning the same UTC day) but puts every reset a day early
 * anywhere east of UTC, where local midnight is still the previous UTC day —
 * the same class of off-by-one the Trends charts used to have.
 */
export function resetDateKey(ms: unknown, timezone: string, now = Date.now()): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  // A reset can't be in the future; allow a day of clock skew.
  if (ms < EARLIEST_PLAUSIBLE_MS || ms > now + 86400000) return null;
  try {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: timezone });
  } catch {
    // Invalid timezone string: fall back to UTC rather than dropping the event.
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** The maintenance events implied by one realInfo snapshot. Pure. */
export function maintenanceEventsFromRealInfo(
  info: MaintenanceSnapshot | null | undefined,
  timezone: string,
  now = Date.now()
): MaintenanceEvent[] {
  if (!info) return [];
  const events: MaintenanceEvent[] = [];

  const filterDay = resetDateKey(info.filterStartWorkingTime, timezone, now);
  if (filterDay) {
    events.push({
      type: "filter",
      startDate: filterDay,
      title: "Filter replaced",
      note: "Filter timer reset in the Petlibro app",
      externalKey: `filter:${filterDay}`,
    });
  }

  const cleaningDay = resetDateKey(info.machineCleaningTime, timezone, now);
  if (cleaningDay) {
    events.push({
      type: "cleaning",
      startDate: cleaningDay,
      title: "Fountain cleaned",
      note: "Cleaning timer reset in the Petlibro app",
      externalKey: `cleaning:${cleaningDay}`,
    });
  }

  return events;
}

/**
 * Snapshot realInfo and record any reset not seen before. Returns how many new
 * events were written. Callers treat failure as non-fatal: intake is the
 * primary record, and the next sync will catch up.
 */
export async function recordMaintenanceEvents(
  userId: number,
  api: PetlibroAPI,
  deviceSn: string,
  timezone: string
): Promise<number> {
  const info = await api.getDeviceRealInfo(deviceSn);
  return recordPetlibroEvents(userId, maintenanceEventsFromRealInfo(info, timezone));
}
