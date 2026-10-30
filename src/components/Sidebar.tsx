"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveSidebarLayout } from "@/app/actions";

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

type Item = (typeof ITEMS)[number];

/** Apply the saved order: known hrefs follow it, items it doesn't know (new
 *  pages added in updates) slot back in at their default position. */
function applyOrder(defaults: Item[], saved: string[]): Item[] {
  if (!saved.length) return defaults;
  const byHref = new Map(defaults.map((i) => [i.href, i]));
  const ordered = saved.map((h) => byHref.get(h)).filter((x): x is Item => !!x);
  const seen = new Set(ordered.map((i) => i.href));
  const result = [...ordered];
  defaults.forEach((item, idx) => {
    if (!seen.has(item.href)) result.splice(Math.min(idx, result.length), 0, item);
  });
  return result;
}

export default function Sidebar({
  footer,
  userEmail,
  showAdmin = false,
  initialOrder = [],
  initialHidden = [],
}: {
  footer?: string;
  userEmail?: string;
  showAdmin?: boolean;
  initialOrder?: string[];
  initialHidden?: string[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [hidden, setHidden] = useState<string[]>(initialHidden);
  const [showHidden, setShowHidden] = useState(false);
  const [dragHref, setDragHref] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigating closes the mobile drawer.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const defaults = showAdmin ? [...ITEMS, { href: "/admin", ico: "◎", label: "Admin" }] : ITEMS;
  const arranged = applyOrder(defaults, order);
  const visible = arranged.filter((i) => !hidden.includes(i.href));
  const hiddenItems = arranged.filter((i) => hidden.includes(i.href));

  const persist = (nextOrder: string[], nextHidden: string[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void saveSidebarLayout({ order: nextOrder, hidden: nextHidden }), 500);
  };

  const commitOrder = (list: Item[]) => {
    const next = list.map((i) => i.href);
    setOrder(next);
    persist(next, hidden);
  };

  const move = (href: string, dir: -1 | 1) => {
    const list = [...arranged];
    const i = list.findIndex((x) => x.href === href);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    commitOrder(list);
  };

  const dropOn = (targetHref: string) => {
    if (!dragHref || dragHref === targetHref) return;
    const list = arranged.filter((x) => x.href !== dragHref);
    const dragged = arranged.find((x) => x.href === dragHref)!;
    const idx = list.findIndex((x) => x.href === targetHref);
    list.splice(idx, 0, dragged);
    commitOrder(list);
    setDragHref(null);
  };

  const toggleHidden = (href: string) => {
    const next = hidden.includes(href) ? hidden.filter((h) => h !== href) : [...hidden, href];
    setHidden(next);
    persist(order.length ? order : arranged.map((i) => i.href), next);
  };

  const reset = () => {
    setOrder([]);
    setHidden([]);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void saveSidebarLayout({ order: [], hidden: [] });
  };

  const editBtnStyle: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", color: "var(--muted)",
    fontSize: 11, padding: "0 3px", lineHeight: 1, flex: "0 0 auto",
  };

  const navRow = (it: Item, inHiddenSection: boolean) => {
    if (!editing) {
      return (
        <Link key={it.href} href={it.href} className={"nav-item" + (isActive(it.href) ? " active" : "")} style={inHiddenSection ? { opacity: 0.65 } : undefined}>
          <span className="ico">{it.ico}</span>
          {it.label}
        </Link>
      );
    }
    return (
      <div
        key={it.href}
        className="nav-item"
        draggable={!inHiddenSection}
        onDragStart={() => setDragHref(it.href)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => dropOn(it.href)}
        style={{ cursor: inHiddenSection ? "default" : "grab", opacity: dragHref === it.href ? 0.4 : inHiddenSection ? 0.65 : 1 }}
        title={inHiddenSection ? undefined : "Drag to reorder (or use the arrows)"}
      >
        <span className="ico">{it.ico}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</span>
        {!inHiddenSection && (
          <>
            <button type="button" style={editBtnStyle} title="Move up" onClick={() => move(it.href, -1)}>▲</button>
            <button type="button" style={editBtnStyle} title="Move down" onClick={() => move(it.href, 1)}>▼</button>
          </>
        )}
        <button
          type="button"
          style={{ ...editBtnStyle, color: inHiddenSection ? "var(--pos)" : "var(--muted)" }}
          title={inHiddenSection ? "Show this item again" : "Hide this item (it moves under ··· below)"}
          onClick={() => toggleHidden(it.href)}
        >
          {inHiddenSection ? "+" : "–"}
        </button>
      </div>
    );
  };

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
      <div className="logo" style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span style={{ flex: 1 }}>
          Trade<span className="accent">Journal</span>
          <span className="tag">futures edition</span>
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title={editing ? "Done — the order is saved to your account" : "Rearrange the menu: drag items, hide the ones you don't use"}
          style={{
            background: editing ? "var(--surface-2)" : "none",
            border: "1px solid " + (editing ? "var(--s1)" : "transparent"),
            borderRadius: 6, cursor: "pointer", color: editing ? "var(--s1)" : "var(--muted)",
            fontSize: 12, padding: "2px 7px", lineHeight: 1.4,
          }}
        >
          {editing ? "done" : "✎"}
        </button>
      </div>
      {editing && (
        <div style={{ fontSize: 10.5, color: "var(--muted)", padding: "0 12px 8px", lineHeight: 1.5 }}>
          Drag or use ▲▼ to reorder, – hides an item.{" "}
          <button type="button" onClick={reset} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 10.5, padding: 0 }}>
            Reset to default
          </button>
        </div>
      )}
      {visible.map((it) => navRow(it, false))}
      {hiddenItems.length > 0 && (
        <>
          <button
            type="button"
            className="nav-item"
            onClick={() => setShowHidden((v) => !v)}
            style={{ color: "var(--muted)" }}
            title={`${hiddenItems.length} hidden item${hiddenItems.length === 1 ? "" : "s"}`}
          >
            <span className="ico">···</span>
            {showHidden ? "less" : `${hiddenItems.length} more`}
          </button>
          {(showHidden || editing) && hiddenItems.map((it) => navRow(it, true))}
        </>
      )}
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
