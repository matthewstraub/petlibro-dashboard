import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";
import { getUserById, getUserByUsername } from "./db";
import type { User } from "../drizzle/schema";

const JWT_SECRET_KEY = () => {
  const secret = process.env.JWT_SECRET || "petlibro-dashboard-secret-change-me";
  return new TextEncoder().encode(secret);
};

/**
 * Hash a password using SHA-256.
 * For a personal dashboard this is sufficient; for multi-user production use bcrypt.
 */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

/**
 * Create a signed JWT session token.
 */
export async function createSessionToken(userId: number): Promise<string> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET_KEY());
  return token;
}

/**
 * Verify a session token and return the user.
 */
export async function verifySession(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY());
    const userId = payload.userId as number;
    if (!userId) return null;
    const user = await getUserById(userId);
    return user || null;
  } catch {
    return null;
  }
}
