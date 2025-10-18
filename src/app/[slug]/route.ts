import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!slug)
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });

  const record = await prisma.upload.findUnique({ where: { url: slug } });
  if (!record)
    return NextResponse.json({ error: "File not found" }, { status: 404 });

  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  const publicBase = process.env.R2_PUBLIC_BASE_URL || "";
  if (publicBase && record.r2Key) {
    const url = `${publicBase.replace(/\/$/, "")}/${record.r2Key}`;
    return NextResponse.redirect(url, { status: 302 });
  }

  return NextResponse.json({
    filename: record.filename,
    type: record.type,
    url: record.url,
    expiresAt: record.expiresAt,
  });
}

export const runtime = "nodejs";
