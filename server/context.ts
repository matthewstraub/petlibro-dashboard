import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { verifySession } from "./auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    const cookieHeader = opts.req.headers.cookie || "";
    const cookies = parseCookies(cookieHeader);
    const token = cookies[COOKIE_NAME];

    if (token) {
      user = await verifySession(token);
    }
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach(cookie => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(rest.join("="));
    }
  });
  return cookies;
}
