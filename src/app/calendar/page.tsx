// Calendar screen: all trading days, weekly totals, rogue-day flags.
import CalendarGrid from "@/components/CalendarGrid";
import { dayAggregates, getAllTrades } from "@/lib/metrics";
import { fmtDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const trades = await getAllTrades();
  const days = dayAggregates(trades);
  const title = days.length
    ? `${fmtDateShort(days[0].date)} – ${fmtDateShort(days[days.length - 1].date)}`
    : "No trading days yet";

  return (
    <>
      <div className="topbar">
        <h1>Calendar</h1>
      </div>
      <div className="card">
        <h3>
          {title} <span className="sub">trading days only · weekly totals on the right</span>
        </h3>
        <CalendarGrid days={days} />
        <div className="section-note">⚠ — day with rogue trades. Click a day to open its Day screen.</div>
      </div>
    </>
  );
}
