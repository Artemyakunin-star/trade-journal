// The Guide — the manual: the daily loop first, then every screen in the
// order you meet it. Static content, anchors for deep-linking from the app.
import Link from "next/link";

export const metadata = { title: "Guide — TradeJournal" };

function S({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="card" id={id} style={{ marginBottom: 14, scrollMarginTop: 20 }}>
      <h3>{title}</h3>
      <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "8px 0" }}>{children}</p>;
}

const TOC: { id: string; label: string }[] = [
  { id: "loop", label: "The daily loop" },
  { id: "plan", label: "Plans & the day frame" },
  { id: "live", label: "Live — during the session" },
  { id: "import", label: "Import" },
  { id: "trades", label: "Trades & merging" },
  { id: "ideas", label: "Ideas & the self-check" },
  { id: "grades", label: "Two grades: Idea vs Execution" },
  { id: "rules", label: "Rules — your risk frame" },
  { id: "day", label: "The Day screen" },
  { id: "recap", label: "Recap — the evening review" },
  { id: "notes", label: "Notes — market lessons" },
  { id: "lab", label: "Lab — what-if scenarios" },
  { id: "missed", label: "Missed trades" },
  { id: "analytics", label: "Analytics & Calendar" },
  { id: "tips", label: "Small things worth knowing" },
];

