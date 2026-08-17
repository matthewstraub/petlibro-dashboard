# Petlibro History API & Data Retention

**Date:** August 2026
**Status:** Verified against a live PLWF105 account on 2026-08-16
**Context:** The dashboard's daily history began 2026-05-01, when the sync cron
started. This documents what can be recovered from Petlibro's servers, and the
retention limit that bounds it.

---

## The endpoint

`POST /data/deviceDrinkWater/history` is what backs the mobile app's charts. It
is **not** used by any public Petlibro client — it was found in a packet capture
and confirmed by direct probing.

```json
{ "deviceSn": "WF01…", "dimension": "month", "dimensionParam": "2026-03" }
```

| `dimension` | `dimensionParam` | Returns |
|---|---|---|
| `day` | `"2026-08-15"` | 24 entries, one per hour |
| `week` | `"2026-08-10"` + `endDay` | one per day of that week |
| `month` | `"2026-03"` | one per day of that month |
| `year` | `"2026"` | 12 entries, one per month |

**The parameter format is strict.** `"2026-03-01"` for a month returns
`code 1002` (`For input string: "03-01"`), and `"2026-01-01"` for a year returns
`code 1001` (`SYSTEM_ERROR`).

Response `data`:

```jsonc
{
  "legendData": ["Water Intake"],
  "waterIntake":      [/* parallel to xdate */],
  "drinkTimes":       [/* session counts   */],
  "avgDrinkDuration": [/* seconds          */],
  "xdate":            ["2026-03-01", "2026-03-02", …],
  "totalMl": 2662,
  "avgDrinkMl": 0,
  "dailyAvgDrinkMl": 0
}
```

The four arrays are parallel and their length matches the period (28–31 for a
month, 24 for a day, 12 for a year). **Always key off `xdate`** rather than
computing dates from the index.

Day bucketing follows the `timezone` request header, which is why
`getOrCreateAPI` includes the timezone in its cache key.

---

## Retention: ~170 days, rolling

This is the important finding, and it contradicts Petlibro's published FAQ
(which claims history persists until factory reset).

Probing a device purchased **March 2025** and in continuous use since:

| Period | Result |
|---|---|
| 2024 (all 12 months) | `code 0`, all zeros |
| 2025 (all 12 months) | `code 0`, all zeros |
| 2026-02-27 | 0 mL |
| **2026-02-28** | **41 mL — only hours 18 and 23** |
| 2026-03-01 | 85 mL, spread across 6 hours from 04:00 |
| 2026-03-02 | 133 mL, spread across 11 hours from 02:00 |

Data began exactly **170 days** before the probe date. The boundary day is
*truncated* — normal days show drinking from early morning, but 2026-02-28 has
nothing before 18:00. That is the shape of a cutoff, not a first day of use.

Older periods return a **well-formed response with zeros**, not an error, so
absence of data is indistinguishable from a genuine zero without knowing the
retention window.

Two consequences:

1. **Anything older than ~170 days is permanently gone.** No other endpoint
   serves it — `day`, `week`, `month`, and `year` dimensions were each tried
   against 2025 and all returned zeros.
2. **The window rolls forward.** Data is continuously being lost, so the
   dashboard's own database is the only durable archive. This is the argument
   for backfilling promptly and for the sync being robust about its own gaps.

`/device/workRecord/list` was also tested and returned records from ~90 days
back, contradicting a widely-repeated claim of 60-day retention on that
endpoint. It remains unsuitable for backfill regardless: it has no pagination,
and per-session sums can under-count relative to the daily totals the app shows.

---

## Why backfill uses `dimension: "month"`

One call per month returns per-day totals for that month, so ~7 calls cover the
entire retained window. The fields map almost directly onto `daily_water_log`:

| Column | Source |
|---|---|
| `totalMl` | `waterIntake[i]` |
| `drinkingCount` | `drinkTimes[i]` |
| `avgDrinkDuration` | `avgDrinkDuration[i]` |
| `totalDrinkingTime` | `drinkTimes[i] × avgDrinkDuration[i]` |

These are the same authoritative aggregates the app displays, so backfilled rows
agree with synced ones — unlike reconstructing from `drinking_sessions`, which
[`sessions.test.ts`](../server/sessions.test.ts) documents can under-count.

### Zero days are skipped, not written as zeros

The API returns `0` both for "the fountain reported nothing" and for "your pet
genuinely drank nothing", and nothing distinguishes them. Writing a 0 row would
make a sync outage look like a day of no drinking — precisely the confusion the
Analysis page's gap handling exists to prevent. A day with no evidence stays
absent from the table.

---

## Rate limits

Undocumented. Community clients self-throttle to roughly one request per 10s per
endpoint. The backfill paces itself at 1.2s between month calls; a full run is
about seven requests, so this has never approached a limit in practice.
