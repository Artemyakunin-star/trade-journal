"use server";
// Server actions: forms for ideas, plans, scenarios, trade attachment, CSV import.
// Single-user app (localhost / private deployment) — no auth layer yet.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCOUNTS_COOKIE_NAME, COLS_COOKIE_NAME } from "@/lib/prefs";
import { TRADE_COLUMNS } from "@/lib/columns";
import { db } from "@/db";
import { docs, executions, ideas, instruments, plans, scenarios, settings, trades } from "@/db/schema";
import { eq } from "drizzle-orm";
import { computeMaeMfeFor, importCsvFile, rebuildAll, type ImportResult } from "@/lib/import";
import { parseInTimeZone } from "@/lib/format";
import { TIMEZONES } from "@/lib/settings";

// ---------- ideas ----------

const IDEA_TRIGGERS = ["PLAN", "LEVEL", "NEWS", "FOMO", "TILT", "REVENGE"] as const;
const IDEA_STATUSES = ["ACTIVE", "PLAYED_OUT", "INVALIDATED"] as const;
const GRADES = ["A_PLUS", "A", "A_MINUS", "B_PLUS", "B", "B_MINUS", "C_PLUS", "C", "C_MINUS", "D", "F"] as const;

function str(fd: FormData, name: string): string {
  return String(fd.get(name) ?? "").trim();
}

