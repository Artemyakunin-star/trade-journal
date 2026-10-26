// Server component: the "news of the day" card used on Live, the plan page,
// the Day screen and inside an idea. Fetches/refreshes the cache (never
// throws) and renders the client list.
import { ensureCalendar, getCalendarEvents, calendarSourceInfo } from "@/lib/calendar";
import { fmtTimeKyiv, parseInTimeZone } from "@/lib/format";
import NewsList, { type NewsItem } from "@/components/NewsList";

export default async function DayNews({
  date,
  tz,
  currencies,
  title = "News of the day",
  sub,
  markNext = false,
}: {
  date: string; // YYYY-MM-DD in the user's timezone
  tz: string;
  currencies: string[];
  title?: string;
  sub?: string;
  markNext?: boolean; // dim past events + highlight the upcoming one (Live)
}) {
  const start = parseInTimeZone(`${date} 00:00:00`, tz);
  const end = new Date(start.getTime() + 24 * 3600_000);
  await ensureCalendar(start, end);
  const [events, src] = await Promise.all([
    getCalendarEvents(start, end, { currencies, minImportance: "MEDIUM" }),
    calendarSourceInfo(start, end),
  ]);

  const items: NewsItem[] = events.map((e) => ({
    id: e.id,
    tsIso: e.eventAt.toISOString(),
    timeStr: fmtTimeKyiv(e.eventAt, false, tz),
    currency: e.currency,
    importance: e.importance,
    title: e.title,
    period: e.period,
    actual: e.actual,
    forecast: e.forecast,
    previous: e.previous,
  }));

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3>
        {title} <span className="sub">{sub ?? `${currencies.join(", ")} · high + medium impact`}</span>
      </h3>
      {items.length === 0 ? (
        <div className="section-note" style={{ margin: 0 }}>
          {src ? "No high/medium-impact events for this day." : "Calendar unavailable right now — it fills in automatically once the source responds."}
        </div>
      ) : (
        <NewsList items={items} markNext={markNext} />
      )}
      {src && (
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}>
          From {src.source} · currencies in Settings
        </div>
      )}
    </div>
  );
}
