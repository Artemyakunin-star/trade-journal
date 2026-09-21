import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { getSettings, tzLabel } from "@/lib/settings";
import { currentUserId, inSandbox } from "@/lib/auth";
import { exitSandbox } from "@/app/actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "TradeJournal",
  description: "Trading journal & analytics for futures — plans, ideas, trades, MAE/MFE what-if.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const uid = await currentUserId();
  if (!uid) {
    // Logged-out shell (login / register / FAQ): no sidebar.
    return (
      <html lang="en">
        <body>
          <div className="main" style={{ width: "100%" }}>{children}</div>
        </body>
      </html>
    );
  }
  const [prefs, user, firstUser, sandbox] = await Promise.all([
    getSettings(uid),
    db.query.users.findFirst({ where: eq(users.id, uid) }),
    db.query.users.findFirst({ orderBy: (u, { asc }) => [asc(u.createdAt)] }),
    inSandbox(),
  ]);
  return (
    <html lang="en" data-theme={prefs.theme}>
      <body>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar
            footer={`Times shown in ${tzLabel(prefs.timezone)}. CSVs imported as ${tzLabel(prefs.importTimezone)}.`}
            userEmail={sandbox ? "Sandbox mode" : user?.email ?? ""}
            showAdmin={sandbox || firstUser?.id === uid}
          />
          <div className="main">
            {sandbox && (
              <div
                style={{
                  background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                  border: "1px solid var(--accent)", borderRadius: 8, padding: "8px 12px",
                  margin: "10px 0 0", display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                }}
              >
                <b>SANDBOX</b> — a scratch journal for testing sample imports. Your own statistics are untouched.
                <form action={exitSandbox} style={{ marginLeft: "auto" }}>
                  <button className="btn btn-sm" type="submit">Back to my journal</button>
                </form>
              </div>
            )}
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
