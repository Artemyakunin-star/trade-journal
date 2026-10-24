// FAQ content — one source used by the /faq page (and exportable as a doc).
export type FaqItem = { q: string; a: string };
export type FaqSection = { title: string; items: FaqItem[] };

export const FAQ: FaqSection[] = [
  {
    title: "About TradeJournal",
    items: [
      {
        q: "What is TradeJournal?",
        a: "A discipline-focused journal for futures traders. The workflow it enforces: write a plan for the day, turn it into trading ideas, and attach every trade to an idea. Trades without an idea are flagged as rogue — the \"no idea, no entry\" rule. On top of that you get analytics, per-trade charts with your entries and exits, MAE/MFE, RR statistics, and a what-if simulator that replays your trades bar by bar under different exit rules.",
      },
      {
        q: "Is it free?",
        a: "Yes. You import your own data (executions, trade lists and price bars exported from your platform), so there are no data-feed costs to pass on.",
      },
      {
        q: "Which instruments are supported?",
        a: "CME index futures are preconfigured (ES, NQ, RTY, YM and the micros MES, MNQ, MYM, M2K), plus GC/MGC and CL/MCL. Any other symbol gets an instrument record automatically on first import; you can set its tick size, tick value and commission on the Settings screen. Tick size and value drive all $ / ticks / points conversions.",
      },
      {
        q: "What do $ / t / pt switches do?",
        a: "Almost every table and chart can show results in dollars, ticks or points for the trade's instrument. Aggregate tiles (totals across instruments) always stay in dollars, because summing ticks across instruments with different tick values would be misleading.",
      },
    ],
  },
  {
    title: "Importing",
    items: [
      {
        q: "What can I import?",
        a: "One Import screen accepts everything and detects the file type automatically: NinjaTrader execution exports (fills), NinjaTrader bar exports (5-second, 1-minute and 100-tick bars), TradingView chart exports (5S, 10S, 15S, 30S and 1-minute), and trade lists exported from DeepCharts or similar platforms (symbol / quantity / entry / exit / time columns).",
      },
      {
        q: "How do I export chart data from TradingView?",
        a: "Open the chart, menu → \"Export chart data…\", choose the symbol and UNIX timestamps, and import the resulting CSV. Both continuous symbols (NQ1!) and specific contracts (ESU2026, MNQZ25) are recognized from the file name. 10S and 15S exports are aggregated into 30-second bars automatically.",
      },
      {
        q: "Why don't I see my trades right after import?",
        a: "Usually the account filter. The importer widens the filter to include newly imported accounts automatically, but if you have narrowed it by hand, check the Accounts dropdown at the top of the Trades screen.",
      },
      {
        q: "Will re-importing the same file duplicate my trades?",
        a: "No. Executions dedup by their platform IDs, bars by time, and trade lists by account + symbol + entry + exit. You can re-export a growing file from your platform every day and import it whole.",
      },
      {
        q: "My platform exports each partial exit as a separate row.",
        a: "Rows with the same account, symbol, direction and the same entry moment and price are merged into one trade at import: contracts summed, exit price becomes the weighted average, P&L summed. For trades already in the journal, tick the checkboxes next to the parts on the Trades screen and press \"Merge selected\".",
      },
      {
        q: "What about time zones?",
        a: "Two settings on the Settings screen: the import time zone (what your platform writes into CSV files — Chicago for NinjaTrader by default) and the display time zone (what you see everywhere in the journal). Set them once; they can differ.",
      },
      {
        q: "A very large bar file fails to upload.",
        a: "Files are uploaded in chunks, so multi-day tick and second files work. If an upload still fails, split the export into smaller date ranges and import them one by one — dedup makes overlaps harmless.",
      },
    ],
  },
  {
    title: "Accounts",
    items: [
      {
        q: "How do I tell my accounts apart?",
        a: "Executions carry their account name from the platform. Trade-list imports let you type an account label right on the Import screen (useful when the platform exports internal account numbers). You can also edit the account of any manually added or trade-list trade inline in the Trades table, and rename a whole account at once on the Settings screen.",
      },
      {
        q: "Can I filter everything by account?",
        a: "Yes — the Accounts dropdown in the top bar applies to Trades, Day, Analytics and the dashboard. The selection is remembered.",
      },
    ],
  },
  {
    title: "Charts",
    items: [
      {
        q: "Why is my chart empty?",
        a: "Charts draw from bars you import — the journal has no live data feed. Import the day's 5-second, 30-second or 1-minute bars (NinjaTrader export or TradingView chart export) for the instrument. The chart automatically uses the finest data available and offers coarser timeframes built from it.",
      },
      {
        q: "I trade micro contracts. Do I need separate micro bars?",
        a: "No. Micros trade the same prices as their e-mini siblings, so MNQ trades chart on NQ bars automatically (same for MES/ES, MYM/YM, M2K/RTY). The header shows which bars are in use, and a +MNQ / +NQ button next to the timeframe switch overlays the sibling contract's trades on the same chart. The what-if simulator and MAE/MFE use sibling bars the same way.",
      },
      {
        q: "What do the numbered arrows mean?",
        a: "Every trade of the day gets a number, in entry order, matching the execution timeline on the Day screen. ▲/▼ arrows mark entries; the opposite arrow marks the exit, green for profit and red for loss. The $ / t / pt / px switch changes what the exit labels show.",
      },
    ],
  },
  {
    title: "What-if simulator",
    items: [
      {
        q: "What does the simulator do?",
        a: "It replays each trade bar by bar on the finest bars available and applies virtual exit rules as if you had traded them: a fixed stop, one or several profit targets, break-even moves, holding past your actual exit, and a one-position-at-a-time mode that skips trades you could not have taken. The result is shown next to your actual P&L, so you can see what a rule set would have done across a whole period — before risking money on it.",
      },
      {
        q: "How do multiple targets work?",
        a: "Up to three target slots (T1–T3), each with a size (in the active unit) and a number of contracts. Contracts beyond the targets' total ride as a runner until the stop, break-even or the end of data. A \"BE after\" trigger (in ticks or the active unit) moves the stop to entry once price has gone that far in your favor. When the rule row has no stop, each trade's own recorded SL applies automatically. The exit chip shows the actual mix — e.g. \"T1 1 + T2 1\", \"T1 1 + BE 1\" or \"stop 2\".",
      },
      {
        q: "How honest are the fills?",
        a: "Deliberately conservative: when a bar touches both your stop and your target, the stop wins; stop fills include slippage. If anything, the simulation slightly understates the rule set's performance.",
      },
      {
        q: "Why do some trades show \"no bars\"?",
        a: "The simulator only replays trades whose time window is covered by imported bars. Import bars for those days (or the mini sibling's bars for micro trades) and the coverage counter goes up.",
      },
      {
        q: "Do simulation settings carry between screens?",
        a: "Yes. The rule set you enter in Analytics or inside an idea is encoded in the links, so clicking through to a trade shows the same simulation on its chart — SIM stop and target lines, the simulated exit marker and a SIMULATION watermark.",
      },
    ],
  },
  {
    title: "Metrics",
    items: [
      {
        q: "How is Avg RR calculated?",
        a: "Risk for each trade is its own stop distance when you entered a stop-loss (including winners). For trades without a recorded stop, the average stop distance of the selected period for that instrument is used as the risk reference. Break-even trades are excluded from RR. The methodology is also written next to the number in the UI.",
      },
      {
        q: "How is win rate calculated?",
        a: "Wins divided by all closed trades, with break-even trades counted as losses — a BE that was supposed to be a winner is not a win.",
      },
      {
        q: "What are MAE and MFE?",
        a: "Maximum Adverse / Favorable Excursion: the worst drawdown against your position and the best unrealized profit during the trade, computed bar by bar from imported bars, shown in ticks (or the active unit). Great for judging whether your stops and targets match how price actually moved.",
      },
    ],
  },
  {
    title: "Organizing your trading",
    items: [
      {
        q: "What is a \"rogue\" trade?",
        a: "A trade not attached to any idea. The journal's core rule is \"no idea, no entry\": every trade should come from a written idea, which comes from the day's plan. Rogue trades are flagged in red everywhere — the count on the dashboard is your discipline score. You can tick several rogue trades (the Select rogues button grabs them all) and group them into one honest explanatory idea like \"revenge, tried to catch the bottom\".",
      },
      {
        q: "Plans vs Ideas — what's the difference?",
        a: "A plan is your written prep for the day (rich text with screenshots) with the day frame on top: bias, the playbook scenarios you allow today (as many as you need), rules of the day. An idea is a specific setup — instrument, direction, trigger, thesis, invalidation — that trades get attached to. Ideas are checked against the frame in the self-check, and an idea's page works like a mini-Analytics for just its trades, including the simulator.",
      },
      {
        q: "I wrote the plan under the wrong day (or as a plain document).",
        a: "Open it in Plans: the Move control at the top re-dates a daily plan (its day frame moves along), and \"Make it a daily plan\" attaches a date-less document to a day. One plan per day — a conflict shows a warning instead of overwriting. Recaps and ideas can change their date the same way.",
      },
      {
        q: "Can I add a trade manually?",
        a: "Yes — the + Trade button on the Trades and Day screens opens a full form, and every field (stop, key level, OF confirmation, account, note) is also editable inline in the tables afterwards. Manual and trade-list trades can be deleted with the ✕ next to their time.",
      },
      {
        q: "Can I use US date and 12-hour time format?",
        a: "Yes — Settings → Display has an EU / US format switch that applies to every date and time in the journal.",
      },
      {
        q: "I deleted a screenshot from a write-up by accident.",
        a: "Every rich editor (plans, idea/trade write-ups, recap) keeps version history — the History button lists snapshots, lets you preview any of them in place and restore one. Restoring saves the current state first, so nothing is lost either way.",
      },
    ],
  },
  {
    title: "Live & Recap",
    items: [
      {
        q: "What is the Live page for?",
        a: "It's the page you keep open during the session. Today's frame and your strongest notes are pinned up top, and below is the timestamped feed: Enter adds an entry, Ctrl+V pastes any number of screenshots, chips record your emotional state (calm / tense / tilt / revenge), 🕐 back-dates an entry written later. Entries are editable (including their time) and can grow into an idea with one click — the entry text becomes the thesis.",
      },
      {
        q: "What is the Recap and why is it separate from the plan?",
        a: "The recap is the evening review, written AFTER the session — kept separate so hindsight never leaks into the morning forecast. It quotes the plan and the day frame read-only, shows the day's facts (P&L, trades, rogue count, idea grades) and the session feed, and asks for a one-click verdict: played out / partially / against / no plan — plus \"what worked\" and \"what to change\" and a free write-up. One recap per day; its date can be moved if you write it the next morning.",
      },
      {
        q: "Where do past days' feeds live?",
        a: "On the Day page of that date (a \"Session feed\" card next to the execution timeline) and inside that day's Recap. Screenshots unfold with the ▸ arrow and zoom in place on click.",
      },
    ],
  },
  {
    title: "Notes, Rules & grades",
    items: [
      {
        q: "What are Notes?",
        a: "Market lessons with an evidence trail. A note is one observation-hypothesis (\"CPI day, strong expansion down — no retrace, continuation\"). Each time it repeats you confirm it (✓) or refute it (✗) with a date — the earned weight (✓ minus ✗) sorts the notes, and the strongest rise onto the Live page. Notes take screenshots and categories, can be edited, archived, and pinned to an idea so the lesson sits right where you decide.",
      },
      {
        q: "What does the Rules page do?",
        a: "You write your risk frame per instrument: max contracts, stop size in ticks, targets, break-even trigger and window, and per-idea limits (max entries / stops / break-evens). The journal then checks every idea automatically — counters turn red when over, oversized positions and too-wide stops get flagged on trades, the Day screen gets a Rules tile, and violations lower the suggested execution grade.",
      },
      {
        q: "Why does an idea have TWO grades?",
        a: "Because \"was the idea good\" and \"did I execute it well\" are different skills. The Idea grade covers context: direction vs the frame, setup within today's scenarios, confirmation before entry, rules of the day, and the red flags you saw and ignored (1–2 flags −1 step, 3+ −2). The Execution grade covers behavior: entry per plan, the honest \"early entry\" admission (−1), automatic risk-rule violations (−1), psychology (revenge = F, tilt/fomo −1). Both get live suggestions with reasons; both final grades are yours. The pair shows where the leak is.",
      },
      {
        q: "Does the suggested grade overwrite my grade?",
        a: "Never. Suggestions are recommendations with visible reasoning; the Idea grade and Execution grade fields in the form are always set by you.",
      },
    ],
  },
  {
    title: "Data & roadmap",
    items: [
      {
        q: "Where is my data stored?",
        a: "In the journal's own database — trades, bars, plans and screenshots. Every account sees only its own journal; imported price bars are shared (they are public market data and everyone benefits from them). Nothing is sent to third parties.",
      },
      {
        q: "My platform isn't supported. What can I do?",
        a: "Upload a sample export from it on the Import screen (\"Your platform isn't supported?\") — a trade list, fills report or chart-data CSV, anonymized if you like. Importers are built from exactly these samples: that's how NinjaTrader, TradingView and DeepCharts support happened.",
      },
      {
        q: "Will there be automatic sync with my platform?",
        a: "Manual CSV import is the deliberate starting point — it works with any platform that can export files, without API keys. Deeper integrations (e.g. Rithmic-based auto-sync) are being considered for later.",
      },
    ],
  },
];
