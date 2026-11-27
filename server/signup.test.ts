/**
 * Sign-up closes once a site has its first account.
 *
 * Each site is one household's fountain. With sign-up left open, anyone who
 * found the URL could register, and the scheduled sync would then sync their
 * Petlibro login too. These tests pin that a new site's first account can
 * still be created, that later ones can't (even by calling the API directly
 * rather than through the sign-in page), and that ALLOW_SIGNUP reopens it.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./context";

const mocks = vi.hoisted(() => ({
  hasAnyUser: vi.fn(async () => false),
  getUserByUsername: vi.fn(
    async (_username: string): Promise<unknown> => undefined
  ),
  createUser: vi.fn(async (data: { username: string }) => ({
    id: 1,
    username: data.username,
  })),
}));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  hasAnyUser: mocks.hasAnyUser,
  getUserByUsername: mocks.getUserByUsername,
  createUser: mocks.createUser,
}));

import { appRouter } from "./routers";

/** A signed-out visitor on the sign-in page. */
function visitor() {
  const cookie = vi.fn();
  const ctx = {
    user: null,
    req: { protocol: "https", headers: {} },
    res: { cookie, clearCookie: vi.fn() },
  } as unknown as TrpcContext;
  return { caller: appRouter.createCaller(ctx), cookie };
}

const NEW_ACCOUNT = { username: "neighbor", password: "a-test-password" };
const CLOSED = { success: false, error: "Sign-up is closed on this site." };
const originalAllowSignup = process.env.ALLOW_SIGNUP;

describe("sign-up", () => {
  beforeEach(() => {
    delete process.env.ALLOW_SIGNUP;
    mocks.hasAnyUser.mockResolvedValue(false);
    mocks.createUser.mockClear();
  });

  afterAll(() => {
    if (originalAllowSignup === undefined) delete process.env.ALLOW_SIGNUP;
    else process.env.ALLOW_SIGNUP = originalAllowSignup;
  });

  it("is open on a new site, so its first account can be created", async () => {
    const { caller, cookie } = visitor();

    expect(await caller.auth.signupOpen()).toBe(true);
    expect(await caller.auth.register(NEW_ACCOUNT)).toEqual({ success: true });
    expect(mocks.createUser).toHaveBeenCalledOnce();
    expect(cookie).toHaveBeenCalledOnce();
  });

  it("closes once the site has an account", async () => {
    mocks.hasAnyUser.mockResolvedValue(true);
    const { caller, cookie } = visitor();

    expect(await caller.auth.signupOpen()).toBe(false);
    expect(await caller.auth.register(NEW_ACCOUNT)).toEqual(CLOSED);
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it.each(["true", "TRUE", " 1 ", "yes"])(
    "reopens with ALLOW_SIGNUP=%j",
    async value => {
      mocks.hasAnyUser.mockResolvedValue(true);
      process.env.ALLOW_SIGNUP = value;
      const { caller } = visitor();

      expect(await caller.auth.signupOpen()).toBe(true);
      expect(await caller.auth.register(NEW_ACCOUNT)).toEqual({
        success: true,
      });
      expect(mocks.createUser).toHaveBeenCalledOnce();
    }
  );

  it.each(["", "false", "0", "no"])(
    "stays closed with ALLOW_SIGNUP=%j",
    async value => {
      mocks.hasAnyUser.mockResolvedValue(true);
      process.env.ALLOW_SIGNUP = value;
      const { caller } = visitor();

      expect(await caller.auth.signupOpen()).toBe(false);
      expect(await caller.auth.register(NEW_ACCOUNT)).toEqual(CLOSED);
      expect(mocks.createUser).not.toHaveBeenCalled();
    }
  );
});
