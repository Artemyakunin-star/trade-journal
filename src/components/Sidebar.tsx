"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", ico: "▦", label: "Dashboard" },
  { href: "/trades", ico: "⇄", label: "Trades" },
  { href: "/ideas", ico: "✦", label: "Ideas" },
  { href: "/calendar", ico: "▤", label: "Calendar" },
  { href: "/day", ico: "☀", label: "Day" },
  { href: "/import", ico: "⇪", label: "Import" },
];

export default function Sidebar() {
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
      <div className="foot">Times shown in Europe/Kyiv. NinjaTrader CSVs imported as Chicago time.</div>
    </aside>
  );
}
