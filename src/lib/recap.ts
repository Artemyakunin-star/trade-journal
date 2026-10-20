// Server-side only (imported from server components/actions).
// Find-or-create the recap row for a date: the page needs an id for the
// editor to save to, so visiting a recap materializes its row. An untouched
// row (no verdict, no text, no journal) still counts as "not written".
import { db } from "@/db";
import { dayRecaps } from "@/db/schema";

export async function recapRowFor(uid: string, date: string) {
  const existing = await db.query.dayRecaps.findFirst({
    where: (r, { and: and_, eq: eq_ }) => and_(eq_(r.userId, uid), eq_(r.date, date)),
  });
  if (existing) return existing;
  const [row] = await db.insert(dayRecaps).values({ userId: uid, date }).onConflictDoNothing().returning();
  if (row) return row;
  return (await db.query.dayRecaps.findFirst({
    where: (r, { and: and_, eq: eq_ }) => and_(eq_(r.userId, uid), eq_(r.date, date)),
  }))!;
}

/** Has anything actually been written? (drives "recap exists" labels) */
export function recapWritten(r: { verdict: string | null; wentWell: string | null; wentWrong: string | null; journal: unknown }) {
  const j = r.journal as { content?: unknown[] } | null;
  const journalNonEmpty =
    !!j && Array.isArray(j.content) && j.content.some((n) => (n as { content?: unknown[] }).content?.length || (n as { type?: string }).type === "image");
  return !!(r.verdict || r.wentWell || r.wentWrong || journalNonEmpty);
}
