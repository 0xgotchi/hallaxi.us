export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import {
  PutObjectCommand,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt, validateFile } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { generateSlug, generateSnowflakeId } from "@/lib/utils";
import {
  reportProgress,
  sendResult,
  sendError,
  cleanupSession,
} from "@/lib/realtime";

const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024;

function calculateOptimalChunkSize(fileSize: number): number {
  if (fileSize <= MIN_CHUNK_SIZE * 2) return MIN_CHUNK_SIZE;
  if (fileSize <= 100 * 1024 * 1024) return MIN_CHUNK_SIZE;
  return MAX_CHUNK_SIZE;
}

async function processUploadInBackground(
  file: File,
  expiresField: string,
  submittedDomain: string,
  sessionId: string,
) {
  try {
    const r2 = getR2Client();
    if (!r2) throw new Error("R2 client not initialized");

    const bucket = process.env.R2_BUCKET;
    if (!bucket) throw new Error("R2_BUCKET not configured");

    const domain = allowedDomains.includes(submittedDomain as any)
      ? submittedDomain
      : allowedDomains[0];

    let slug = generateSlug();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.upload.findUnique({ where: { url: slug } });
      if (!exists) break;
      slug = generateSlug();
    }

    const now = new Date();
    let expiresAt: Date;
    if (expiresField === "1h")
      expiresAt = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    else if (expiresField === "1d") expiresAt = computeExpiresAt(now, 1);
    else if (expiresField === "7d") expiresAt = computeExpiresAt(now, 7);
    else if (expiresField === "30d") expiresAt = computeExpiresAt(now, 30);
    else expiresAt = computeExpiresAt(now, 7);

    let id = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      const generatedId = generateSnowflakeId();
      const exists = await prisma.upload.findUnique({
        where: { id: generatedId },
      });
      if (!exists) {
        await prisma.upload.create({
          data: {
            id: generatedId,
            filename: file.name,
            type: file.type,
            url: slug,
            uploadAt: now,
            expiresAt,
            domain,
            r2Key: "",
          },
        });
        id = generatedId;
        break;
      }
    }

    if (!id) throw new Error("Failed to create upload record");

    await reportProgress(sessionId, 5);

    const key = `${id}/${file.name}`;
    const sse =
      process.env.R2_FORCE_SSE === "true" ? ("AES256" as const) : undefined;

    if (file.size <= SIMPLE_UPLOAD_THRESHOLD) {
      const arrayBuffer = await file.arrayBuffer();
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: new Uint8Array(arrayBuffer),
          ContentType: file.type,
          ...(sse ? { ServerSideEncryption: sse } : {}),
        }),
      );

      await reportProgress(sessionId, 100);
    } else {
      const chunkSize = calculateOptimalChunkSize(file.size);
      const totalChunks = Math.ceil(file.size / chunkSize);

      const createRes = await r2.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          ContentType: file.type,
          ...(sse ? { ServerSideEncryption: sse } : {}),
        }),
      );

      const multipartUploadId = createRes.UploadId as string;

      try {
        const parts: Array<{ ETag?: string; PartNumber: number }> = [];
        await reportProgress(sessionId, 10);

        for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);
          const chunkBuffer = await chunk.arrayBuffer();

          const { ETag } = await r2.send(
            new UploadPartCommand({
              Bucket: bucket,
              Key: key,
              UploadId: multipartUploadId,
              PartNumber: partNumber,
              Body: new Uint8Array(chunkBuffer),
            }),
          );

          parts.push({ ETag, PartNumber: partNumber });

          const progress = Math.round((partNumber / totalChunks) * 85) + 10;
          await reportProgress(sessionId, progress);
        }

        await reportProgress(sessionId, 95);
        parts.sort((a, b) => a.PartNumber - b.PartNumber);

        await r2.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: multipartUploadId,
            MultipartUpload: { Parts: parts },
          }),
        );

        await reportProgress(sessionId, 100);
      } catch (e) {
        await reportProgress(sessionId, -1);
        try {
          await r2.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: key,
              UploadId: multipartUploadId,
            }),
          );
        } catch (abortError) {
          console.error("Failed to abort multipart upload:", abortError);
        }
        throw e;
      }
    }

    await prisma.upload.update({
      where: { id },
      data: { r2Key: key, domain },
    });

    const finalResult = {
      slug,
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/${slug}`,
      publicUrl: buildPublicUrl(slug, domain),
      completed: true,
    };

    await sendResult(sessionId, finalResult);
  } catch (error) {
    console.error("Background upload error:", error);
    await sendError(
      sessionId,
      error instanceof Error ? error.message : "Upload failed",
    );
  }
}

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

    processUploadInBackground(
      file,
      expiresField,
      submittedDomain,
      sessionId,
    ).catch((error) => {
      console.error("Background upload failed:", error);
    });

    return NextResponse.json(
      {
        status: "started",
        sessionId,
        message: "Upload started",
      },
      { status: 202 },
    );
  } catch (err: any) {
    console.error("Upload error:", err);

    await cleanupSession(sessionId).catch(console.error);

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
