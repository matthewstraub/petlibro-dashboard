import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  getCredentials,
  upsertCredentials,
  updateDeviceSn,
  updateLastSync,
  upsertDailyLog,
  getDailyLogs,
  getMonthlyAverages,
  upsertHourlyLog,
  getHourlyAverages,
} from "./db";
import { PetlibroAPI, getOrCreateAPI } from "./petlibro-api";
import { scheduledRouter } from "./routers/scheduled";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Petlibro credentials management
  credentials: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds) return null;
      return {
        email: creds.email,
        region: creds.region,
        deviceSn: creds.deviceSn,
        lastSyncAt: creds.lastSyncAt,
        hasPassword: true,
      };
    }),

    save: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
        region: z.string().default("US"),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertCredentials({
          userId: ctx.user.id,
          email: input.email,
          password: input.password,
          region: input.region,
        });
        return { success: true };
      }),

    test: protectedProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(1),
        region: z.string().default("US"),
      }))
      .mutation(async ({ input }) => {
        const api = new PetlibroAPI(input.email, input.password, input.region);
        return await api.testConnection();
      }),

    selectDevice: protectedProcedure
      .input(z.object({ deviceSn: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await updateDeviceSn(ctx.user.id, input.deviceSn);
        return { success: true };
      }),
  }),

  // Live fountain data
  fountain: router({
    liveData: protectedProcedure.query(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds || !creds.deviceSn) {
        return { error: "No credentials or device configured" };
      }

      const api = getOrCreateAPI(creds.email, creds.password, creds.region);
      const drinkData = await api.getDrinkWaterData(creds.deviceSn);
      const status = await api.getFountainStatus(creds.deviceSn);

      return {
        drinkData,
        status,
        deviceSn: creds.deviceSn,
        lastSyncAt: new Date().toISOString(),
      };
    }),

    status: protectedProcedure.query(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds || !creds.deviceSn) {
        return { error: "No credentials or device configured" };
      }

      const api = getOrCreateAPI(creds.email, creds.password, creds.region);
      return await api.getFountainStatus(creds.deviceSn);
    }),

    devices: protectedProcedure.query(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds) {
        return { error: "No credentials configured", devices: [] };
      }

      const api = getOrCreateAPI(creds.email, creds.password, creds.region);
      const devices = await api.listDevices();
      return { devices };
    }),

    // Sync current data to database
    syncToday: protectedProcedure.mutation(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds || !creds.deviceSn) {
        return { error: "No credentials or device configured" };
      }

      const api = getOrCreateAPI(creds.email, creds.password, creds.region);
      const drinkData = await api.getDrinkWaterData(creds.deviceSn);

      if (!drinkData) {
        return { error: "Failed to fetch drink data" };
      }

      const today = new Date().toISOString().split("T")[0];

      // Save today's data
      await upsertDailyLog({
        userId: ctx.user.id,
        date: new Date(today),
        totalMl: drinkData.todayTotalMl || 0,
        drinkingCount: drinkData.todayTotalTimes || 0,
        totalDrinkingTime: drinkData.petEatingTime || 0,
        avgDrinkDuration: drinkData.avgDrinkDuration || 0,
      });

      // Save yesterday's data too
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      if (drinkData.yesterdayTotalMl > 0) {
        await upsertDailyLog({
          userId: ctx.user.id,
          date: new Date(yesterday),
          totalMl: drinkData.yesterdayTotalMl || 0,
          drinkingCount: drinkData.yesterdayTotalTimes || 0,
          totalDrinkingTime: 0,
          avgDrinkDuration: 0,
        });
      }

      // Save hourly estimate (distribute today's total across current hour)
      const currentHour = new Date().getHours();
      await upsertHourlyLog({
        userId: ctx.user.id,
        date: new Date(today),
        hour: currentHour,
        totalMl: drinkData.todayTotalMl || 0,
        drinkingCount: drinkData.todayTotalTimes || 0,
      });

      await updateLastSync(ctx.user.id);

      return { success: true, synced: today };
    }),
  }),

  // Historical data for charts
  history: router({
    weekly: protectedProcedure.query(async ({ ctx }) => {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      return await getDailyLogs(ctx.user.id, startDate, endDate);
    }),

    monthly: protectedProcedure
      .input(z.object({ months: z.number().default(2) }).optional())
      .query(async ({ ctx, input }) => {
        const months = input?.months || 2;
        const endDate = new Date().toISOString().split("T")[0];
        const startDate = new Date(Date.now() - months * 30 * 86400000).toISOString().split("T")[0];
        return await getDailyLogs(ctx.user.id, startDate, endDate);
      }),

    yearly: protectedProcedure.query(async ({ ctx }) => {
      return await getMonthlyAverages(ctx.user.id, 12);
    }),

    hourly: protectedProcedure.query(async ({ ctx }) => {
      return await getHourlyAverages(ctx.user.id, 30);
    }),

    range: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        return await getDailyLogs(ctx.user.id, input.startDate, input.endDate);
      }),
  }),

  // Scheduled task endpoint
  scheduled: scheduledRouter,
});

export type AppRouter = typeof appRouter;
