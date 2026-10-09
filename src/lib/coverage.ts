// Which (instrument, day) pairs have imported price bars — drives the
// "no bars for this trade" warnings. Micro contracts count as covered when
// their e-mini sibling's bars exist (same price series).
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { siblingOf } from "@/lib/micro";

/** Set of "SYMBOL|YYYY-MM-DD" (calendar day in the given timezone). */
export async function barCoverageDays(tz: string): Promise<Set<string>> {
  const res = await db.execute(
    sql`SELECT DISTINCT instrument, to_char(time AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS d FROM bars`,
  );
  const rows = res.rows as { instrument: string; d: string }[];
  return new Set(rows.map((r) => `${r.instrument}|${r.d}`));
}

/** True when bars exist for the instrument (or its micro/mini sibling) that day. */
export function hasBarsFor(cov: Set<string>, instrument: string, day: string): boolean {
  if (cov.has(`${instrument}|${day}`)) return true;
  const sib = siblingOf(instrument);
  return !!sib && cov.has(`${sib}|${day}`);
}
