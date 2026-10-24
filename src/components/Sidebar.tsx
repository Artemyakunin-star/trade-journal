"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ITEMS = [
  { href: "/", ico: "▦", label: "Dashboard" },
  { href: "/live", ico: "⏺", label: "Live" },
  { href: "/plans", ico: "≣", label: "Plans" },
  { href: "/trades", ico: "⇄", label: "Trades" },
  { href: "/ideas", ico: "✦", label: "Ideas" },
  { href: "/missed", ico: "⊘", label: "Missed" },
  { href: "/calendar", ico: "▤", label: "Calendar" },
  { href: "/analytics", ico: "∿", label: "Analytics" },
  { href: "/lab", ico: "⚗", label: "Lab" },
  { href: "/day", ico: "☀", label: "Day" },
  { href: "/recap", ico: "☾", label: "Recap" },
  { href: "/rules", ico: "⚖", label: "Rules" },
  { href: "/notes", ico: "✎", label: "Notes" },
  { href: "/import", ico: "⇪", label: "Import" },
  { href: "/guide", ico: "⚐", label: "Guide" },
  { href: "/faq", ico: "?", label: "Help / FAQ" },
  { href: "/feedback", ico: "✉", label: "Feedback" },
  { href: "/settings", ico: "⚙", label: "Settings" },
];

export default function Sidebar({
  footer,
  userEmail,
  showAdmin = false,
}: {
  footer?: string;
  userEmail?: string;
  showAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Navigating closes the mobile drawer.
  useEffect(() => setOpen(false), [pathname]);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
  const items = showAdmin ? [...ITEMS, { href: "/admin", ico: "◎", label: "Admin" }] : ITEMS;

  return (
    <>
    {/* Phone-width header: fixed bar with a burger; the sidebar becomes a drawer. */}
    <div className="mobile-bar">
      <button className="burger" type="button" aria-label="Menu" onClick={() => setOpen((v) => !v)}>☰</button>
      <span style={{ fontWeight: 700, fontSize: 14.5 }}>
        Trade<span className="accent" style={{ color: "var(--s1)" }}>Journal</span>
      </span>
    </div>
    {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="logo">
        Trade<span className="accent">Journal</span>
        <span className="tag">futures edition</span>
      </div>
      {items.map((it) => (
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
    </>
  );
}
