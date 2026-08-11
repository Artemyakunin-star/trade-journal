// Calendar screen: all trading days, weekly totals, rogue-day flags.
import CalendarGrid from "@/components/CalendarGrid";
import AccountFilter from "@/components/AccountFilter";
import { dayAggregates, distinctAccounts, filterByAccounts, getAllTrades } from "@/lib/metrics";
import { fmtDateShort } from "@/lib/format";
import { getSelectedAccounts } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [rawTrades, selectedAccounts, prefs] = await Promise.all([getAllTrades(), getSelectedAccounts(), getSettings()]);
  const trades = filterByAccounts(rawTrades, selectedAccounts);
  const days = dayAggregates(trades, prefs.timezone);
  const title = days.length
    ? `${fmtDateShort(days[0].date)} – ${fmtDateShort(days[days.length - 1].date)}`
    : "No trading days yet";

  return (
    <>
      <div className="topbar">
        <h1>Calendar</h1>
        <AccountFilter accounts={distinctAccounts(rawTrades)} selected={selectedAccounts} />
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
