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

/** The signed-in user's id, or null. Cached per request. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/** The signed-in user's id; throws if unauthenticated (middleware should
 *  have redirected long before this fires). */
export async function requireUserId(): Promise<string> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  return uid;
}
