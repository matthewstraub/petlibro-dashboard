import type { Express } from "express";
import { getDb } from "./db";
import { petlibroCredentials } from "../drizzle/schema";
import { getOrCreateAPI } from "./petlibro-api";
import { upsertDailyLog, upsertHourlyLog, updateLastSync } from "./db";

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

      const allCreds = await db.select().from(petlibroCredentials);
      let synced = 0;
      let errors = 0;

      for (const cred of allCreds) {
        try {
          if (!cred.deviceSn) continue;

          const api = getOrCreateAPI(cred.email, cred.password, cred.region);
          const drinkData = await api.getDrinkWaterData(cred.deviceSn);

          if (!drinkData) {
            errors++;
            continue;
          }

          const today = new Date().toISOString().split("T")[0];

          await upsertDailyLog({
            userId: cred.userId,
            date: new Date(today),
            totalMl: drinkData.todayTotalMl || 0,
            drinkingCount: drinkData.todayTotalTimes || 0,
            totalDrinkingTime: drinkData.petEatingTime || 0,
            avgDrinkDuration: drinkData.avgDrinkDuration || 0,
          });

          const currentHour = new Date().getHours();
          await upsertHourlyLog({
            userId: cred.userId,
            date: new Date(today),
            hour: currentHour,
            totalMl: drinkData.todayTotalMl || 0,
            drinkingCount: drinkData.todayTotalTimes || 0,
          });

          // Also save yesterday if available
          const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
          if (drinkData.yesterdayTotalMl > 0) {
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
          console.error(`[Cron] Failed to sync for user ${cred.userId}:`, e);
        }
      }

      res.json({ success: true, synced, errors, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[Cron] Sync failed:", error);
      res.status(500).json({ error: "Sync failed", message: error.message });
    }
  });

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
