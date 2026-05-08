import { eq, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users, dailyWaterLog, hourlyWaterLog, petlibroCredentials, drinkingSessions } from "../drizzle/schema";
import type { InsertUser, InsertDailyWaterLog, InsertHourlyWaterLog, InsertPetlibroCredentials } from "../drizzle/schema";

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

// ==================== User Auth ====================

export async function getUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUser(data: { username: string; passwordHash: string; name?: string; email?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(users).values({
    username: data.username,
    passwordHash: data.passwordHash,
    name: data.name || null,
    email: data.email || null,
    role: "admin",
  });
  return await getUserByUsername(data.username);
}

export async function updateLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

// ==================== Petlibro Credentials ====================

export async function getCredentials(userId: number) {
  const db = await getDb();
  if (!db) return null;
  try {
    // Use raw SQL to gracefully handle missing timezone column
    const result = await db.execute(sql`
      SELECT id, userId, email, password, region, deviceSn, lastSyncAt, createdAt, updatedAt,
        CASE WHEN EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'petlibro_credentials' AND column_name = 'timezone'
          AND table_schema = DATABASE()
        ) THEN timezone ELSE 'America/New_York' END as timezone
      FROM petlibro_credentials WHERE userId = ${userId} LIMIT 1
    `);
    const rows = (result as any)[0];
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      password: row.password,
      region: row.region,
      deviceSn: row.deviceSn,
      timezone: row.timezone || "America/New_York",
      lastSyncAt: row.lastSyncAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  } catch (e) {
    // Fallback: if the dynamic SQL fails, try without timezone
    const result = await db.execute(sql`
      SELECT id, userId, email, password, region, deviceSn, lastSyncAt, createdAt, updatedAt
      FROM petlibro_credentials WHERE userId = ${userId} LIMIT 1
    `);
    const rows = (result as any)[0];
    if (!rows || rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      password: row.password,
      region: row.region,
      deviceSn: row.deviceSn,
      timezone: "America/New_York",
      lastSyncAt: row.lastSyncAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
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

export async function updateTimezone(userId: number, timezone: string) {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };
  try {
    // Check if column exists first
    const [cols] = await db.execute(sql`
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'petlibro_credentials' AND column_name = 'timezone'
      AND table_schema = DATABASE()
    `) as any;
    if (!cols || cols.length === 0) {
      return { success: false, error: "Timezone column not yet migrated. Please run /api/migrate first." };
    }
    await db.execute(sql`
      UPDATE petlibro_credentials SET timezone = ${timezone} WHERE userId = ${userId}
    `);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Failed to update timezone" };
  }
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

export async function getHourlyLogsForDate(userId: number, date: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(hourlyWaterLog)
    .where(and(
      eq(hourlyWaterLog.userId, userId),
      eq(hourlyWaterLog.date, date as any)
    ))
    .orderBy(hourlyWaterLog.hour);
}

export async function getDailyDetail(userId: number, date: string) {
  const db = await getDb();
  if (!db) return { summary: null, hourly: [] };

  const dailyResult = await db.select().from(dailyWaterLog)
    .where(and(
      eq(dailyWaterLog.userId, userId),
      eq(dailyWaterLog.date, date as any)
    ))
    .limit(1);

  const hourlyResult = await db.select().from(hourlyWaterLog)
    .where(and(
      eq(hourlyWaterLog.userId, userId),
      eq(hourlyWaterLog.date, date as any)
    ))
    .orderBy(hourlyWaterLog.hour);

  return {
    summary: dailyResult.length > 0 ? dailyResult[0] : null,
    hourly: hourlyResult,
  };
}

// ==================== Drinking Sessions ====================

export async function upsertDrinkingSessions(
  userId: number,
  sessions: Array<{
    sessionId: string;
    deviceSn: string;
    sessionTime: number;
    date: string;
    amountMl: number;
    durationSec: number;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Use INSERT IGNORE to skip duplicates (based on unique key userId+sessionId)
  for (const s of sessions) {
    try {
      await db.execute(sql`
        INSERT IGNORE INTO drinking_sessions (userId, sessionId, deviceSn, sessionTime, date, amountMl, durationSec)
        VALUES (${userId}, ${s.sessionId}, ${s.deviceSn}, ${s.sessionTime}, ${s.date}, ${s.amountMl}, ${s.durationSec})
      `);
    } catch (e) {
      // Skip individual insert errors (e.g., duplicate key)
      console.warn(`[DB] Failed to insert session ${s.sessionId}:`, e);
    }
  }
}

export async function getDrinkingSessions(userId: number, date: string) {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db.execute(sql`
      SELECT sessionId, deviceSn, sessionTime, date, amountMl, durationSec, createdAt
      FROM drinking_sessions
      WHERE userId = ${userId} AND date = ${date}
      ORDER BY sessionTime DESC
    `);
    return (result as any)[0] || [];
  } catch (e) {
    // Table might not exist yet
    console.warn("[DB] getDrinkingSessions failed (table may not exist):", e);
    return [];
  }
}

/**
 * Get the expected session count from daily_water_log for a specific date.
 * Returns { expectedCount, storedCount } for integrity comparison.
 */
export async function getSessionIntegrity(userId: number, date: string): Promise<{ expectedCount: number; storedCount: number }> {
  const db = await getDb();
  if (!db) return { expectedCount: 0, storedCount: 0 };

  try {
    // Get expected count from daily_water_log
    const dailyResult = await db.execute(sql`
      SELECT drinkingCount FROM daily_water_log
      WHERE userId = ${userId} AND date = ${date}
      LIMIT 1
    `);
    const dailyRows = (dailyResult as any)[0] || [];
    const expectedCount = dailyRows.length > 0 ? (dailyRows[0].drinkingCount || 0) : 0;

    // Get stored session count from drinking_sessions
    const sessionResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM drinking_sessions
      WHERE userId = ${userId} AND date = ${date}
    `);
    const sessionRows = (sessionResult as any)[0] || [];
    const storedCount = sessionRows.length > 0 ? (sessionRows[0].cnt || 0) : 0;

    return { expectedCount, storedCount };
  } catch (e) {
    console.warn("[DB] getSessionIntegrity failed:", e);
    return { expectedCount: 0, storedCount: 0 };
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
