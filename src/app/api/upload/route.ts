export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { validateFile } from "@/config/upload";
import { processUploadJob } from "@/lib/worker/processor";
import { reportProgress } from "@/lib/realtime";

export async function POST(req: NextRequest) {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const expiresField = String(formData.get("expires") ?? "7d");
    const submittedDomain = String(formData.get("domain") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const { valid, error } = validateFile(file);
    if (!valid) return NextResponse.json({ error }, { status: 400 });

    await reportProgress(sessionId, 1);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await processUploadJob({
      sessionId,
      file: {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer: buffer.toString("base64"),
      },
      expiresField,
      submittedDomain,
    });

    return NextResponse.json(
      {
        status: "completed",
        sessionId,
        message: "Upload completed successfully",
      },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("Upload error:", err);
    await reportProgress(sessionId, -1);
    return NextResponse.json(
      {
        error: err.message || "Upload failed",
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}
