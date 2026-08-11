// GET /api/images/[id] — serve a stored image.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { docImages } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const img = await db.query.docImages.findFirst({ where: eq(docImages.id, id) });
  if (!img) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(img.data, "base64"), {
    headers: {
      "Content-Type": img.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
