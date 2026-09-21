// GET /api/samples/[id] — download a platform sample (first/owner user only).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { currentUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const firstUser = await db.query.users.findFirst({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
  if (firstUser?.id !== uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sample = await db.query.platformSamples.findFirst({ where: (ps, { eq }) => eq(ps.id, id) });
  if (!sample) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(sample.content, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${sample.filename.replace(/[^\w.\- ]/g, "_")}"`,
    },
  });
}
