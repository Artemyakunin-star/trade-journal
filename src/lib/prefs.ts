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

import { TRADE_COLUMNS } from "@/lib/columns";

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