export default function GuidePage() {
  return (
    <>
      <div className="topbar">
        <h1>Guide</h1>
        <Link href="/faq" className="btn ghost btn-sm">Questions? Open the FAQ →</Link>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3>What this journal is about</h3>
        <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.6 }}>
          <P>
            TradeJournal is built around one rule: <b>no idea — no entry</b>. Every trade should come from a written
            idea, every idea from the day&apos;s plan. The journal doesn&apos;t just record what happened — it keeps
            score on your discipline: trades outside any idea are flagged <span style={{ color: "var(--crit)" }}>rogue</span>,
            rule violations are detected automatically, and ideas get two separate grades — for the idea itself and for
            how you executed it.
          </P>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {TOC.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="btn ghost btn-sm" style={{ fontSize: 12 }}>{t.label}</a>
            ))}
          </div>
        </div>
      </div>

      <S id="loop" title="The daily loop">
        <P><b>Morning.</b> Open <Link className="linklike" href="/plans">Plans</Link>, click today in the calendar and write the plan. Fill the <b>day frame</b> at the top: bias, the playbook scenarios you allow today, rules of the day. The frame is your contract with yourself — ideas are checked against it later.</P>
        <P><b>During the session.</b> Keep <Link className="linklike" href="/live">Live</Link> open: today&apos;s frame and your strongest notes are pinned up top, and everything you see or feel goes into the timestamped feed (Enter adds, Ctrl+V pastes screenshots, emotion chips). An entry can grow into an idea with one click.</P>
        <P><b>After the session.</b> <Link className="linklike" href="/import">Import</Link> the day&apos;s executions and bars → on <Link className="linklike" href="/trades">Trades</Link> attach each trade to its idea (or admit it&apos;s rogue) → fill the self-check inside each <Link className="linklike" href="/ideas">idea</Link> and set the two grades → write the evening <Link className="linklike" href="/recap">Recap</Link>: did the plan work, what to change. Lessons worth keeping go to <Link className="linklike" href="/notes">Notes</Link>.</P>
      </S>

      <S id="plan" title="Plans & the day frame">
        <P>Plans is a calendar of daily documents (plus free documents without a date). A dated document is the day&apos;s plan; the <b>day frame</b> panel sits above the editor: bias (Long / Short / Neutral), any number of allowed scenarios from your playbook (the “news / no trading” kind is exclusive), and free-text rules of the day.</P>
        <P>The editor is rich text: paste TradingView screenshots with Ctrl+V, use markdown shortcuts, everything autosaves with <b>version history</b> (the History button — preview and restore any version, e.g. a deleted screenshot).</P>
        <P>Wrote the plan under the wrong day, or as a plain document? Open it — the <b>Move</b> control at the top re-dates it (the day frame moves along), and “Make it a daily plan” attaches a dateless document to a day. One plan per day.</P>
      </S>

      <S id="live" title="Live — during the session">
        <P>The page you keep open while trading. Up top: today&apos;s frame and your top notes by earned weight — the things you promised yourself to respect. Below: the session feed. Enter adds an entry stamped with the current time; 🕐 back-dates one; Ctrl+V attaches any number of screenshots; emotion chips (calm / tense / tilt / revenge) record your state honestly.</P>
        <P>Each entry can be edited later (text, emotion, time, screenshots) or deleted. <b>→ Idea</b> turns an entry into an idea with the entry text as the thesis — pick instrument and direction, done. The feed of any past day lives on its Day page and inside the evening Recap.</P>
      </S>

      <S id="import" title="Import">
        <P>One screen accepts everything and detects the type automatically: NinjaTrader executions and bar exports, TradingView chart exports (Export chart data… — 5S…1m), DeepCharts trade lists. Re-importing the same file is safe — duplicates are skipped, so you can export a growing file daily and import it whole.</P>
        <P>Big files upload in parts with live progress. You can browse other pages meanwhile — a floating corner window shows the progress everywhere and tells you when it&apos;s done; just don&apos;t close or reload the tab. The <b>Recent imports</b> table below keeps the history (what, when, how many rows, errors) permanently.</P>
        <P>Timezones: set the import timezone (what your platform writes into CSVs; Chicago for NinjaTrader) and your display timezone once in Settings.</P>
      </S>

      <S id="trades" title="Trades & merging">
        <P>All trades with inline-editable fields: stop-loss (as a size in the active unit), key level, order-flow confirmation, account, grade, note. The Columns menu picks which columns you see; $ / Ticks / Points switch the unit. Click a trade&apos;s time to open its page with the bar chart, your entries/exits, MAE/MFE.</P>
        <P>Partial fills imported as separate rows? Tick them and press <b>Merge selected</b>. Trades grouped by idea; rogue trades sit in their own red group. The checkbox next to a group header selects the whole group, <b>Select rogues</b> grabs all rogue trades — then “Group ticked trades into one idea” creates one explanatory idea for them (e.g. “revenge, tried to catch the bottom”), or <b>Run in Lab</b> sends the selection to the simulator.</P>
        <P>The Idea column reassigns a trade to any idea (or back to rogue). The ⚠ marker next to a time means there are no imported bars for that day — the chart and simulations need them.</P>
      </S>

      <S id="ideas" title="Ideas & the self-check">
        <P>An idea is one setup: title, instrument, direction, trigger (plan / level / news / fomo / tilt / revenge), thesis, invalidation, date. Its page is a mini-Analytics for just this idea: its trades with the what-if simulator, a rich write-up with screenshots, missed setups, and pinned <Link className="linklike" href="/notes">notes</Link> you want in front of you.</P>
        <P>The <b>self-check</b> at the top is filled after the session against the morning frame, in two sections. <b>Idea — context</b>: direction vs the frame&apos;s bias (automatic), setups vs today&apos;s scenarios (automatic), rules of the day, confirmation before entry (with the types you saw), and “Against the idea” — the red flags you saw and took the trade anyway. <b>Execution</b>: entry per plan, the honest “early entry” admission, the automatic risk-rules check, and psychology (the trigger).</P>
        <P>Date mismatches (idea dated the 30th, trades on the 29th) are highlighted with a one-click fix. Deleting an idea never deletes its trades — they become rogue.</P>
      </S>

      <S id="grades" title="Two grades: Idea vs Execution">
        <P>Each section of the self-check computes a live <b>suggested</b> grade with its reasons: the idea grade from context, confirmation and red flags (1–2 flags −1 step, 3+ −2); the execution grade from entry discipline, risk-rule violations and psychology (revenge = F, tilt/fomo −1, early entry −1). A clean played-out idea suggests A+; a clean planned execution suggests A+.</P>
        <P>Both final grades are <b>yours</b> — two fields in the idea form. The pair shows where the leak is: ideas A–B with execution C–D means the analysis is fine and the discipline isn&apos;t. Cards show both chips (E: is execution), the Ideas table has separate Idea / Exec columns.</P>
      </S>

      <S id="rules" title="Rules — your risk frame">
        <P>On <Link className="linklike" href="/rules">Rules</Link> you write down, per instrument: max contracts, stop size in ticks, targets (T1/T2 with contracts), break-even trigger and window, and the per-idea limits — how many entries, stops and break-evens an idea may have at most.</P>
        <P>The journal then checks every idea automatically: counters like “Entries 3/2 · Stops 2/2” turn red when over, trades with oversized positions or too-wide stops get flagged, the Day screen gets a Rules tile, and a violation lowers the suggested execution grade.</P>
      </S>

      <S id="day" title="The Day screen">
        <P>One trading day under a microscope: the plan and frame, scenario outcomes, the session feed, ideas of the day with their limits badges, the execution timeline (every trade in order with P&L), missed setups and day tiles. This is where you attach stray trades to ideas and grade the day honestly. The ☾ Recap button leads to the evening review of the same day.</P>
      </S>

      <S id="recap" title="Recap — the evening review">
        <P>Written AFTER the session, separate from the plan so hindsight never leaks into the forecast. The morning plan is quoted read-only at the top with the frame and the day&apos;s facts (P&L, trades, rogue count, ideas with grades) — you argue with records, not memory. The session feed is listed below it; entries with screenshots unfold with the ▸ arrow.</P>
        <P>One click sets the verdict — played out / partially / against / no plan — then two short fields (“what worked”, “what to change”) and a free write-up with screenshots and history. One recap per day; <b>move to</b> re-dates it if you write it the next morning.</P>
      </S>

      <S id="notes" title="Notes — market lessons">
        <P>A note is one observation-hypothesis: “CPI day, strong expansion down — no retrace, continuation”. Every time the market repeats it, press ✓ Confirmed (or ✗ Refuted) with the date — the evidence trail builds the note&apos;s <b>earned weight</b>, and the strongest notes rise to the top and onto the Live page. Categories, screenshots, editing and archive included; evidence dates link to their Day pages.</P>
        <P>Pin a note to an idea (“Notes for this idea” card) to keep the lesson in front of you exactly where you decide.</P>
      </S>

      <S id="lab" title="Lab — what-if scenarios">
        <P>Save exit rule sets as named <b>scenarios</b> (stop in ticks, up to three targets with contracts, BE trigger or no BE, slippage), hand-pick trades or whole ideas — from the Lab filters or straight from the Trades/Ideas screens via checkboxes and <b>Run in Lab</b> — and compare every scenario against what you actually did, side by side with totals.</P>
        <P>The replay is honest: bar-by-bar on your imported bars (resolution badge shows 5-sec / 30-sec / 1-min), conservative on ties (stop wins), slippage on stops, one position at a time within an idea. Entry-candle stops are marked ⚠; if the dip happened before your entry, flag it on the trade (“entry-candle dip was before my entry”) and the replay respects that. Click any result cell to open the trade with that scenario drawn on its chart.</P>
      </S>

      <S id="missed" title="Missed trades">
        <P>Setups you saw but didn&apos;t take, recorded inside the idea: planned time, entry, stop, targets and the reason (fear after loss, hesitated, away from screen…). The journal replays them virtually on bars — what the setup would have paid — and keeps virtual results strictly separate from real P&L. The cost of hesitation becomes a number.</P>
      </S>

      <S id="analytics" title="Analytics & Calendar">
        <P><Link className="linklike" href="/analytics">Analytics</Link>: equity curve, P&L by weekday/hour/instrument, RR and win-rate (BE counts as a loss), MAE/MFE stats, and the same what-if simulator over any filtered set of trades. <Link className="linklike" href="/calendar">Calendar</Link>: months at a glance with daily P&L; every cell opens its Day.</P>
        <P>Dashboard tiles work in two modes — by trades or by ideas; the rogue counter is your discipline score.</P>
      </S>

      <S id="tips" title="Small things worth knowing">
        <P>· Screenshots zoom in place — click to enlarge, click to shrink. · Delete buttons ask twice (the label changes to the question). · Every rich editor keeps version history — a deleted screenshot is never lost. · Dates are movable almost everywhere: plans, recaps, ideas. · The sandbox (on the login screen) is a scratch journal with sample data — safe to show people. · Something missing or broken? The <Link className="linklike" href="/feedback">Feedback</Link> page goes straight to the author.</P>
      </S>
    </>
  );
}
