import {
  PutObjectCommand,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { generateSlug, generateSnowflakeId } from "@/lib/utils";
import { reportProgress, sendResult, sendError } from "@/lib/realtime";

export async function processUploadJob(jobData: any) {
  const { sessionId, file, expiresField, submittedDomain } = jobData;

  try {
    console.log("ProcessUploadJob started for session:", sessionId);
    await reportProgress(sessionId, 5);

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

    console.log("Database record created, ID:", id);
    await reportProgress(sessionId, 10);

    const fileBuffer = Buffer.from(file.buffer, "base64");
    const key = `${id}/${file.name}`;
    const sse =
      process.env.R2_FORCE_SSE === "true" ? ("AES256" as const) : undefined;

    console.log(
      "File size:",
      file.size,
      "Using multipart:",
      file.size > 5 * 1024 * 1024,
    );

    if (file.size <= 5 * 1024 * 1024) {
      console.log("Using single part upload");
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: file.type,
          ...(sse ? { ServerSideEncryption: sse } : {}),
        }),
      );

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

      console.log("Single part upload completed");
      await reportProgress(sessionId, 100);
      await sendResult(sessionId, finalResult);
    } else {
      console.log("Using multipart upload");
      await processMultipartUpload(
        sessionId,
        id,
        slug,
        file,
        fileBuffer,
        key,
        sse,
        domain,
      );
    }

    return { success: true };
  } catch (error) {
    console.error(`Upload failed for ${sessionId}:`, error);
    await sendError(
      sessionId,
      error instanceof Error ? error.message : "Upload failed",
    );
    throw error;
  }
}

async function processMultipartUpload(
  sessionId: string,
  id: string,
  slug: string,
  file: any,
  fileBuffer: Buffer,
  key: string,
  sse: any,
  domain: string,
) {
  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET;

  if (!r2 || !bucket) throw new Error("R2 not configured");

  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

  console.log("Starting multipart upload, chunks:", totalChunks);

  const createRes = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.type,
      ...(sse ? { ServerSideEncryption: sse } : {}),
    }),
  );

  const multipartUploadId = createRes.UploadId as string;
  const parts: Array<{ ETag?: string; PartNumber: number }> = [];

  try {
    await reportProgress(sessionId, 15);

    for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
      const chunk = fileBuffer.subarray(start, end);

      console.log(`Uploading part ${partNumber}/${totalChunks}`);
      const { ETag } = await r2.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: multipartUploadId,
          PartNumber: partNumber,
          Body: chunk,
        }),
      );

      parts.push({ ETag, PartNumber: partNumber });

      const progress = Math.round((partNumber / totalChunks) * 75) + 15;
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

    console.log("Multipart upload completed");
    await reportProgress(sessionId, 100);
    await sendResult(sessionId, finalResult);
  } catch (e) {
    console.error("Multipart upload failed:", e);
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
