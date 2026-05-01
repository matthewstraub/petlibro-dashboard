import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, dailyWaterLog, hourlyWaterLog, petlibroCredentials } from "../drizzle/schema";
import type { InsertDailyWaterLog, InsertHourlyWaterLog, InsertPetlibroCredentials } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Petlibro Credentials ====================

export async function getCredentials(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(petlibroCredentials).where(eq(petlibroCredentials.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertCredentials(data: InsertPetlibroCredentials) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getCredentials(data.userId);
  if (existing) {
    await db.update(petlibroCredentials)
      .set({
        email: data.email,
        password: data.password,
        region: data.region,
        deviceSn: data.deviceSn,
      })
      .where(eq(petlibroCredentials.userId, data.userId));
  } else {
    await db.insert(petlibroCredentials).values(data);
  }
}

export async function updateDeviceSn(userId: number, deviceSn: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(petlibroCredentials)
    .set({ deviceSn })
    .where(eq(petlibroCredentials.userId, userId));
}

export async function updateLastSync(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(petlibroCredentials)
    .set({ lastSyncAt: new Date() })
    .where(eq(petlibroCredentials.userId, userId));
}

// ==================== Daily Water Log ====================

export async function upsertDailyLog(data: InsertDailyWaterLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(dailyWaterLog)
    .where(and(
      eq(dailyWaterLog.userId, data.userId),
      eq(dailyWaterLog.date, data.date as any)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(dailyWaterLog)
      .set({
        totalMl: data.totalMl,
        drinkingCount: data.drinkingCount,
        totalDrinkingTime: data.totalDrinkingTime,
        avgDrinkDuration: data.avgDrinkDuration,
      })
      .where(eq(dailyWaterLog.id, existing[0].id));
  } else {
    await db.insert(dailyWaterLog).values(data);
  }
}

export async function getDailyLogs(userId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(dailyWaterLog)
    .where(and(
      eq(dailyWaterLog.userId, userId),
      gte(dailyWaterLog.date, startDate as any),
      lte(dailyWaterLog.date, endDate as any)
    ))
    .orderBy(dailyWaterLog.date);
}

export async function getMonthlyAverages(userId: number, months: number = 12) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT 
      DATE_FORMAT(date, '%Y-%m') as month,
      AVG(totalMl) as avgMl,
      SUM(totalMl) as totalMl,
      AVG(drinkingCount) as avgCount,
      COUNT(*) as daysRecorded
    FROM daily_water_log 
    WHERE userId = ${userId} 
      AND date >= DATE_SUB(CURDATE(), INTERVAL ${months} MONTH)
    GROUP BY DATE_FORMAT(date, '%Y-%m')
    ORDER BY month ASC
  `);

  return (result as any)[0] || [];
}

// ==================== Hourly Water Log ====================

export async function upsertHourlyLog(data: InsertHourlyWaterLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(hourlyWaterLog)
    .where(and(
      eq(hourlyWaterLog.userId, data.userId),
      eq(hourlyWaterLog.date, data.date as any),
      eq(hourlyWaterLog.hour, data.hour)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(hourlyWaterLog)
      .set({
        totalMl: data.totalMl,
        drinkingCount: data.drinkingCount,
      })
      .where(eq(hourlyWaterLog.id, existing[0].id));
  } else {
    await db.insert(hourlyWaterLog).values(data);
  }
}

export async function getHourlyAverages(userId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT 
      hour,
      AVG(totalMl) as avgMl,
      AVG(drinkingCount) as avgCount,
      COUNT(*) as daysRecorded
    FROM hourly_water_log 
    WHERE userId = ${userId} 
      AND date >= DATE_SUB(CURDATE(), INTERVAL ${days} DAY)
    GROUP BY hour
    ORDER BY hour ASC
  `);

  return (result as any)[0] || [];
}
