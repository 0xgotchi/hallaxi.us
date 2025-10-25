export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { validateFile } from "@/config/upload";
import { processUploadJob } from "@/lib/worker/processor";
import { reportProgress } from "@/lib/realtime";
import prisma from "@/lib/prisma";

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

    // Create upload session in database
    await prisma.uploadSession.create({
      data: {
        id: sessionId,
        status: "processing",
        progress: 0,
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        expiresField,
        domain: submittedDomain,
        createdAt: new Date(),
      },
    });

    await reportProgress(sessionId, 1);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Start processing but don't wait for it
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
    }).then(async (result) => {
      // Update status on success
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          status: "completed",
          progress: 100,
          result: JSON.stringify(result),
          completedAt: new Date(),
        },
      });
    }).catch(async (error) => {
      // Update status on error
      await prisma.uploadSession.update({
        where: { id: sessionId },
        data: {
          status: "failed",
          progress: -1,
          error: error.message,
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json(
      {
        status: "started",
        sessionId,
        message: "Upload started successfully",
      },
      { status: 202 },
    );
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

// Add status endpoint for polling
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  try {
    const session = await prisma.uploadSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ 
        status: "unknown", 
        progress: 0, 
        error: "Session not found" 
      }, { status: 404 });
    }

    const response: any = {
      status: session.status,
      progress: session.progress,
    };

    if (session.error) {
      response.error = session.error;
    }

    if (session.result) {
      response.result = JSON.parse(session.result);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching upload status:", error);
    return NextResponse.json({ 
      status: "error", 
      progress: 0, 
      error: "Failed to fetch status" 
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}