// Trade-table column definitions (shared between server prefs and client UI).
export const TRADE_COLUMNS: { key: string; label: string }[] = [
  { key: "instrument", label: "Instrument" },
  { key: "dir", label: "Direction" },
  { key: "qty", label: "Qty" },
  { key: "entryPrice", label: "Avg entry" },
  { key: "exitPrice", label: "Avg exit" },
  { key: "netPnl", label: "Net P&L ($, position)" },
  { key: "perContract", label: "P&L / contract" },
  { key: "mae", label: "MAE" },
  { key: "mfe", label: "MFE" },
  { key: "stop", label: "SL (stop-loss)" },
  { key: "rr", label: "RR" },
  { key: "note", label: "Note" },
  { key: "idea", label: "Idea" },
];
