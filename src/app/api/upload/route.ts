export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { validateFile } from "@/config/upload";
import {
  processUploadJob,
  processChunkedUpload,
  finalizeChunkedUpload,
} from "@/lib/worker/processor";

const uploadStatus = new Map();
const CHUNK_SIZE = 4 * 1024 * 1024;
const UPLOAD_TIMEOUT = 5 * 60 * 1000;

const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/\s+/g, "_");
};

setInterval(
  () => {
    const now = Date.now();
    for (const [sessionId, status] of uploadStatus.entries()) {
      if (now - status.createdAt > UPLOAD_TIMEOUT) {
        console.log(`Cleaning up expired upload session: ${sessionId}`);
        uploadStatus.delete(sessionId);
      }
    }
  },
  5 * 60 * 1000,
);

export async function POST(req: NextRequest) {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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
      return await processChunkUpload(
        sessionId,
        file as File,
        parseInt(chunkIndex as string),
        parseInt(totalChunks as string),
        fileId as string,
        sanitizedFileName,
        fileType,
        parseInt(fileSize),
        expiresField,
        submittedDomain,
      );
    }

    const isFinalize = formData.get("finalize");
    if (isFinalize !== null && fileId !== null) {
      return await finalizeChunkedUploadHandler(
        sessionId,
        fileId as string,
        sanitizedFileName,
        fileType,
        parseInt(fileSize),
        expiresField,
        submittedDomain,
      );
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

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

      uploadStatus.set(sessionId, {
        status: "chunked_started",
        fileId,
        totalChunks,
        uploadedChunks: 0,
        expiresField,
        submittedDomain,
        filename: sanitizedFileName,
        filetype: fileToProcess.type,
        filesize: fileToProcess.size,
        createdAt: Date.now(),
      });

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

async function processChunkUpload(
  sessionId: string,
  file: File,
  chunkIndex: number,
  totalChunks: number,
  fileId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  expiresField: string,
  submittedDomain: string,
) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await processChunkedUpload({
      sessionId,
      chunk: {
        data: buffer.toString("base64"),
        index: chunkIndex,
        total: totalChunks,
      },
      fileId,
      fileName,
      fileType,
      fileSize,
      expiresField,
      submittedDomain,
      totalChunks,
    });

    const status = uploadStatus.get(sessionId);
    if (status) {
      status.uploadedChunks = (status.uploadedChunks || 0) + 1;
      status.lastActivity = Date.now();

      const progress = Math.round((status.uploadedChunks / totalChunks) * 100);

      if (status.uploadedChunks === totalChunks) {
        status.status = "ready_for_finalize";
      }
    }

    return NextResponse.json({
      success: true,
      chunkIndex,
      receivedChunks: result.receivedChunks,
      totalChunks: result.totalChunks,
      progress: Math.round(((chunkIndex + 1) / totalChunks) * 100),
    });
  } catch (err: any) {
    console.error("Chunk upload error:", err);
    return NextResponse.json(
      {
        error: err.message || "Chunk upload failed",
      },
      { status: 500 },
    );
  }
}

async function finalizeChunkedUploadHandler(
  sessionId: string,
  fileId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  expiresField: string,
  submittedDomain: string,
) {
  try {
    const result = await finalizeChunkedUpload({
      sessionId,
      fileId,
      fileName,
      fileType,
      fileSize,
      expiresField,
      submittedDomain,
    });

    uploadStatus.delete(sessionId);

    return NextResponse.json({
      status: "completed",
      sessionId,
      result,
    });
  } catch (err: any) {
    console.error("Finalize upload error:", err);

    const status = uploadStatus.get(sessionId);
    if (status) {
      status.status = "finalize_failed";
      status.error = err.message;
    }

    return NextResponse.json(
      {
        error: err.message || "Finalize upload failed",
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

function generateSnowflakeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}
