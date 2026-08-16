import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./context";
import { addDaysToKey } from "@shared/analytics";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    username: "testuser",
    passwordHash: "abc123hash",
    name: "Test User",
    email: "test@example.com",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

function createUnauthContext(): { ctx: TrpcContext } {
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };

  return { ctx };
}

describe("auth router", () => {
  it("returns null for unauthenticated user on auth.me", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user for authenticated user on auth.me", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.username).toBe("testuser");
  });

  it("clears the session cookie on logout", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("credentials router", () => {
  it("returns null when no credentials are stored", async () => {
    const { ctx } = createAuthContext(999);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.credentials.get();
    expect(result).toBeNull();
  });

  it("rejects unauthenticated access to credentials.get", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.credentials.get()).rejects.toThrow();
  });

  it("validates email format in credentials.save", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.credentials.save({ email: "not-an-email", password: "test123", region: "US" })
    ).rejects.toThrow();
  });

  it("validates password is not empty in credentials.save", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.credentials.save({ email: "test@example.com", password: "", region: "US" })
    ).rejects.toThrow();
  });
});

describe("fountain router", () => {
  it("returns error when no credentials configured for liveData", async () => {
    const { ctx } = createAuthContext(998);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.fountain.liveData();
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("No credentials");
  });

  it("returns error when no credentials configured for status", async () => {
    const { ctx } = createAuthContext(997);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.fountain.status();
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("No credentials");
  });

  it("returns error when no credentials configured for devices", async () => {
    const { ctx } = createAuthContext(996);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.fountain.devices();
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("No credentials");
  });

  it("returns error when no credentials configured for events", async () => {
    const { ctx } = createAuthContext(990);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.fountain.events();
    expect(result).toHaveProperty("error");
    expect((result as any).error).toContain("No credentials");
    expect(result.events).toEqual([]);
    expect(result.fetchFailed).toBe(false);
  });

  it("rejects unauthenticated access to fountain.liveData", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.fountain.liveData()).rejects.toThrow();
  });
});

describe("history router", () => {
  it("returns empty array for weekly data with no records", async () => {
    const { ctx } = createAuthContext(995);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.weekly();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns empty array for yearly data with no records", async () => {
    const { ctx } = createAuthContext(994);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.yearly();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns empty array for hourly data with no records", async () => {
    const { ctx } = createAuthContext(993);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.hourly();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("rejects unauthenticated access to history.weekly", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.weekly()).rejects.toThrow();
  });

  it("validates range input dates", async () => {
    const { ctx } = createAuthContext(992);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.range({ startDate: "2025-01-01", endDate: "2025-01-31" });
    expect(Array.isArray(result)).toBe(true);
  });

  it("dailySeries returns rows and the resolved range bounds", async () => {
    const { ctx } = createAuthContext(990);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.dailySeries({ rangeDays: 30 });
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.startKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.endKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("dailySeries spans exactly rangeDays inclusive of today", async () => {
    const { ctx } = createAuthContext(989);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.dailySeries({ rangeDays: 30 });
    // 30 days inclusive means the start is 29 days back, not 30
    expect(addDaysToKey(result.startKey, 29)).toBe(result.endKey);
  });

  it("dailySeries accepts null rangeDays for all history", async () => {
    const { ctx } = createAuthContext(988);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.dailySeries({ rangeDays: null });
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it("dailySeries rejects a zero or negative range", async () => {
    const { ctx } = createAuthContext(987);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.dailySeries({ rangeDays: 0 })).rejects.toThrow();
    await expect(caller.history.dailySeries({ rangeDays: -5 })).rejects.toThrow();
  });

  it("dailySeries rejects a non-integer range", async () => {
    const { ctx } = createAuthContext(986);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.dailySeries({ rangeDays: 30.5 })).rejects.toThrow();
  });

  it("rejects unauthenticated access to history.dailySeries", async () => {
    const { ctx } = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.history.dailySeries({ rangeDays: 30 })).rejects.toThrow();
  });

  it("exportAll returns dailyLogs, hourlyLogs, and monthlyLogs", async () => {
    const { ctx } = createAuthContext(991);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.history.exportAll();
    expect(result).toHaveProperty("dailyLogs");
    expect(result).toHaveProperty("hourlyLogs");
    expect(result).toHaveProperty("monthlyLogs");
    expect(Array.isArray(result.dailyLogs)).toBe(true);
    expect(Array.isArray(result.hourlyLogs)).toBe(true);
    expect(Array.isArray(result.monthlyLogs)).toBe(true);
  });
});

describe("PetlibroAPI class", () => {
  it("can be imported and instantiated", async () => {
    const { PetlibroAPI } = await import("./petlibro-api");
    const api = new PetlibroAPI("test@test.com", "pass", "US");
    expect(api).toBeDefined();
  });

  it("testConnection fails with invalid credentials", async () => {
    const { PetlibroAPI } = await import("./petlibro-api");
    const api = new PetlibroAPI("invalid@test.com", "wrongpass", "US");
    const result = await api.testConnection();
    expect(result.success).toBe(false);
  });

  it("getOrCreateAPI caches instances", async () => {
    const { getOrCreateAPI } = await import("./petlibro-api");
    const api1 = getOrCreateAPI("cache@test.com", "pass", "US");
    const api2 = getOrCreateAPI("cache@test.com", "pass", "US");
    expect(api1).toBe(api2);
  });

  it("getDeviceEvents returns empty array on failure", async () => {
    const { PetlibroAPI } = await import("./petlibro-api");
    const api = new PetlibroAPI("test@test.com", "pass", "US");
    const events = await api.getDeviceEvents("fake-sn");
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });
});
