// Plans: Notion-style month calendar of daily plan notes + undated documents.
import Link from "next/link";
import { db } from "@/db";
import { createDoc, openDailyDoc } from "@/app/actions";
import { getSettings } from "@/lib/settings";
import { kyivDateOf } from "@/lib/format";

export const dynamic = "force-dynamic";

type TipTapNode = { type?: string; text?: string; content?: TipTapNode[] };

/** First ~140 chars of plain text from TipTap JSON, for card previews. */
function excerpt(content: unknown, max = 140): string {
  if (!content) return "";
  const parts: string[] = [];
  const walk = (n: TipTapNode) => {
    if (parts.join(" ").length > max + 40) return;
    if (n.text) parts.push(n.text);
    n.content?.forEach(walk);
  };
  walk(content as TipTapNode);
  const s = parts.join(" ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function hasImage(content: unknown): boolean {
  let found = false;
  const walk = (n: TipTapNode) => {
    if (n.type === "image") found = true;
    n.content?.forEach(walk);
  };
  if (content) walk(content as TipTapNode);
  return found;
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const [documents, prefs] = await Promise.all([
    db.query.docs.findMany({ orderBy: (d, { desc }) => [desc(d.updatedAt)] }),
    getSettings(),
  ]);

  const today = kyivDateOf(new Date(), prefs.timezone);
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : today.slice(0, 7);

  const daily = new Map(documents.filter((d) => d.date).map((d) => [d.date!, d]));
  const undated = documents.filter((d) => !d.date);

  // Month grid, weeks starting Monday.
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startShift = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startShift);
  const cells: { date: string; inMonth: boolean }[] = [];
  const cur = new Date(start);
  while (true) {
    const iso = cur.toISOString().slice(0, 10);
    cells.push({ date: iso, inMonth: iso.slice(0, 7) === month });
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() === 1 && (cur.getUTCFullYear() > y || (cur.getUTCFullYear() === y && cur.getUTCMonth() + 1 > m)))
      break;
  }

  const fmtEdited = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: prefs.timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

  return (
    <>
      <div className="topbar">
        <h1>Plans</h1>
        <span className="range">
          <Link href={`/plans?m=${addMonths(month, -1)}`} title="Previous month">‹</Link>
          <Link href="/plans" className={month === today.slice(0, 7) ? "on" : ""}>Today</Link>
          <Link href={`/plans?m=${addMonths(month, 1)}`} title="Next month">›</Link>
        </span>
        <form action={createDoc}>
          <button className="btn" type="submit">+ New document</button>
        </form>
      </div>

      <div className="card" style={{ padding: 10, marginBottom: 14 }}>
        <h3 style={{ padding: "4px 8px 0" }}>
          {monthTitle(month)} <span className="sub">daily plan notes — click a day to write or open its plan</span>
        </h3>
        <div className="mcal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="mcal-dow">{d}</div>
          ))}
          {cells.map((c) => {
            const doc = daily.get(c.date);
            const isToday = c.date === today;
            const num = Number(c.date.slice(8));
            return (
              <form key={c.date} action={openDailyDoc} className={"mcal-cell" + (c.inMonth ? "" : " out") + (isToday ? " today" : "")}>
                <input type="hidden" name="date" value={c.date} />
                <button type="submit" className="mcal-cell-btn" title={doc ? "Open this day's plan" : "Write a plan for this day"}>
                  <span className={"mcal-num" + (isToday ? " today" : "")}>
                    {num === 1
                      ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
                          new Date(c.date + "T12:00:00Z"),
                        )
                      : num}
                  </span>
                  <span className="mcal-chips">
                    {doc && (
                      <span className="mcal-chip plan">
                        ▤ {excerpt(doc.content, 26) || doc.title.replace(/^Plan · /, "")}
                        {hasImage(doc.content) && " 🖼"}
                      </span>
                    )}
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", margin: "0 0 10px 2px" }}>
        Documents <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11.5 }}>— playbook, strategy, reviews (not tied to a date)</span>
      </h3>
      {undated.length === 0 ? (
        <div className="card section-note">
          No documents yet. Create one for your trading plan, playbook or weekly review — text plus pasted screenshots,
          like in Notion.
        </div>
      ) : (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {undated.map((d) => (
            <Link key={d.id} href={`/plans/${d.id}`} className="card doc-card">
              <div className="doc-card-title">
                {d.title} {hasImage(d.content) && <span title="Contains images">🖼</span>}
              </div>
              <div className="doc-card-excerpt">{excerpt(d.content) || "Empty document"}</div>
              <div className="doc-card-date">edited {fmtEdited(d.updatedAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
