import type { Metadata } from "next";
import "./globals.css";

// System font stack (no network fetch at build time; matches the mockup).
export const metadata: Metadata = {
  title: "TradeJournal",
  description: "Trading journal & analytics for futures — plans, ideas, trades, MAE/MFE what-if.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
