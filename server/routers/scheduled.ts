/**
 * Scheduled endpoint for periodic data collection.
 * This allows a scheduled task to trigger data sync for all users.
 */
import { router, protectedProcedure } from "../_core/trpc";
import { getCredentials, updateLastSync, upsertDailyLog, upsertHourlyLog } from "../db";
import { getOrCreateAPI } from "../petlibro-api";
import { getDb } from "../db";
import { petlibroCredentials } from "../../drizzle/schema";

export const scheduledRouter = router({
  syncAll: protectedProcedure.mutation(async ({ ctx }) => {
    // Allow both admin and user roles (scheduled tasks authenticate as "user")
    if (ctx.user.role !== "admin" && ctx.user.role !== "user") {
      return { error: "Unauthorized" };
    }

    const db = await getDb();
    if (!db) return { error: "Database not available" };

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
        console.error(`[Scheduled] Failed to sync for user ${cred.userId}:`, e);
      }
    }

    return { success: true, synced, errors };
  }),
});
