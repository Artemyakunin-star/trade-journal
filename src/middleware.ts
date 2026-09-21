// Redirect unauthenticated visitors to /login (except public routes).
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/session-token";

const PUBLIC = ["/login", "/register", "/faq"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const uid = token ? await verifySessionToken(token) : null;
  if (!uid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
