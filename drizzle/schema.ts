import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, date } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * Daily water intake log - stores each day's total consumption data.
 * This is the primary table for historical trend analysis.
 */
export const dailyWaterLog = mysqlTable("daily_water_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: date("date").notNull(),
  totalMl: float("totalMl").notNull().default(0),
  drinkingCount: int("drinkingCount").notNull().default(0),
  totalDrinkingTime: int("totalDrinkingTime").notNull().default(0),
  avgDrinkDuration: int("avgDrinkDuration").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Hourly water intake breakdown - stores per-hour drinking data
 * for time-of-day analysis.
 */
export const hourlyWaterLog = mysqlTable("hourly_water_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: date("date").notNull(),
  hour: int("hour").notNull(),
  totalMl: float("totalMl").notNull().default(0),
  drinkingCount: int("drinkingCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Petlibro API credentials storage (encrypted at rest via app logic).
 */
export const petlibroCredentials = mysqlTable("petlibro_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  password: text("password").notNull(),
  region: varchar("region", { length: 20 }).notNull().default("US"),
  deviceSn: varchar("deviceSn", { length: 128 }),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type DailyWaterLog = typeof dailyWaterLog.$inferSelect;
export type InsertDailyWaterLog = typeof dailyWaterLog.$inferInsert;
export type HourlyWaterLog = typeof hourlyWaterLog.$inferSelect;
export type InsertHourlyWaterLog = typeof hourlyWaterLog.$inferInsert;
export type PetlibroCredentials = typeof petlibroCredentials.$inferSelect;
export type InsertPetlibroCredentials = typeof petlibroCredentials.$inferInsert;
