"use server";
// Server actions: forms for ideas, plans, scenarios, trade attachment, CSV import.
// Single-user app (localhost / private deployment) — no auth layer yet.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ideas, plans, scenarios, trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { importCsvFile, type ImportResult } from "@/lib/import";

// ---------- ideas ----------

const IDEA_TRIGGERS = ["PLAN", "LEVEL", "NEWS", "FOMO", "TILT", "REVENGE"] as const;
const IDEA_STATUSES = ["ACTIVE", "PLAYED_OUT", "INVALIDATED"] as const;
const GRADES = ["A_PLUS", "A", "A_MINUS", "B_PLUS", "B", "B_MINUS", "C_PLUS", "C", "C_MINUS", "D", "F"] as const;

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

export async function createIdea(fd: FormData) {
  const planDate = str(fd, "planDate"); // optional: link to that day's plan
  let planId: string | null = null;
  if (planDate) {
    const plan = await db.query.plans.findFirst({ where: eq(plans.date, planDate) });
    planId = plan?.id ?? null;
  }
  const trigger = str(fd, "trigger");
  const [idea] = await db
    .insert(ideas)
    .values({
      planId,
      instrument: str(fd, "instrument"),
      direction: str(fd, "direction") === "SHORT" ? "SHORT" : "LONG",
      title: str(fd, "title"),
      thesis: str(fd, "thesis"),
      invalidation: str(fd, "invalidation"),
      trigger: (IDEA_TRIGGERS as readonly string[]).includes(trigger) ? (trigger as (typeof IDEA_TRIGGERS)[number]) : "PLAN",
      comment: str(fd, "comment") || null,
    })
    .returning();

  // Optionally attach pre-selected trades.
  const tradeIds = fd.getAll("tradeIds").map(String).filter(Boolean);
  for (const tid of tradeIds) {
    await db.update(trades).set({ ideaId: idea.id }).where(eq(trades.id, tid));
  }

  revalidatePath("/", "layout");
  redirect(str(fd, "returnTo") || "/ideas");
}

export async function updateIdea(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  const grade = str(fd, "grade");
  const trigger = str(fd, "trigger");

  const existing = await db.query.ideas.findFirst({ where: eq(ideas.id, id) });
  if (!existing) return;

  const becameInvalidated = status === "INVALIDATED" && existing.status !== "INVALIDATED";

  await db
    .update(ideas)
    .set({
      title: str(fd, "title") || existing.title,
      instrument: str(fd, "instrument") || existing.instrument,
      direction: str(fd, "direction") === "SHORT" ? "SHORT" : "LONG",
      thesis: str(fd, "thesis") || existing.thesis,
      invalidation: str(fd, "invalidation") || existing.invalidation,
      trigger: (IDEA_TRIGGERS as readonly string[]).includes(trigger) ? (trigger as (typeof IDEA_TRIGGERS)[number]) : existing.trigger,
      comment: str(fd, "comment") || null,
      status: (IDEA_STATUSES as readonly string[]).includes(status) ? (status as (typeof IDEA_STATUSES)[number]) : existing.status,
      grade: grade === "" ? null : (GRADES as readonly string[]).includes(grade) ? (grade as (typeof GRADES)[number]) : existing.grade,
      invalidatedAt: becameInvalidated ? new Date() : existing.invalidatedAt,
      updatedAt: new Date(),
    })
    .where(eq(ideas.id, id));

  revalidatePath("/", "layout");
  redirect(str(fd, "returnTo") || "/ideas");
}

export async function deleteIdea(fd: FormData) {
  const id = str(fd, "id");
  await db.update(trades).set({ ideaId: null }).where(eq(trades.ideaId, id));
  await db.delete(ideas).where(eq(ideas.id, id));
  revalidatePath("/", "layout");
  redirect("/ideas");
}

/** Attach / detach a trade to an idea (from the Trades table inline select). */
export async function setTradeIdea(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  const ideaId = str(fd, "ideaId");
  await db
    .update(trades)
    .set({ ideaId: ideaId === "" ? null : ideaId, updatedAt: new Date() })
    .where(eq(trades.id, tradeId));
  revalidatePath("/", "layout");
}

export async function setTradeNote(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  await db
    .update(trades)
    .set({ note: str(fd, "note") || null, updatedAt: new Date() })
    .where(eq(trades.id, tradeId));
  revalidatePath("/", "layout");
}

// ---------- plan / scenarios ----------

export async function upsertPlan(fd: FormData) {
  const date = str(fd, "date");
  const analysis = str(fd, "analysis");
  const newsRaw = str(fd, "news");
  // News entered as lines: "15:30 | Retail Sales (US) | high"
  const news = newsRaw
    ? newsRaw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const [time = "", title = "", importance = "medium"] = l.split("|").map((s) => s.trim());
          return { time, title, importance: (["high", "medium", "low"].includes(importance) ? importance : "medium") as "high" | "medium" | "low" };
        })
    : null;

  const existing = await db.query.plans.findFirst({ where: eq(plans.date, date) });
  if (existing) {
    await db.update(plans).set({ analysis, news, updatedAt: new Date() }).where(eq(plans.id, existing.id));
  } else {
    await db.insert(plans).values({ date, analysis, news });
  }
  revalidatePath("/", "layout");
  redirect(`/day/${date}`);
}

export async function addScenario(fd: FormData) {
  const planId = str(fd, "planId");
  const count = await db.query.scenarios.findMany({ where: eq(scenarios.planId, planId) });
  await db.insert(scenarios).values({
    planId,
    sortOrder: count.length + 1,
    condition: str(fd, "condition"),
    direction: str(fd, "direction") === "SHORT" ? "SHORT" : str(fd, "direction") === "LONG" ? "LONG" : null,
    expectedZone: str(fd, "expectedZone") || null,
  });
  revalidatePath("/", "layout");
}

const OUTCOMES = ["PENDING", "PLAYED_OUT", "FAILED", "NOT_TRIGGERED"] as const;

export async function setScenarioOutcome(fd: FormData) {
  const id = str(fd, "id");
  const outcome = str(fd, "outcome");
  if (!(OUTCOMES as readonly string[]).includes(outcome)) return;
  await db
    .update(scenarios)
    .set({ outcome: outcome as (typeof OUTCOMES)[number], reviewNote: str(fd, "reviewNote") || null })
    .where(eq(scenarios.id, id));
  revalidatePath("/", "layout");
}

export async function deleteScenario(fd: FormData) {
  await db.delete(scenarios).where(eq(scenarios.id, str(fd, "id")));
  revalidatePath("/", "layout");
}

// ---------- CSV import ----------

export type ImportState = { results: ImportResult[] } | null;

export async function importCsvs(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const results: ImportResult[] = [];
  for (const f of files) {
    const text = await f.text();
    results.push(await importCsvFile(f.name, text));
  }
  revalidatePath("/", "layout");
  return { results };
}
