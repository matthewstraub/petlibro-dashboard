import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
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
      clearCookie: () => {},
    } as TrpcContext["res"],
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
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

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
      caller.credentials.save({
        email: "not-an-email",
        password: "test123",
        region: "US",
      })
    ).rejects.toThrow();
  });

  it("validates password is not empty in credentials.save", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.credentials.save({
        email: "test@example.com",
        password: "",
        region: "US",
      })
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

    const result = await caller.history.range({
      startDate: "2025-01-01",
      endDate: "2025-01-31",
    });
    expect(Array.isArray(result)).toBe(true);
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
    // Without login, this should fail gracefully and return empty array
    const events = await api.getDeviceEvents("fake-sn");
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });

  it("DeviceEvent interface is exported", async () => {
    const mod = await import("./petlibro-api");
    // Verify the module exports PetlibroAPI with getDeviceEvents method
    const api = new mod.PetlibroAPI("test@test.com", "pass", "US");
    expect(typeof api.getDeviceEvents).toBe("function");
  });
});
