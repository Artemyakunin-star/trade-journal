// POST /api/images  (body: raw image bytes, content-type header, ?docId=...)
// Stores the image (base64 in Postgres) and returns { id, url }.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { docImages } from "@/db/schema";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB after client-side compression

export async function POST(req: NextRequest) {
  const mimeType = req.headers.get("content-type") ?? "";
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mimeType)) {
    return NextResponse.json({ error: "Only png/jpeg/webp/gif images are accepted" }, { status: 415 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "Empty body" }, { status: 400 });
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 4MB)" }, { status: 413 });
  }
  const docId = req.nextUrl.searchParams.get("docId");
  const [row] = await db
    .insert(docImages)
    .values({ docId: docId || null, mimeType, data: buf.toString("base64") })
    .returning({ id: docImages.id });
  return NextResponse.json({ id: row.id, url: `/api/images/${row.id}` });
}
