export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { validateFile } from "@/config/upload";
import { processUploadJob } from "@/lib/worker/processor";

const uploadStatus = new Map();

const MULTIPART_THRESHOLD = 4 * 1024 * 1024;

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

    uploadStatus.set(sessionId, {
      status: "processing",
      progress: 10,
      error: null,
      result: null,
    });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.size <= MULTIPART_THRESHOLD) {
      const result = await processUploadJob({
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

      uploadStatus.set(sessionId, {
        status: "completed",
        progress: 100,
        error: null,
        result: result,
      });

      return NextResponse.json(
        {
          status: "completed",
          sessionId,
          message: "Upload completed successfully",
          result: result,
        },
        { status: 200 },
      );
    } else {
      processUploadJob({
        sessionId,
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer: buffer.toString("base64"),
        },
        expiresField,
        submittedDomain,
      })
        .then(async (result) => {
          uploadStatus.set(sessionId, {
            status: "completed",
            progress: 100,
            error: null,
            result: result,
          });
        })
        .catch(async (error) => {
          uploadStatus.set(sessionId, {
            status: "failed",
            progress: -1,
            error: error.message,
            result: null,
          });
        });

      return NextResponse.json(
        {
          status: "started",
          sessionId,
          message: "Large file upload started (multipart)",
          initialProgress: 10,
        },
        { status: 202 },
      );
    }
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      {
        error: err.message || "Upload failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  const status = uploadStatus.get(sessionId) || {
    status: "unknown",
    progress: 0,
    error: "Session not found",
  };

  return NextResponse.json(status);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}
