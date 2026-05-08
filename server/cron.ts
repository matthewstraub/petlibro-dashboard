import type { Express } from "express";
import { getDb } from "./db";
import { getOrCreateAPI } from "./petlibro-api";
import { upsertDailyLog, upsertHourlyLog, updateLastSync, getCredentials, upsertDrinkingSessions, getSessionIntegrity } from "./db";
import { getLocalDateTime, getYesterdayLocal, getLocalDayBounds } from "./timezone";
import { sql } from "drizzle-orm";

/**
 * Register cron job endpoints.
 * These are called by Render's cron job feature (or any external scheduler).
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

          await upsertHourlyLog({
            userId: cred.userId,
            date: new Date(today),
            hour: currentHour,
            totalMl: drinkData.todayTotalMl || 0,
            drinkingCount: drinkData.todayTotalTimes || 0,
          });

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
