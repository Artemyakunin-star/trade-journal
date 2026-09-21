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
        a: "Up to three target slots (T1–T3), each with a size (in the active unit) and a number of contracts. Contracts beyond the targets' total ride as a runner until the stop, break-even or the end of data. The \"BE after T1\" checkbox moves the stop to entry once the first target fills. The exit chip shows the actual mix — e.g. \"T1 1 + T2 1\", \"T1 1 + BE 1\" or \"stop 2\".",
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
        a: "A trade not attached to any idea. The journal's core rule is \"no idea, no entry\": every trade should come from a written idea, which comes from the day's plan. Rogue trades are flagged in red everywhere — the count on the dashboard is your discipline score.",
      },
      {
        q: "Plans vs Ideas — what's the difference?",
        a: "A plan is your written prep for the day (rich text with screenshots). An idea is a specific setup — instrument, direction, key level, order-flow confirmation — that trades get attached to. An idea can link to the plan it came from, and its page works like a mini-Analytics for just its trades, including the simulator.",
      },
      {
        q: "Can I add a trade manually?",
        a: "Yes — the + Trade button on the Trades and Day screens opens a full form, and every field (stop, key level, OF confirmation, account, note) is also editable inline in the tables afterwards. Manual and trade-list trades can be deleted with the ✕ next to their time.",
      },
      {
        q: "Can I use US date and 12-hour time format?",
        a: "Yes — Settings → Display has an EU / US format switch that applies to every date and time in the journal.",
      },
    ],
  },
  {
    title: "Data & roadmap",
    items: [
      {
        q: "Where is my data stored?",
        a: "In the journal's own database — trades, bars, plans and screenshots. Nothing is sent to third parties. Note: the journal is currently a single-user beta without registration; user accounts and private workspaces are on the roadmap before any public product release.",
      },
      {
        q: "Will there be automatic sync with my platform?",
        a: "Manual CSV import is the deliberate starting point — it works with any platform that can export files, without API keys. Deeper integrations (e.g. Rithmic-based auto-sync) are being considered for later.",
      },
    ],
  },
];
