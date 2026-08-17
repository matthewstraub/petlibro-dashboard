import type { Express } from "express";
import { getDb } from "./db";
import { getOrCreateAPI } from "./petlibro-api";
import { upsertDailyLog, updateLastSync, getCredentials, upsertDrinkingSessions, getSessionIntegrity, getDailyTotalsByDate, replaceHourlyLogsForDate } from "./db";
import { getLocalDateTime, getYesterdayLocal, getLocalDayBounds } from "./timezone";
import { addDaysToKey } from "@shared/analytics";
import { enumerateMonthKeys, monthKeyOf, parseDailyHistory, parseMonthlyHistory, selectDaysToWrite } from "./backfill";
import { sql } from "drizzle-orm";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Register cron job endpoints.
 * These are called by GitHub Actions (see .github/workflows/sync.yml) or any external scheduler.
 * Protected by a CRON_SECRET environment variable.
 */
export function registerCronRoutes(app: Express) {
  app.get("/api/cron/sync", async (req, res) => {
    // Verify cron secret
    const secret = req.headers["x-cron-secret"] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      res.status(500).json({ error: "CRON_SECRET not configured" });
      return;
    }

    if (secret !== expectedSecret) {
      res.status(401).json({ error: "Invalid cron secret" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      // Get all user IDs from credentials table using a safe query
      const allCredsResult = await db.execute(sql`
        SELECT userId FROM petlibro_credentials WHERE deviceSn IS NOT NULL
      `);
      const userIds = ((allCredsResult as any)[0] || []).map((r: any) => r.userId);
      let synced = 0;
      let errors = 0;

      for (const userId of userIds) {
        try {
          // Use getCredentials which gracefully handles missing timezone column
          const cred = await getCredentials(userId);
          if (!cred || !cred.deviceSn) continue;

          const api = getOrCreateAPI(cred.email, cred.password, cred.region);
          const drinkData = await api.getDrinkWaterData(cred.deviceSn);

          if (!drinkData) {
            errors++;
            continue;
          }

          // Use the user's configured timezone for date/hour bucketing
          const userTz = cred.timezone || "America/New_York";
          const { date: today, hour: currentHour } = getLocalDateTime(userTz);

          await upsertDailyLog({
            userId: cred.userId,
            date: new Date(today),
            totalMl: drinkData.todayTotalMl || 0,
            drinkingCount: drinkData.todayTotalTimes || 0,
            totalDrinkingTime: drinkData.petEatingTime || 0,
            avgDrinkDuration: drinkData.avgDrinkDuration || 0,
          });

          // Real per-hour buckets from the history endpoint. This previously
          // stored the cumulative day total under whichever hour the sync ran,
          // so the Time-of-Day chart described sync timing rather than the pet.
          try {
            const dayHistory = await api.getDrinkHistory(cred.deviceSn, "day", today);
            const hours = parseDailyHistory(dayHistory);
            if (hours.length > 0) {
              await replaceHourlyLogsForDate(cred.userId, today, hours);
            }
          } catch (hourlyErr) {
            console.error(`[Cron] Hourly breakdown failed for user ${userId}:`, hourlyErr);
            // Non-fatal: daily totals are the primary record.
          }

          // Also save yesterday if available
          if (drinkData.yesterdayTotalMl > 0) {
            const yesterday = getYesterdayLocal(userTz);
            await upsertDailyLog({
              userId: cred.userId,
              date: new Date(yesterday),
              totalMl: drinkData.yesterdayTotalMl || 0,
              drinkingCount: drinkData.yesterdayTotalTimes || 0,
              totalDrinkingTime: 0,
              avgDrinkDuration: 0,
            });
          }

          // Sync individual drinking sessions from workRecord API
          try {
            const now = Date.now();
            const oneDayAgo = now - 24 * 60 * 60 * 1000;
            const records = await api.getWorkRecords(cred.deviceSn, oneDayAgo, now, ["DRINK"]);
            if (records.length > 0) {
              // Records come grouped by day with workRecords array
              const sessions: Array<{ sessionId: string; deviceSn: string; sessionTime: number; date: string; amountMl: number; durationSec: number }> = [];
              for (const dayGroup of records) {
                const workRecords = (dayGroup as any).workRecords || [];
                for (const wr of workRecords) {
                  if (wr.id && wr.recordTime && wr.type === "DRINK") {
                    // Convert epoch ms to local date using user's timezone
                    const sessionDate = new Date(wr.recordTime).toLocaleDateString("en-CA", { timeZone: userTz });
                    sessions.push({
                      sessionId: wr.id,
                      deviceSn: cred.deviceSn!,
                      sessionTime: wr.recordTime,
                      date: sessionDate,
                      amountMl: wr.totalMl || 0,
                      durationSec: wr.drinkTime || 0,
                    });
                  }
                }
              }
              if (sessions.length > 0) {
                await upsertDrinkingSessions(cred.userId, sessions);
                console.log(`[Cron] Synced ${sessions.length} drinking sessions for user ${userId}`);
              }
            }
          } catch (sessionErr) {
            console.error(`[Cron] Failed to sync drinking sessions for user ${userId}:`, sessionErr);
            // Don't fail the whole sync if session sync fails
          }

          // Integrity check: verify today and yesterday have expected session counts
          try {
            const datesToCheck = [today, getYesterdayLocal(userTz)];
            for (const checkDate of datesToCheck) {
              const { expectedCount, storedCount } = await getSessionIntegrity(cred.userId, checkDate);
              if (expectedCount > 0 && storedCount < expectedCount) {
                console.log(`[Cron] Integrity gap for user ${userId} on ${checkDate}: expected ${expectedCount}, stored ${storedCount}. Re-fetching...`);
                const { startMs: repairStart, endMs: repairEnd } = getLocalDayBounds(checkDate, userTz);
                const repairRecords = await api.getWorkRecords(cred.deviceSn!, repairStart, repairEnd, ["DRINK"]);
                if (repairRecords.length > 0) {
                  const repairSessions: Array<{ sessionId: string; deviceSn: string; sessionTime: number; date: string; amountMl: number; durationSec: number }> = [];
                  for (const dayGroup of repairRecords) {
                    const workRecords = (dayGroup as any).workRecords || [];
                    for (const wr of workRecords) {
                      if (wr.id && wr.recordTime && wr.type === "DRINK") {
                        const sessionDate = new Date(wr.recordTime).toLocaleDateString("en-CA", { timeZone: userTz });
                        repairSessions.push({
                          sessionId: wr.id,
                          deviceSn: cred.deviceSn!,
                          sessionTime: wr.recordTime,
                          date: sessionDate,
                          amountMl: wr.totalMl || 0,
                          durationSec: wr.drinkTime || 0,
                        });
                      }
                    }
                  }
                  if (repairSessions.length > 0) {
                    await upsertDrinkingSessions(cred.userId, repairSessions);
                    console.log(`[Cron] Repaired ${repairSessions.length} sessions for user ${userId} on ${checkDate}`);
                  }
                }
              }
            }
          } catch (integrityErr) {
            console.error(`[Cron] Integrity check failed for user ${userId}:`, integrityErr);
          }

          await updateLastSync(cred.userId);
          synced++;
        } catch (e) {
          errors++;
          console.error(`[Cron] Failed to sync for user ${userId}:`, e);
        }
      }

      res.json({ success: true, synced, errors, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Cron] Sync failed:", error);
      // Keep error response minimal to avoid "response too big" issues with external cron services
      res.status(500).json({ success: false, error: "Sync failed" });
    }
  });

  /**
   * Backfill historical daily totals from Petlibro's own history endpoint.
   *
   * The live sync only ever writes today and yesterday, so any outage longer
   * than two days leaves a permanent hole — and history predating the sync was
   * never captured at all. This walks month by month and fills those in.
   *
   * Petlibro retains only ~170 days, so this is also a race: anything older is
   * already gone, and the window keeps rolling forward.
   *
   * Query params:
   *   secret     CRON_SECRET (or the x-cron-secret header)
   *   months     how many months back to walk (default 6, max 24)
   *   overwrite  "true" to replace existing rows; default is fill-only
   *   dryRun     "true" to report what would be written without writing
   */
  app.get("/api/backfill", async (req, res) => {
    const secret = req.headers["x-cron-secret"] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      res.status(500).json({ error: "CRON_SECRET not configured" });
      return;
    }
    if (secret !== expectedSecret) {
      res.status(401).json({ error: "Invalid cron secret" });
      return;
    }

    const months = Math.min(Math.max(parseInt(String(req.query.months ?? "6"), 10) || 6, 1), 24);
    const overwrite = req.query.overwrite === "true";
    const dryRun = req.query.dryRun === "true";
    // Hourly repair costs one API call per day, so it is opt-in and capped.
    // 30 covers everything the Time-of-Day chart can display.
    const hourlyDays = Math.min(Math.max(parseInt(String(req.query.hourlyDays ?? "0"), 10) || 0, 0), 60);

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const credsResult = await db.execute(sql`
        SELECT userId FROM petlibro_credentials WHERE deviceSn IS NOT NULL
      `);
      const userIds = ((credsResult as any)[0] || []).map((r: any) => r.userId);

      const results: Array<Record<string, unknown>> = [];

      for (const userId of userIds) {
        const cred = await getCredentials(userId);
        if (!cred || !cred.deviceSn) continue;

        const userTz = cred.timezone || "America/New_York";
        const api = getOrCreateAPI(cred.email, cred.password, cred.region, userTz);

        const todayKey = getLocalDateTime(userTz).date;
        const startKey = addDaysToKey(todayKey, -(months * 31));
        const monthKeys = enumerateMonthKeys(monthKeyOf(startKey), monthKeyOf(todayKey));

        // One lookup for the whole span tells us which days already exist, so
        // fill-only mode doesn't need a query per day.
        const existingRows = await getDailyTotalsByDate(userId, `${monthKeys[0]}-01`, todayKey);
        const existing = new Set(existingRows.map(r => r.dateKey));

        let found = 0;
        let written = 0;
        let skipped = 0;
        const monthsWithData: string[] = [];

        for (const monthKey of monthKeys) {
          // Rate limits are undocumented; upstream clients self-throttle, so
          // pace the walk rather than bursting a year of requests.
          await sleep(1200);

          const history = await api.getDrinkHistory(cred.deviceSn, "month", monthKey);
          const days = parseMonthlyHistory(history, { monthKey });
          if (days.length > 0) monthsWithData.push(monthKey);
          found += days.length;

          const { toWrite, skippedExisting } = selectDaysToWrite(days, {
            existing,
            todayKey,
            overwrite,
          });
          skipped += skippedExisting;

          for (const day of toWrite) {
            if (!dryRun) {
              await upsertDailyLog({
                userId,
                date: new Date(day.dateKey),
                totalMl: day.totalMl,
                drinkingCount: day.drinkingCount,
                totalDrinkingTime: day.totalDrinkingTime,
                avgDrinkDuration: day.avgDrinkDuration,
              });
            }
            // Keep the set current so a later month can't rewrite an earlier
            // month's day if the API returns overlapping ranges.
            existing.add(day.dateKey);
            written++;
          }
        }

        // Optional hourly repair. Deliberately bounded and off by default: the
        // Time-of-Day chart only reads the last 30 days, so once the sync
        // writes real buckets the chart corrects itself within a month anyway.
        // This just makes it right immediately, at one API call per day.
        let hoursRepairedDays = 0;
        if (hourlyDays > 0) {
          for (let back = 1; back <= hourlyDays; back++) {
            const dateKey = addDaysToKey(todayKey, -back);
            await sleep(1200);
            try {
              const dayHistory = await api.getDrinkHistory(cred.deviceSn, "day", dateKey);
              const hours = parseDailyHistory(dayHistory);
              // An all-zero day is a travel day; rewriting it with 24 zeros is
              // correct and keeps the chart honest about quiet hours.
              if (hours.length > 0 && !dryRun) {
                await replaceHourlyLogsForDate(userId, dateKey, hours);
              }
              if (hours.length > 0) hoursRepairedDays++;
            } catch (e) {
              console.error(`[Backfill] Hourly repair failed for ${dateKey}:`, e);
            }
          }
        }

        results.push({
          userId,
          monthsQueried: monthKeys.length,
          monthsWithData,
          daysFound: found,
          daysWritten: written,
          daysSkippedAlreadyPresent: skipped,
          earliestRecoverable: monthsWithData[0] ?? null,
          ...(hourlyDays > 0 ? { hourlyDaysRequested: hourlyDays, hourlyDaysRepaired: hoursRepairedDays } : {}),
        });
        console.log(
          `[Backfill] user ${userId}: ${found} days found, ${written} written, ${skipped} already present`
        );
      }

      res.json({ success: true, dryRun, overwrite, results, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Backfill] Failed:", error);
      res.status(500).json({ success: false, error: "Backfill failed" });
    }
  });

  // Migration endpoint - adds timezone column if missing
  // Protected by CRON_SECRET, can be triggered from browser
  app.get("/api/migrate", async (req, res) => {
    const secret = req.headers["x-cron-secret"] || req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      res.status(500).json({ error: "CRON_SECRET not configured" });
      return;
    }

    if (secret !== expectedSecret) {
      res.status(401).json({ error: "Invalid secret" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "Database not available" });
        return;
      }

      const migrations: string[] = [];

      // Check if timezone column exists
      const [cols] = await db.execute(sql`
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'petlibro_credentials' AND column_name = 'timezone'
        AND table_schema = DATABASE()
      `) as any;

      if (!cols || cols.length === 0) {
        await db.execute(sql`
          ALTER TABLE petlibro_credentials 
          ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York'
        `);
        migrations.push("Added timezone column to petlibro_credentials");
      } else {
        migrations.push("timezone column already exists (no-op)");
      }

      // Check if drinking_sessions table exists
      const [tables] = await db.execute(sql`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'drinking_sessions'
        AND table_schema = DATABASE()
      `) as any;

      if (!tables || tables.length === 0) {
        await db.execute(sql`
          CREATE TABLE drinking_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            userId INT NOT NULL,
            sessionId VARCHAR(64) NOT NULL,
            deviceSn VARCHAR(128) NOT NULL,
            sessionTime BIGINT NOT NULL,
            date DATE NOT NULL,
            amountMl FLOAT NOT NULL DEFAULT 0,
            durationSec INT NOT NULL DEFAULT 0,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE KEY uq_session (userId, sessionId)
          )
        `);
        migrations.push("Created drinking_sessions table");
      } else {
        migrations.push("drinking_sessions table already exists (no-op)");
      }

      res.json({ success: true, migrations, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Migrate] Failed:", error);
      res.status(500).json({ error: "Migration failed", message: error.message });
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
