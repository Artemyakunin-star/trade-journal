"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", ico: "▦", label: "Dashboard" },
  { href: "/plans", ico: "≣", label: "Plans" },
  { href: "/trades", ico: "⇄", label: "Trades" },
  { href: "/ideas", ico: "✦", label: "Ideas" },
  { href: "/calendar", ico: "▤", label: "Calendar" },
  { href: "/analytics", ico: "∿", label: "Analytics" },
  { href: "/day", ico: "☀", label: "Day" },
  { href: "/import", ico: "⇪", label: "Import" },
  { href: "/faq", ico: "?", label: "Help / FAQ" },
  { href: "/settings", ico: "⚙", label: "Settings" },
];

export default function Sidebar({ footer, userEmail }: { footer?: string; userEmail?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <div className="logo">
        Trade<span className="accent">Journal</span>
        <span className="tag">futures edition</span>
      </div>
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={"nav-item" + (isActive(it.href) ? " active" : "")}>
          <span className="ico">{it.ico}</span>
          {it.label}
        </Link>
      ))}
      <div className="foot">
        {userEmail && (
          <div style={{ marginBottom: 6, wordBreak: "break-all" }}>
            {userEmail}{" "}
            <form action="/logout" method="post" style={{ display: "inline" }}>
              <button
                type="submit"
                style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }}
              >
                Sign out
              </button>
            </form>
          </div>
        )}
        {footer ?? "NinjaTrader CSVs imported as Chicago time."}
      </div>
    </aside>
  );
}
