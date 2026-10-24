// Full export of the signed-in user's journal as one JSON file.
// ?images=1 additionally inlines every screenshot as a data URI (bigger file).
// Shared market bars are NOT included (public data, often millions of rows).
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { currentUserId } from "@/lib/auth";
import {
  dayFrames, dayRecaps, docImages, docs, executions, ideas, importLog, imports,
  missedTrades, noteEvidence, notes, plans, scenarios, sessionLog, settings,
  trades, userCommissions, users,
} from "@/db/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const withImages = req.nextUrl.searchParams.get("images") === "1";

  const u = (await db.select().from(users).where(eq(users.id, uid)))[0];
  const planRows = await db.select().from(plans).where(eq(plans.userId, uid));
  const planIds = planRows.map((p) => p.id);

  const [
    docRows, frameRows, scenarioRows, ideaRows, tradeRows, execRows, missedRows,
    logRows, recapRows, noteRows, evidenceRows, settingRows, commissionRows,
    importRows, importLogRows,
  ] = await Promise.all([
    db.select().from(docs).where(eq(docs.userId, uid)),
    db.select().from(dayFrames).where(eq(dayFrames.userId, uid)),
    planIds.length ? db.select().from(scenarios).where(inArray(scenarios.planId, planIds)) : Promise.resolve([]),
    db.select().from(ideas).where(eq(ideas.userId, uid)),
    db.select().from(trades).where(eq(trades.userId, uid)),
    db.select().from(executions).where(eq(executions.userId, uid)),
    db.select().from(missedTrades).where(eq(missedTrades.userId, uid)),
    db.select().from(sessionLog).where(eq(sessionLog.userId, uid)),
    db.select().from(dayRecaps).where(eq(dayRecaps.userId, uid)),
    db.select().from(notes).where(eq(notes.userId, uid)),
    db.select().from(noteEvidence).where(eq(noteEvidence.userId, uid)),
    db.select().from(settings).where(eq(settings.userId, uid)),
    db.select().from(userCommissions).where(eq(userCommissions.userId, uid)),
    db.select().from(imports).where(eq(imports.userId, uid)),
    db.select().from(importLog).where(eq(importLog.userId, uid)),
  ]);

  const images = withImages
    ? (await db.select().from(docImages).where(eq(docImages.userId, uid))).map((i) => ({
        id: i.id,
        docId: i.docId,
        mimeType: i.mimeType,
        createdAt: i.createdAt,
        dataUri: `data:${i.mimeType};base64,${i.data}`,
      }))
    : undefined;

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "tradejournal-export-v1",
    account: { email: u?.email, createdAt: u?.createdAt },
    note:
      "Everything your account owns, as stored. Rich texts are TipTap JSON; image src values like /api/images/<id> " +
      "refer to the screenshots — re-run the export with ?images=1 to inline them as data URIs. " +
      "Shared market bars are not included (public data).",
    plans: planRows,
    planScenarios: scenarioRows,
    documents: docRows,
    dayFrames: frameRows,
    ideas: ideaRows,
    trades: tradeRows,
    executions: execRows,
    missedTrades: missedRows,
    sessionLog: logRows,
    recaps: recapRows,
    notes: noteRows,
    noteEvidence: evidenceRows,
    settings: settingRows,
    commissions: commissionRows,
    importsRegistry: importRows,
    importHistory: importLogRows,
    ...(images ? { images } : {}),
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="tradejournal-export-${date}${withImages ? "-with-images" : ""}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
