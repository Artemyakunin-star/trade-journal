import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { getSettings, tzLabel } from "@/lib/settings";

export const metadata: Metadata = {
  title: "TradeJournal",
  description: "Trading journal & analytics for futures — plans, ideas, trades, MAE/MFE what-if.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const prefs = await getSettings();
  return (
    <html lang="en" data-theme={prefs.theme}>
      <body>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar footer={`Times shown in ${tzLabel(prefs.timezone)}. CSVs imported as ${tzLabel(prefs.importTimezone)}.`} />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
