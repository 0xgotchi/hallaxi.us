export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { validateFile } from "@/config/upload";
import {
  processUploadJob,
  processChunkedUpload,
  finalizeChunkedUpload,
} from "@/lib/worker/processor";

const CHUNK_SIZE = 4 * 1024 * 1024;

const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/\s+/g, "_");
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const chunkIndex = formData.get("chunkIndex");
    const totalChunks = formData.get("totalChunks");
    const fileId = formData.get("fileId");
    const expiresField = String(formData.get("expires") ?? "7d");
    const submittedDomain = String(formData.get("domain") ?? "");
    let fileName = String(formData.get("fileName") ?? "");
    const fileType = String(formData.get("fileType") ?? "");
    const fileSize = String(formData.get("fileSize") ?? "");

    if (!fileName && file instanceof File) {
      fileName = file.name;
    }

    const sanitizedFileName = sanitizeFileName(fileName);

    if (chunkIndex !== null && totalChunks !== null && fileId !== null) {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "File chunk not provided" },
          { status: 400 },
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await processChunkedUpload({
        sessionId,
        chunk: {
          data: buffer.toString("base64"),
          index: parseInt(chunkIndex as string),
          total: parseInt(totalChunks as string),
        },
        fileId: fileId as string,
        fileName: sanitizedFileName,
        fileType,
        fileSize: parseInt(fileSize),
        expiresField,
        submittedDomain,
        totalChunks: parseInt(totalChunks as string),
      });

      return NextResponse.json({
        success: true,
        chunkIndex: parseInt(chunkIndex as string),
        receivedChunks: result.receivedChunks,
        totalChunks: result.totalChunks,
      });
    }

    const isFinalize = formData.get("finalize");
    if (isFinalize !== null && fileId !== null) {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const result = await finalizeChunkedUpload({
        sessionId,
        fileId: fileId as string,
        fileName: sanitizedFileName,
        fileType,
        fileSize: parseInt(fileSize),
        expiresField,
        submittedDomain,
      });

      return NextResponse.json({
        status: "completed",
        sessionId,
        result,
      });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    let fileToProcess = file;
    if (sanitizedFileName !== file.name) {
      fileToProcess = new File([file], sanitizedFileName, {
        type: file.type,
        lastModified: file.lastModified,
      });
    }

    const { valid, error } = validateFile(fileToProcess);
    if (!valid) return NextResponse.json({ error }, { status: 400 });

    if (fileToProcess.size <= 4 * 1024 * 1024) {
      const arrayBuffer = await fileToProcess.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const result = await processUploadJob({
        sessionId,
        file: {
          name: sanitizedFileName,
          type: fileToProcess.type,
          size: fileToProcess.size,
          buffer: buffer.toString("base64"),
        },
        expiresField,
        submittedDomain,
      });

      return NextResponse.json({
        status: "completed",
        sessionId,
        result,
      });
    } else {
      const fileId = generateSnowflakeId();
      const totalChunks = Math.ceil(fileToProcess.size / CHUNK_SIZE);

      return NextResponse.json({
        status: "chunked_started",
        sessionId,
        fileId,
        totalChunks,
        chunkSize: CHUNK_SIZE,
      });
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 200 });
}

function generateSnowflakeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