export async function createIdea(fd: FormData) {
  // Plan link: explicit select wins; fall back to "the plan of that day".
  const planDate = str(fd, "planDate");
  let planId: string | null = str(fd, "planId") || null;
  if (!planId && planDate) {
    const plan = await db.query.plans.findFirst({ where: eq(plans.date, planDate) });
    planId = plan?.id ?? null;
  }
  const dateRaw = str(fd, "date");
  const trigger = str(fd, "trigger");
  const [idea] = await db
    .insert(ideas)
    .values({
      planId,
      docId: str(fd, "docId") || null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null,
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
  // Straight to the idea page — the write-up editor (screenshots) lives there.
  redirect(`/ideas/${idea.id}/edit`);
}

export async function updateIdea(fd: FormData) {
  const id = str(fd, "id");
  const status = str(fd, "status");
  const grade = str(fd, "grade");
  const trigger = str(fd, "trigger");

  const existing = await db.query.ideas.findFirst({ where: eq(ideas.id, id) });
  if (!existing) return;

  const becameInvalidated = status === "INVALIDATED" && existing.status !== "INVALIDATED";
  const dateRaw = str(fd, "date");
  const planIdRaw = str(fd, "planId");

  await db
    .update(ideas)
    .set({
      date: /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : existing.date,
      planId: fd.has("planId") ? planIdRaw || null : existing.planId,
      docId: fd.has("docId") ? str(fd, "docId") || null : existing.docId,
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

/** Attach several rogue trades to an idea (picker on the idea page). */
export async function attachTradesToIdea(fd: FormData) {
  const ideaId = str(fd, "ideaId");
  const ids = fd.getAll("tradeIds").map(String).filter(Boolean);
  if (!ideaId || !ids.length) return;
  for (const tid of ids) {
    await db.update(trades).set({ ideaId, updatedAt: new Date() }).where(eq(trades.id, tid));
  }
  revalidatePath("/", "layout");
  redirect(`/ideas/${ideaId}/edit`);
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

/**
 * Save the original stop-loss as a SIZE (risk per contract) in the active
 * unit: usd -> dollars, ticks -> ticks, points -> points. The distance is
 * laid off from avg entry on the losing side and stored as a price.
 */
export async function setTradeStop(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  const raw = str(fd, "stopValue");
  const unit = str(fd, "unit"); // usd | ticks | points
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (Number.isNaN(value) || value <= 0)) return;

  let price: number | null = null;
  if (value !== null) {
    const trade = await db.query.trades.findFirst({ where: eq(trades.id, tradeId) });
    if (!trade) return;
    const inst = await db.query.instruments.findFirst({
      where: (i, { eq: eq_ }) => eq_(i.symbol, trade.instrument),
    });
    const tickSize = inst ? Number(inst.tickSize) : 0.25;
    const tickValue = inst ? Number(inst.tickValue) : 5;
    const distancePoints =
      unit === "ticks" ? value * tickSize : unit === "usd" ? (value / tickValue) * tickSize : value;
    const dir = trade.direction === "LONG" ? 1 : -1;
    price = Number(trade.avgEntryPrice) - dir * distancePoints;
  }

  await db
    .update(trades)
    .set({ stopPrice: price === null ? null : price.toFixed(4), updatedAt: new Date() })
    .where(eq(trades.id, tradeId));
  revalidatePath("/", "layout");
}

/** Autosave for the rich per-idea write-up (screenshots + description). */
export async function saveIdeaJournal(id: string, content: unknown) {
  if (content && typeof content === "object") content = pruneEmptyImages(content as TipTapNode);
  await db.update(ideas).set({ journal: content, updatedAt: new Date() }).where(eq(ideas.id, id));
  revalidatePath(`/ideas/${id}/edit`);
}

/** Autosave for the rich per-trade journal (Notion-like editor on trade page). */
export async function saveTradeJournal(id: string, content: unknown) {
  if (content && typeof content === "object") content = pruneEmptyImages(content as TipTapNode);
  await db.update(trades).set({ journal: content, updatedAt: new Date() }).where(eq(trades.id, id));
  revalidatePath(`/trades/${id}`);
}

/** Inline single-field updates from the trades table (keyLevel / ofConfirmation).
 *  New values are added to the dropdown vocabulary in settings automatically. */
export async function setTradeField(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  const field = str(fd, "field");
  const value = str(fd, "value") || null;
  if (field !== "keyLevel" && field !== "ofConfirmation") return;
  await db
    .update(trades)
    .set({ [field]: value, updatedAt: new Date() })
    .where(eq(trades.id, tradeId));

  if (value) {
    const { getSettings } = await import("@/lib/settings");
    const prefs = await getSettings();
    const key = field === "keyLevel" ? "keyLevelOptions" : "ofConfOptions";
    const list = field === "keyLevel" ? prefs.keyLevelOptions : prefs.ofConfOptions;
    if (!list.some((v) => v.toLowerCase() === value.toLowerCase())) {
      await setSetting(key, [...list, value]);
    }
  }
  revalidatePath("/", "layout");
}

/**
 * Manually add a trade (no CSV executions behind it). Times are entered in the
 * Chart timezone. P&L is computed from prices; commission left blank falls back
 * to the per-contract commission from Settings (× contracts × 2 sides).
 * Manual trades survive CSV re-imports (rebuild only touches execution-linked
 * trades); MAE/MFE fills in automatically if bars for that day are imported.
 */
export async function createManualTrade(fd: FormData) {
  const account = str(fd, "account");
  const instrument = str(fd, "instrument");
  const direction = str(fd, "direction") === "SHORT" ? ("SHORT" as const) : ("LONG" as const);
  const quantity = Math.round(Number(str(fd, "quantity")));
  const entryAt = str(fd, "entryAt"); // "YYYY-MM-DDTHH:MM" from datetime-local
  const exitAt = str(fd, "exitAt");
  const entryPrice = Number(str(fd, "entryPrice"));
  const exitPriceRaw = str(fd, "exitPrice");
  const exitPrice = exitPriceRaw === "" ? null : Number(exitPriceRaw);
  const commissionRaw = str(fd, "commission");
  const ideaId = str(fd, "ideaId") || null;
  const note = str(fd, "note") || null;
  const keyLevel = str(fd, "keyLevel") || null;
  const ofConfirmation = str(fd, "ofConfirmation") || null;
  const stopRaw = str(fd, "stopValue");
  const stopUnit = str(fd, "stopUnit"); // usd | ticks | points

  const dtOk = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  if (!account || !instrument || !(quantity > 0) || !dtOk(entryAt) || !(entryPrice > 0)) return;
  if (exitPrice !== null && !(exitPrice > 0)) return;

  const { getSettings } = await import("@/lib/settings");
  const prefs = await getSettings();
  const toDate = (s: string) => parseInTimeZone(s.replace("T", " ").slice(0, 16) + ":00", prefs.timezone);
  const entryTime = toDate(entryAt);
  const exitTime = dtOk(exitAt) && exitPrice !== null ? toDate(exitAt) : null;
  const closed = exitTime !== null && exitPrice !== null;

  const inst = await db.query.instruments.findFirst({ where: (i, { eq: eq_ }) => eq_(i.symbol, instrument) });
  const tickSize = inst ? Number(inst.tickSize) : 0.25;
  const tickValue = inst ? Number(inst.tickValue) : 5;
  const perSide = inst ? Number(inst.commission ?? 0) : 0;

  // Commission: explicit value wins; blank = Settings per-contract commission
  // for entry + exit fills.
  const commission =
    commissionRaw !== "" && Number(commissionRaw) >= 0
      ? Number(commissionRaw)
      : perSide * quantity * (closed ? 2 : 1);

  const dir = direction === "LONG" ? 1 : -1;
  const pnl = closed ? (exitPrice - entryPrice) * dir * quantity * (tickValue / tickSize) - commission : null;

  // Original stop-loss entered as a SIZE per contract → stored as a price
  // (same rule as the SL column in the trades table).
  let stopPrice: number | null = null;
  const stopVal = stopRaw === "" ? null : Number(stopRaw);
  if (stopVal !== null && stopVal > 0) {
    const distancePoints =
      stopUnit === "ticks" ? stopVal * tickSize : stopUnit === "usd" ? (stopVal / tickValue) * tickSize : stopVal;
    stopPrice = entryPrice - dir * distancePoints;
  }

  const [ins] = await db
    .insert(trades)
    .values({
      ideaId,
      account,
      instrument,
      direction,
      quantity,
      entryTime,
      exitTime,
      avgEntryPrice: entryPrice.toFixed(4),
      avgExitPrice: exitPrice === null ? null : exitPrice.toFixed(4),
      pnl: pnl === null ? null : pnl.toFixed(2),
      commission: commission.toFixed(2),
      stopPrice: stopPrice === null ? null : stopPrice.toFixed(4),
      keyLevel,
      ofConfirmation,
      note,
    })
    .returning({ id: trades.id });

  // Remember new Key Level / OF confirmation values in the dropdown vocabulary,
  // exactly like inline editing in the trades table does.
  for (const [val, key, list] of [
    [keyLevel, "keyLevelOptions", prefs.keyLevelOptions],
    [ofConfirmation, "ofConfOptions", prefs.ofConfOptions],
  ] as const) {
    if (val && !list.some((v) => v.toLowerCase() === val.toLowerCase())) {
      await setSetting(key, [...list, val]);
    }
  }

  // MAE/MFE from bars, if that day's bars are already imported.
  await computeMaeMfeFor(account, [instrument]);

  revalidatePath("/", "layout");
  redirect(`/trades/${ins.id}`);
}

/** Delete a manually added trade. Trades built from CSV executions are protected. */
export async function deleteManualTrade(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  const linked = await db.query.executions.findFirst({ where: eq(executions.tradeId, tradeId) });
  if (linked) return; // imported trade — comes back on re-import anyway; don't allow
  await db.delete(trades).where(eq(trades.id, tradeId));
  revalidatePath("/", "layout");
  redirect(str(fd, "returnTo") || "/trades");
}

/** Change the account label of a trade that has no linked executions
 *  (manual / trade-list imports — e.g. to tell DeepCharts accounts apart).
 *  Executions-built trades are protected: a re-import would restore the
 *  account from the CSV anyway. */
export async function setTradeAccount(fd: FormData) {
  const tradeId = str(fd, "tradeId");
  const account = str(fd, "account");
  if (!account) return;
  const linked = await db.query.executions.findFirst({ where: eq(executions.tradeId, tradeId) });
  if (linked) return;
  await db.update(trades).set({ account, updatedAt: new Date() }).where(eq(trades.id, tradeId));
  await widenAccountFilter([account]);
  revalidatePath("/", "layout");
}

/** Rename an account across all its trades — only for accounts that have no
 *  executions behind them (imported trade lists / manual trades). */
export async function renameAccount(fd: FormData) {
  const from = str(fd, "from");
  const to = str(fd, "to");
  if (!from || !to || from === to) return;
  const hasExecs = await db.query.executions.findFirst({ where: eq(executions.account, from) });
  if (hasExecs) return; // NT-imported account — names come from the CSVs
  await db.update(trades).set({ account: to }).where(eq(trades.account, from));

  // Keep the account filter working: replace the old name if it was selected.
  const jar = await cookies();
  const raw = jar.get(ACCOUNTS_COOKIE_NAME)?.value;
  if (raw) {
    const selected = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (selected.includes(from)) {
      const next = [...new Set(selected.map((a) => (a === from ? to : a)))];
      jar.set(ACCOUNTS_COOKIE_NAME, next.join(","), { maxAge: 60 * 60 * 24 * 365, path: "/" });
    }
  }
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

// ---------- docs (the Plans section) ----------

export async function createDoc() {
  const [doc] = await db.insert(docs).values({ title: "Untitled" }).returning({ id: docs.id });
  revalidatePath("/plans");
  redirect(`/plans/${doc.id}`);
}

/** Open (or create) the daily plan note for a calendar day. */
export async function openDailyDoc(fd: FormData) {
  const date = str(fd, "date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const existing = await db.query.docs.findFirst({ where: eq(docs.date, date) });
  if (existing) redirect(`/plans/${existing.id}`);
  const title = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
  }).format(new Date(date + "T12:00:00Z"));
  const [doc] = await db.insert(docs).values({ title: `Plan · ${title}`, date }).returning({ id: docs.id });
  revalidatePath("/plans");
  redirect(`/plans/${doc.id}`);
}

type TipTapNode = { type?: string; attrs?: { src?: string | null }; content?: TipTapNode[] };

/** Drop image nodes that lost their src (failed uploads) so they don't pile up. */
function pruneEmptyImages(node: TipTapNode): TipTapNode {
  return {
    ...node,
    content: node.content
      ?.filter((n) => !(n.type === "image" && !n.attrs?.src))
      .map(pruneEmptyImages),
  };
}

/** Autosave endpoint for the editor (called from the client, not a form). */
export async function saveDoc(id: string, title: string, content: unknown) {
  if (content && typeof content === "object") content = pruneEmptyImages(content as TipTapNode);
  await db
    .update(docs)
    .set({ title: title.trim() || "Untitled", content, updatedAt: new Date() })
    .where(eq(docs.id, id));
  revalidatePath("/plans");
}

export async function deleteDoc(fd: FormData) {
  const id = str(fd, "id");
  await db.delete(docs).where(eq(docs.id, id));
  revalidatePath("/plans");
  redirect("/plans");
}

// ---------- display preferences ----------

/** Save visible trade-table columns to a cookie. All selected = clear cookie. */
export async function setTradeColumns(fd: FormData) {
  const selected = fd.getAll("cols").map(String).filter(Boolean);
  const jar = await cookies();
  if (selected.length === 0 || selected.length === TRADE_COLUMNS.length) jar.delete(COLS_COOKIE_NAME);
  else jar.set(COLS_COOKIE_NAME, selected.join(","), { maxAge: 60 * 60 * 24 * 365, path: "/" });
  revalidatePath("/trades");
}

/** Save the multi-select account filter to a cookie. Empty selection = all. */
export async function setAccountFilter(fd: FormData) {
  const selected = fd.getAll("accounts").map(String).filter(Boolean);
  const all = str(fd, "allAccounts") === "1" || selected.length === 0;
  const jar = await cookies();
  if (all) jar.delete(ACCOUNTS_COOKIE_NAME);
  else jar.set(ACCOUNTS_COOKIE_NAME, selected.join(","), { maxAge: 60 * 60 * 24 * 365, path: "/" });
  revalidatePath("/", "layout");
}

// ---------- settings ----------

async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function saveDisplaySettings(fd: FormData) {
  const tz = str(fd, "timezone");
  const importTz = str(fd, "importTimezone");
  const theme = str(fd, "theme") === "light" ? "light" : "dark";
  if (TIMEZONES.includes(tz)) await setSetting("timezone", tz);
  if (TIMEZONES.includes(importTz)) await setSetting("importTimezone", importTz);
  await setSetting("theme", theme);
  const df = str(fd, "dateFormat");
  if (df === "eu" || df === "us") await setSetting("dateFormat", df);
  revalidatePath("/", "layout");
}

/** Update one instrument's specs; commissions are re-applied to all trades. */
export async function saveInstrument(fd: FormData) {
  const symbol = str(fd, "symbol");
  const tickSize = Number(str(fd, "tickSize"));
  const tickValue = Number(str(fd, "tickValue"));
  const commission = Number(str(fd, "commission"));
  if (!symbol || !(tickSize > 0) || !(tickValue > 0) || commission < 0 || Number.isNaN(commission)) return;
  await db
    .update(instruments)
    .set({ tickSize: String(tickSize), tickValue: String(tickValue), commission: String(commission) })
    .where(eq(instruments.symbol, symbol));
  await rebuildAll(); // re-derive PnL net of the new commission
  revalidatePath("/", "layout");
}

export async function addInstrument(fd: FormData) {
  const symbol = str(fd, "symbol").toUpperCase();
  const name = str(fd, "name") || symbol;
  const tickSize = Number(str(fd, "tickSize"));
  const tickValue = Number(str(fd, "tickValue"));
  const commission = Number(str(fd, "commission")) || 0;
  if (!/^[A-Z0-9]{1,8}$/.test(symbol) || !(tickSize > 0) || !(tickValue > 0)) return;
  await db
    .insert(instruments)
    .values({ symbol, name, tickSize: String(tickSize), tickValue: String(tickValue), commission: String(commission) })
    .onConflictDoNothing();
  revalidatePath("/settings");
}

// ---------- CSV import ----------

export type ImportState = { results: ImportResult[] } | null;

export async function importCsvs(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const results: ImportResult[] = [];
  for (const f of files) {
    const text = await f.text();
    const res = await importCsvFile(f.name, text);
    await widenAccountFilter(res.accounts);
    results.push(res);
  }
  revalidatePath("/", "layout");
  return { results };
}

/**
 * Import one PIECE of a CSV file. Big files (tick bars) exceed the per-request
 * body limits (Next server actions + Vercel's ~4.5 MB cap), so the browser
 * splits them into line-aligned chunks, each with the header line prepended,
 * and sends them one by one. Bars are idempotent and executions are deduped,
 * so partial re-sends are safe.
 */
export async function importCsvPart(fd: FormData): Promise<ImportResult> {
  const filename = str(fd, "name");
  const file = fd.get("part");
  const text = file instanceof File ? await file.text() : String(file ?? "");
  const res = await importCsvFile(filename, text, str(fd, "account") || undefined);
  await widenAccountFilter(res.accounts);
  if (str(fd, "last") === "1") revalidatePath("/", "layout");
  return res;
}

/** If the account filter is active and the import brought trades for accounts
 *  outside it, add them — otherwise fresh trades look like they vanished. */
async function widenAccountFilter(accounts?: string[]) {
  if (!accounts?.length) return;
  const jar = await cookies();
  const raw = jar.get(ACCOUNTS_COOKIE_NAME)?.value;
  if (!raw) return; // no filter = all accounts visible already
  const selected = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const missing = accounts.filter((a) => !selected.includes(a));
  if (!missing.length) return;
  jar.set(ACCOUNTS_COOKIE_NAME, [...selected, ...missing].join(","), { maxAge: 60 * 60 * 24 * 365, path: "/" });
}
