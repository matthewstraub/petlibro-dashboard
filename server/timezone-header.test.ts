/**
 * Every Petlibro request must carry the account's own timezone.
 *
 * Petlibro buckets days by the timezone header on the request, so a fountain
 * at a second location outside Eastern time would otherwise have its days cut
 * at Eastern midnight while the app stores them under local dates. These tests
 * pin that the scheduled sync and the dashboard both pass the timezone from
 * Settings through to the API client.
 */
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import type { TrpcContext } from "./context";

const mocks = vi.hoisted(() => {
  const fakeApi = {
    getDrinkWaterData: async () => ({
      todayTotalMl: 120,
      todayTotalTimes: 4,
      petEatingTime: 60,
      avgDrinkDuration: 15,
      yesterdayTotalMl: 0,
      yesterdayTotalTimes: 0,
    }),
    getFountainStatus: async () => null,
    getDrinkHistory: async () => null,
    getWorkRecords: async () => [],
    getDeviceRealInfo: async () => null,
  };
  return {
    getOrCreateAPI: vi.fn((..._args: unknown[]) => fakeApi),
    // A Dockstream 2 at a second location, set to Pacific time in Settings.
    creds: {
      id: 1,
      userId: 7,
      email: "cabin@example.com",
      password: "pw",
      region: "US",
      deviceSn: "PLWF106-TEST",
      timezone: "America/Los_Angeles",
      lastSyncAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
});

vi.mock("./petlibro-api", async importOriginal => ({
  ...(await importOriginal<typeof import("./petlibro-api")>()),
  getOrCreateAPI: mocks.getOrCreateAPI,
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: async () => ({
    execute: async () => [[{ userId: mocks.creds.userId }]],
  }),
  getCredentials: async () => mocks.creds,
  upsertDailyLog: async () => {},
  replaceHourlyLogsForDate: async () => {},
  upsertDrinkingSessions: async () => {},
  getSessionIntegrity: async () => ({ expectedCount: 0, storedCount: 0 }),
  updateLastSync: async () => {},
  recordPetlibroEvents: async () => 0,
}));

import { registerCronRoutes } from "./cron";
import { appRouter } from "./routers";

type Handler = (req: unknown, res: unknown) => Promise<void>;

function cronRoute(path: string): Handler {
  const routes = new Map<string, Handler>();
  registerCronRoutes({
    get: (p: string, h: Handler) => routes.set(p, h),
  } as unknown as Express);
  const handler = routes.get(path);
  if (!handler) throw new Error(`No route registered at ${path}`);
  return handler;
}

function fakeResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function authContext(): TrpcContext {
  return {
    user: {
      id: mocks.creds.userId,
      username: "cabin",
      passwordHash: "hash",
      name: null,
      email: null,
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

const originalCronSecret = process.env.CRON_SECRET;

describe("Petlibro requests carry the account's timezone", () => {
  beforeEach(() => {
    mocks.getOrCreateAPI.mockClear();
    process.env.CRON_SECRET = "test-secret";
  });

  afterAll(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it("in the scheduled sync", async () => {
    const res = fakeResponse();
    await cronRoute("/api/cron/sync")(
      { headers: { "x-cron-secret": "test-secret" }, query: {} },
      res
    );

    expect(res.body).toMatchObject({ success: true, synced: 1, errors: 0 });
    expect(mocks.getOrCreateAPI).toHaveBeenCalled();
    for (const args of mocks.getOrCreateAPI.mock.calls) {
      expect(args).toEqual([
        "cabin@example.com",
        "pw",
        "US",
        "America/Los_Angeles",
      ]);
    }
  });

  it("on the dashboard", async () => {
    const caller = appRouter.createCaller(authContext());
    await caller.fountain.liveData();
    await caller.fountain.status();
    await caller.fountain.events();

    expect(mocks.getOrCreateAPI).toHaveBeenCalledTimes(3);
    for (const args of mocks.getOrCreateAPI.mock.calls) {
      expect(args[3]).toBe("America/Los_Angeles");
    }
  });
});
