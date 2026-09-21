// POST /logout — clear the session cookie and go to /login.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
