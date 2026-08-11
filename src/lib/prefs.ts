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
