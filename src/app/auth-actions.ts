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

export async function logout() {
  await destroySession();
  redirect("/login");
}
