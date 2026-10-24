"use server";
// Registration / login / logout. The first account to register adopts all
// pre-multi-user rows (user_id = 'legacy') — the original owner's journal.
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  docImages, docs, executions, ideas, imports, instruments, plans, settings, trades, userCommissions, users,
} from "@/db/schema";
import { createSession, destroySession } from "@/lib/auth";

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

const back = (page: "login" | "register", msg: string, email: string) =>
  redirect(`/${page}?error=${encodeURIComponent(msg)}&email=${encodeURIComponent(email)}`);

export async function register(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("register", "Enter a valid email address", email);
  if (password.length < 8) back("register", "Password must be at least 8 characters", email);

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) back("register", "An account with this email already exists — sign in instead", email);

  const isFirst = Number((await db.select({ n: sql<number>`count(*)` }).from(users))[0].n) === 0;
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();

  if (isFirst) {
    // Adopt everything imported before accounts existed.
    for (const t of [trades, ideas, plans, docs, docImages, executions, imports, settings] as const) {
      await db.update(t).set({ userId: user.id }).where(eq(t.userId, "legacy"));
    }
    // Carry over per-instrument commissions the original owner had configured.
    const inst = await db.select().from(instruments);
    for (const i of inst) {
      if (Number(i.commission) > 0) {
        await db.insert(userCommissions).values({ userId: user.id, symbol: i.symbol, commission: i.commission }).onConflictDoNothing();
      }
    }
  }

  await createSession(user.id);
  redirect("/");
}

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    back("login", "Wrong email or password", email);
    return;
  }
  await createSession(user.id);
  redirect("/");
}

/** A user asks for a password reset. No email service in the beta: the
 *  request lands on the Admin screen, the owner sends the link by hand.
 *  The response never reveals whether the email exists. */
export async function requestPasswordReset(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const user = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (user) {
      const { passwordResets } = await import("@/db/schema");
      const recent = await db.query.passwordResets.findFirst({
        where: (r, { and: and_, eq: eq_, isNull: isNull_, gt: gt_ }) =>
          and_(eq_(r.userId, user.id), isNull_(r.usedAt), gt_(r.expiresAt, new Date())),
      });
      if (!recent) {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
        await db.insert(passwordResets).values({
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        });
      }
    }
  }
  redirect("/forgot?sent=1");
}

/** Set a new password using a one-time link. */
export async function resetPassword(fd: FormData) {
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const fail = (msg: string): never => redirect(`/reset/${encodeURIComponent(token)}?error=${encodeURIComponent(msg)}`);
  if (password.length < 8) fail("Password must be at least 8 characters");
  if (password !== String(fd.get("password2") ?? "")) fail("Passwords don't match");
  const { passwordResets } = await import("@/db/schema");
  const row = await db.query.passwordResets.findFirst({ where: (r, { eq: eq_ }) => eq_(r.token, token) });
  if (!row || row.usedAt || row.expiresAt < new Date()) fail("This link has expired or was already used — request a new one");
  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row!.userId));
  await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row!.id));
  await createSession(row!.userId);
  redirect("/");
}

/** Admin: issue a reset link for a user by hand (shown on the Admin screen). */
export async function adminIssueReset(fd: FormData) {
  const { realUserId } = await import("@/lib/auth");
  const uid = await realUserId();
  const firstUser = await db.query.users.findFirst({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
  if (!uid || !firstUser || firstUser.id !== uid) redirect("/");
  const targetId = str(fd, "userId");
  const target = await db.query.users.findFirst({ where: eq(users.id, targetId) });
  if (target) {
    const { passwordResets } = await import("@/db/schema");
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    await db.insert(passwordResets).values({ userId: target.id, token, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  }
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
