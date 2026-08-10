// Write / edit the day plan (free text + news lines).
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { plans } from "@/db/schema";
import { upsertPlan } from "@/app/actions";
import { fmtDateLong } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const plan = await db.query.plans.findFirst({ where: eq(plans.date, date) });

  const newsText = (plan?.news ?? [])
    .map((n) => `${n.time} | ${n.title} | ${n.importance}`)
    .join("\n");

  return (
    <>
      <div className="topbar">
        <h1>{plan ? "Edit plan" : "Write plan"} · {fmtDateLong(date)}</h1>
      </div>
      <form action={upsertPlan} className="card" style={{ maxWidth: 720 }}>
        <input type="hidden" name="date" value={date} />
        <div className="tj-field">
          <label className="tj-label">
            Analysis — D1 → tick, written BEFORE the session. This is the only thing you keep in front of you while trading.
          </label>
          <textarea className="tj-textarea" name="analysis" required rows={10} defaultValue={plan?.analysis ?? ""} style={{ minHeight: 180 }} />
        </div>
        <div className="tj-field">
          <label className="tj-label">News — one per line: “15:30 | Retail Sales (US) | high” (importance: high/medium/low)</label>
          <textarea className="tj-textarea" name="news" defaultValue={newsText} placeholder={"15:30 | Retail Sales (US) | high"} />
        </div>
        <button className="btn" type="submit">Save plan</button>
        <div className="section-note">Scenarios (“if X then Y”) are added on the Day screen after saving.</div>
      </form>
    </>
  );
}
