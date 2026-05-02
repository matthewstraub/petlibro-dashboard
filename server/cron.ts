import type { Express } from "express";
import { getDb } from "./db";
import { getOrCreateAPI } from "./petlibro-api";
import { upsertDailyLog, upsertHourlyLog, updateLastSync, getCredentials } from "./db";
import { getLocalDateTime, getYesterdayLocal } from "./timezone";
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
      res.status(500).json({ error: "Sync failed", message: error.message });
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
