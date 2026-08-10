import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "TradeJournal",
  description: "Trading journal & analytics for futures — plans, ideas, trades, MAE/MFE what-if.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh" }}>
          <Sidebar />
          <div className="main">{children}</div>
        </div>
      </body>
    </html>
  );
}
