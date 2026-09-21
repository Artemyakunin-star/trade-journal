// Edge-safe session token helpers (used by middleware and by lib/auth).
// Web Crypto only — no Node built-ins.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tj_session";
export const SESSION_DAYS = 90;

async function secret(): Promise<Uint8Array> {
  const src = process.env.AUTH_SECRET || `tj-auth:${process.env.DATABASE_URL ?? "dev"}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(src));
  return new Uint8Array(digest);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(await secret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, await secret());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}
