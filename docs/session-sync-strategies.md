# Session Sync Strategies: Design Decision Record

**Date:** May 2026  
**Status:** Decided — Moderate Hybrid (Approach 4) implemented  
**Context:** The Petlibro API provides two data sources for drinking activity: a daily summary endpoint (`/deviceDrinkWater/todayDrinkData`) that returns totals (mL, session count, total time), and a work records endpoint (`/device/workRecord/list`) that returns individual drinking sessions with timestamps, amounts, and durations. These two sources can become inconsistent — the daily summary may report 5 sessions while only 2 individual session records are stored locally.

---

## Problem Statement

Some days end up with a `daily_water_log` entry (showing intake and session count from the summary API) but missing or incomplete `drinking_sessions` records (from the work records API). This creates a visible mismatch on the Daily tab: the summary cards show data but the session timeline is empty or shows fewer entries than expected.

Root causes include:
- The work records API may not return data for very recent sessions (eventual consistency)
- Network timeouts during the cron sync may interrupt session fetching while daily totals succeed
- The 24-hour rolling window used by the original cron sync may miss sessions near day boundaries
- Timezone calculation bugs (now fixed with `getLocalDayBounds`) previously caused incorrect query windows

---

## Approaches Evaluated

### Approach 1: Integrity Check During Cron Sync

During the regular cron sync (which runs every 4 hours), compare `daily_water_log.drinkingCount` against the actual number of `drinking_sessions` rows for recent days. If there is a discrepancy, automatically re-fetch that day's work records.

| Aspect | Assessment |
|--------|-----------|
| Automation | Fully automatic, no user action needed |
| Latency | Gaps fixed within 4 hours (cron interval) |
| API load | Adds 1-2 extra API calls per sync when gaps exist |
| Complexity | Low — extends existing cron logic |
| Risk | Could hit API rate limits if many days are problematic |

### Approach 2: Nightly Backfill Job

A separate scheduled task (once daily at 3 AM) scans the last N days (e.g., 7) for any day where `daily_water_log.drinkingCount > 0` but `COUNT(drinking_sessions)` is zero or less than expected. Re-fetches those days in batch.

| Aspect | Assessment |
|--------|-----------|
| Automation | Fully automatic |
| Latency | Up to 24 hours before a gap is fixed |
| API load | Batches corrections efficiently at low-traffic time |
| Complexity | Medium — requires a separate scheduled endpoint |
| Risk | Stale data visible to user for up to a full day |

### Approach 3: Lazy Repair on Read (Detect on View)

When the `history.drinkingSessions` query returns fewer sessions than `daily_water_log.drinkingCount` for that date, automatically trigger a re-fetch from the API before returning results to the frontend.

| Aspect | Assessment |
|--------|-----------|
| Automation | Triggered by user action (viewing a date) |
| Latency | First load may be slow; subsequent loads are instant |
| API load | Minimal — only fetches when user actually views a problematic day |
| Complexity | Low — modifies existing query procedure |
| Risk | First view of a problematic day still shows incomplete data briefly (self-heals on the same request) |

### Approach 4: Hybrid — Cron Integrity Check + Lazy Repair (CHOSEN)

Combines Approaches 1 and 3: the cron checks today and yesterday proactively (the most likely problematic days), while older days get lazy-repaired when viewed.

| Aspect | Assessment |
|--------|-----------|
| Automation | Recent days: fully automatic. Older days: on-demand |
| Latency | Today/yesterday: fixed within 4 hours. Older: fixed on first view |
| API load | Balanced — only 2 extra checks per cron + on-demand for historical |
| Complexity | Medium — two code paths but shared repair logic |
| Risk | Best coverage with minimal API overhead |

---

## Decision: Moderate Hybrid (Approach 4)

We chose the hybrid approach with a **moderate** trigger threshold:

> **Re-fetch when `stored_session_count < daily_water_log.drinkingCount`**

This catches both complete gaps (zero sessions stored) and partial gaps (some sessions missing), without being overly aggressive (which would re-fetch every day regardless).

### Why Not Conservative?

A conservative strategy (only re-fetch when stored count is exactly 0) would miss partial gaps where, for example, 3 out of 5 sessions were stored. The user would see an incomplete timeline without any automatic repair.

### Why Not Aggressive?

An aggressive strategy (always re-fetch if within the last 7 days) would make unnecessary API calls on days where data is already complete. Given that the Petlibro API has undocumented rate limits, we prefer to minimize calls.

---

## Implementation Details

### Cron Integrity Check (`server/cron.ts`)

After the regular session sync, the cron job:
1. Calls `getSessionIntegrity(userId, today)` and `getSessionIntegrity(userId, yesterday)`
2. If `expectedCount > 0 && storedCount < expectedCount`, uses `getLocalDayBounds()` to compute the correct UTC window
3. Fetches work records for that window and upserts any new sessions

### Lazy Repair on Read (`server/routers.ts` — `history.drinkingSessions`)

When the query is called:
1. Fetches stored sessions from DB
2. Calls `getSessionIntegrity()` to compare counts
3. If `sessions.length === 0` OR `storedCount < expectedCount`, fetches from API
4. Upserts new sessions and re-queries to return the complete set

### Shared Helper (`server/db.ts` — `getSessionIntegrity`)

```typescript
getSessionIntegrity(userId, date) → { expectedCount, storedCount }
```

Queries both `daily_water_log.drinkingCount` and `COUNT(drinking_sessions)` for the given date, returning the comparison values for the caller to decide whether repair is needed.

---

## Future Considerations

If the current approach proves insufficient, consider:

1. **Expanding cron check window** — Check the last 3-7 days instead of just today/yesterday
2. **Adding a dedicated backfill endpoint** — A manual trigger to repair all gaps in a date range
3. **Tracking repair attempts** — Add a `lastRepairAttempt` timestamp to avoid repeatedly hitting the API for dates where the Petlibro API genuinely has no data
4. **Notification on persistent gaps** — Alert the user if a day has been attempted 3+ times without resolution (may indicate the API has purged old data)
5. **Rate limiting the lazy repair** — Add a cooldown (e.g., 5 minutes) to prevent rapid repeated fetches if a user refreshes the page multiple times

---

## References

- Petlibro API: `/device/workRecord/list` with `type=["DRINK"]` — returns individual session records
- Petlibro API: `/deviceDrinkWater/todayDrinkData` — returns daily summary totals
- `getLocalDayBounds()` in `server/timezone.ts` — DST-safe UTC epoch boundary calculation
- `getSessionIntegrity()` in `server/db.ts` — count comparison helper
