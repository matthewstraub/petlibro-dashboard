import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { publicProcedure, protectedProcedure, router } from "./trpc";
import { z } from "zod";
import {
  getCredentials,
  upsertCredentials,
  updateDeviceSn,
  updateLastSync,
  updateTimezone,
  upsertDailyLog,
  getDailyLogs,
  getMonthlyAverages,
  upsertHourlyLog,
  getHourlyAverages,
  getDailyDetail,
  getDrinkingSessions,
  upsertDrinkingSessions,
  getSessionIntegrity,
  getUserByUsername,
  createUser,
  updateLastSignedIn,
} from "./db";
import { PetlibroAPI, getOrCreateAPI } from "./petlibro-api";
import { hashPassword, verifyPassword, createSessionToken } from "./auth";
import { getLocalDateTime, getYesterdayLocal, getLocalDayBounds } from "./timezone";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    login: publicProcedure
      .input(z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByUsername(input.username);
        if (!user || !verifyPassword(input.password, user.passwordHash)) {
          return { success: false, error: "Invalid username or password" };
        }

        await updateLastSignedIn(user.id);
        const token = await createSessionToken(user.id);

        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: ctx.req.protocol === "https" || ctx.req.headers["x-forwarded-proto"] === "https",
          sameSite: "lax",
          path: "/",
          maxAge: ONE_YEAR_MS,
        });

        return { success: true };
      }),

    register: publicProcedure
      .input(z.object({
        username: z.string().min(3).max(64),
        password: z.string().min(6),
        name: z.string().optional(),
        email: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await getUserByUsername(input.username);
        if (existing) {
          return { success: false, error: "Username already taken" };
        }

        const passwordHash = hashPassword(input.password);
        const user = await createUser({
          username: input.username,
          passwordHash,
          name: input.name,
          email: input.email,
        });

        if (!user) {
          return { success: false, error: "Failed to create user" };
        }

        const token = await createSessionToken(user.id);
        ctx.res.cookie(COOKIE_NAME, token, {
          httpOnly: true,
          secure: ctx.req.protocol === "https" || ctx.req.headers["x-forwarded-proto"] === "https",
          sameSite: "lax",
          path: "/",
          maxAge: ONE_YEAR_MS,
        });

        return { success: true };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { path: "/" });
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
        timezone: creds.timezone || "America/New_York",
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

    setTimezone: protectedProcedure
      .input(z.object({ timezone: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const result = await updateTimezone(ctx.user.id, input.timezone);
        if (!result.success) {
          return { success: false, error: result.error };
        }
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

    events: protectedProcedure.query(async ({ ctx }) => {
      const creds = await getCredentials(ctx.user.id);
      if (!creds || !creds.deviceSn) {
        return { events: [], error: "No credentials or device configured", fetchFailed: false };
      }

      try {
        const api = getOrCreateAPI(creds.email, creds.password, creds.region);
        const events = await api.getDeviceEvents(creds.deviceSn);
        return { events, error: null, fetchFailed: false };
      } catch (error: any) {
        console.error("[fountain.events] Failed to fetch events:", error.message);
        return { events: [], error: "Failed to fetch events from Petlibro API", fetchFailed: true };
      }
    }),

    // Debug: fetch work records to explore the API response
    workRecords: protectedProcedure
      .input(z.object({
        startTime: z.number().optional(),
        endTime: z.number().optional(),
        types: z.array(z.string()).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        const creds = await getCredentials(ctx.user.id);
        if (!creds || !creds.deviceSn) {
          return { error: "No credentials or device configured", records: [] };
        }

        const api = getOrCreateAPI(creds.email, creds.password, creds.region);
        const now = Date.now();
        const startTime = input?.startTime || (now - 24 * 60 * 60 * 1000); // default: last 24h
        const endTime = input?.endTime || now;
        const types = input?.types;

        const records = await api.getWorkRecords(creds.deviceSn, startTime, endTime, types);
        return { records, count: records.length };
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

      // Use the user's configured timezone for date/hour bucketing
      const userTz = creds.timezone || "America/New_York";
      const { date: today, hour: currentHour } = getLocalDateTime(userTz);

      await upsertDailyLog({
        userId: ctx.user.id,
        date: new Date(today),
        totalMl: drinkData.todayTotalMl || 0,
        drinkingCount: drinkData.todayTotalTimes || 0,
        totalDrinkingTime: drinkData.petEatingTime || 0,
        avgDrinkDuration: drinkData.avgDrinkDuration || 0,
      });

      // Save yesterday's data too
      if (drinkData.yesterdayTotalMl > 0) {
        const yesterday = getYesterdayLocal(userTz);
        await upsertDailyLog({
          userId: ctx.user.id,
          date: new Date(yesterday),
          totalMl: drinkData.yesterdayTotalMl || 0,
          drinkingCount: drinkData.yesterdayTotalTimes || 0,
          totalDrinkingTime: 0,
          avgDrinkDuration: 0,
        });
      }

      // Save hourly estimate
      await upsertHourlyLog({
        userId: ctx.user.id,
        date: new Date(today),
        hour: currentHour,
        totalMl: drinkData.todayTotalMl || 0,
        drinkingCount: drinkData.todayTotalTimes || 0,
      });

      // Also sync individual drinking sessions
      try {
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const records = await api.getWorkRecords(creds.deviceSn, oneDayAgo, now, ["DRINK"]);
        if (records.length > 0) {
          const sessions: Array<{ sessionId: string; deviceSn: string; sessionTime: number; date: string; amountMl: number; durationSec: number }> = [];
          for (const dayGroup of records) {
            const workRecords = (dayGroup as any).workRecords || [];
            for (const wr of workRecords) {
              if (wr.id && wr.recordTime && wr.type === "DRINK") {
                const sessionDate = new Date(wr.recordTime).toLocaleDateString("en-CA", { timeZone: userTz });
                sessions.push({
                  sessionId: wr.id,
                  deviceSn: creds.deviceSn!,
                  sessionTime: wr.recordTime,
                  date: sessionDate,
                  amountMl: wr.totalMl || 0,
                  durationSec: wr.drinkTime || 0,
                });
              }
            }
          }
          if (sessions.length > 0) {
            await upsertDrinkingSessions(ctx.user.id, sessions);
          }
        }
      } catch (sessionErr) {
        console.error("[syncToday] Failed to sync drinking sessions:", sessionErr);
      }

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

    dailyDetail: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        return await getDailyDetail(ctx.user.id, input.date);
      }),

    resyncSessions: protectedProcedure
      .input(z.object({ date: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Force re-fetch sessions from Petlibro API regardless of what's stored
        try {
          const creds = await getCredentials(ctx.user.id);
          if (!creds || !creds.deviceSn) return { success: false, count: 0 };

          const api = getOrCreateAPI(creds.email, creds.password, creds.region);
          const userTz = creds.timezone || "America/New_York";

          // Compute correct UTC epoch boundaries for the user's local day
          const { startMs, endMs } = getLocalDayBounds(input.date, userTz);

          const records = await api.getWorkRecords(creds.deviceSn, startMs, endMs, ["DRINK"]);
          let count = 0;
          if (records.length > 0) {
            const newSessions: Array<{ sessionId: string; deviceSn: string; sessionTime: number; date: string; amountMl: number; durationSec: number }> = [];
            for (const dayGroup of records) {
              const workRecords = (dayGroup as any).workRecords || [];
              for (const wr of workRecords) {
                if (wr.id && wr.recordTime && wr.type === "DRINK") {
                  const sessionDate = new Date(wr.recordTime).toLocaleDateString("en-CA", { timeZone: userTz });
                  newSessions.push({
                    sessionId: wr.id,
                    deviceSn: creds.deviceSn!,
                    sessionTime: wr.recordTime,
                    date: sessionDate,
                    amountMl: wr.totalMl || 0,
                    durationSec: wr.drinkTime || 0,
                  });
                }
              }
            }
            if (newSessions.length > 0) {
              await upsertDrinkingSessions(ctx.user.id, newSessions);
              count = newSessions.filter(s => s.date === input.date).length;
            }
          }
          return { success: true, count };
        } catch (err) {
          console.error("[resyncSessions] Failed:", err);
          return { success: false, count: 0 };
        }
      }),

    drinkingSessions: protectedProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ ctx, input }) => {
        // Check stored sessions and integrity against daily_water_log
        let sessions = await getDrinkingSessions(ctx.user.id, input.date);
        const { expectedCount, storedCount } = await getSessionIntegrity(ctx.user.id, input.date);

        // Lazy repair: re-fetch if no sessions stored, or if stored < expected (moderate strategy)
        const needsRepair = (expectedCount > 0 && storedCount < expectedCount) || (sessions.length === 0 && expectedCount === 0);
        const hasNoSessions = sessions.length === 0;

        if (hasNoSessions || (expectedCount > 0 && storedCount < expectedCount)) {
          try {
            const creds = await getCredentials(ctx.user.id);
            if (!creds || !creds.deviceSn) return sessions;

            const api = getOrCreateAPI(creds.email, creds.password, creds.region);
            const userTz = creds.timezone || "America/New_York";

            // Compute correct UTC epoch boundaries for the user's local day
            const { startMs, endMs } = getLocalDayBounds(input.date, userTz);

            const records = await api.getWorkRecords(creds.deviceSn, startMs, endMs, ["DRINK"]);
            if (records.length > 0) {
              const newSessions: Array<{ sessionId: string; deviceSn: string; sessionTime: number; date: string; amountMl: number; durationSec: number }> = [];
              for (const dayGroup of records) {
                const workRecords = (dayGroup as any).workRecords || [];
                for (const wr of workRecords) {
                  if (wr.id && wr.recordTime && wr.type === "DRINK") {
                    const sessionDate = new Date(wr.recordTime).toLocaleDateString("en-CA", { timeZone: userTz });
                    newSessions.push({
                      sessionId: wr.id,
                      deviceSn: creds.deviceSn!,
                      sessionTime: wr.recordTime,
                      date: sessionDate,
                      amountMl: wr.totalMl || 0,
                      durationSec: wr.drinkTime || 0,
                    });
                  }
                }
              }
              if (newSessions.length > 0) {
                await upsertDrinkingSessions(ctx.user.id, newSessions);
                // Re-query to get only sessions for the requested date
                sessions = await getDrinkingSessions(ctx.user.id, input.date);
              }
            }
          } catch (fetchErr) {
            console.error("[drinkingSessions] Lazy repair fetch failed:", fetchErr);
          }
        }

        return sessions;
      }),

    range: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        return await getDailyLogs(ctx.user.id, input.startDate, input.endDate);
      }),

    exportAll: protectedProcedure.query(async ({ ctx }) => {
      const endDate = new Date().toISOString().split("T")[0];
      const startDate = new Date(Date.now() - 1095 * 86400000).toISOString().split("T")[0];
      const dailyLogs = await getDailyLogs(ctx.user.id, startDate, endDate);
      const hourlyLogs = await getHourlyAverages(ctx.user.id, 365);
      const monthlyLogs = await getMonthlyAverages(ctx.user.id, 36);
      return { dailyLogs, hourlyLogs, monthlyLogs };
    }),
  }),
});

export type AppRouter = typeof appRouter;
