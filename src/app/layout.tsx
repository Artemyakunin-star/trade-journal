import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { getSettings, tzLabel } from "@/lib/settings";
import { currentUserId } from "@/lib/auth";
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
  const [prefs, user] = await Promise.all([
    getSettings(uid),
    db.query.users.findFirst({ where: eq(users.id, uid) }),
  ]);
  return (
    <html lang="en" data-theme={prefs.theme}>
      <body>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar
            footer={`Times shown in ${tzLabel(prefs.timezone)}. CSVs imported as ${tzLabel(prefs.importTimezone)}.`}
            userEmail={user?.email ?? ""}
          />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
