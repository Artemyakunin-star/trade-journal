// Session auth: signed JWT in an httpOnly cookie. Token logic lives in
// session-token.ts (edge-safe, shared with middleware).
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, SESSION_DAYS, signSessionToken, verifySessionToken } from "@/lib/session-token";

export { SESSION_COOKIE };

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export const SANDBOX_COOKIE = "tj_sandbox";
export const SANDBOX_EMAIL = "sandbox@tradejournal.local";

/** The REAL signed-in user's id (ignores sandbox mode). Cached per request. */
export const realUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/** The id of the owner account (the first registered user), or null. */
export const ownerUserId = cache(async (): Promise<string | null> => {
  const { db } = await import("@/db");
  const first = await db.query.users.findFirst({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
  return first?.id ?? null;
});

/** The effective user id for all data access. In sandbox mode (owner only)
 *  this is the sandbox account — a scratch journal for testing imports
 *  without touching the owner's own statistics. Cached per request. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const uid = await realUserId();
  if (!uid) return null;
  const jar = await cookies();
  if (jar.get(SANDBOX_COOKIE)?.value !== "1") return uid;
  if ((await ownerUserId()) !== uid) return uid; // only the owner can sandbox
  const { db } = await import("@/db");
  const sandbox = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.email, SANDBOX_EMAIL) });
  return sandbox?.id ?? uid;
});

/** True when the current request is running against the sandbox journal. */
export async function inSandbox(): Promise<boolean> {
  const [real, eff] = await Promise.all([realUserId(), currentUserId()]);
  return real !== null && eff !== null && real !== eff;
}

/** The signed-in user's id; throws if unauthenticated (middleware should
 *  have redirected long before this fires). */
export async function requireUserId(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  return uid;
}
