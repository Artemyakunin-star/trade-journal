// User display preferences stored in cookies (single-user app).
import { cookies } from "next/headers";

const ACCOUNTS_COOKIE = "tj_accounts";

/** Selected accounts, or null = all accounts. */
export async function getSelectedAccounts(): Promise<string[] | null> {
  const jar = await cookies();
  const raw = jar.get(ACCOUNTS_COOKIE)?.value;
  if (!raw) return null;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

export const ACCOUNTS_COOKIE_NAME = ACCOUNTS_COOKIE;

const COLS_COOKIE = "tj_trade_cols";
export const COLS_COOKIE_NAME = COLS_COOKIE;

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
  { key: "stop", label: "Stop-loss" },
  { key: "rr", label: "RR" },
  { key: "note", label: "Note" },
  { key: "idea", label: "Idea" },
];

/** Visible trade-table columns; null = all. */
export async function getVisibleTradeColumns(): Promise<Set<string> | null> {
  const jar = await cookies();
  const raw = jar.get(COLS_COOKIE)?.value;
  if (!raw) return null;
  const keys = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = new Set(TRADE_COLUMNS.map((c) => c.key));
  const set = new Set(keys.filter((k) => valid.has(k)));
  return set.size ? set : null;
}
