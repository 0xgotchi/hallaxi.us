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
    const r2 = getR2Client();
    if (!r2) throw new Error("R2 client not initialized");

    const bucket = process.env.R2_BUCKET;
    if (!bucket) throw new Error("R2_BUCKET not configured");

    const domain = allowedDomains.includes(submittedDomain as any)
      ? submittedDomain
      : allowedDomains[0];

    const slug = generateSlug();
    const id = generateSnowflakeId();

    const now = new Date();
    const expiresAt = calculateExpiresAt(expiresField, now);

    await prisma.upload.create({
      data: {
        id,
        filename: file.name,
        type: file.type,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: "",
      },
    });

    if (file.size > 1024 * 1024) {
      await reportProgress(sessionId, 30);
    }

    const fileBuffer = Buffer.from(file.buffer, "base64");
    const key = `${id}/${file.name}`;

    if (file.size <= 5 * 1024 * 1024) {
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: file.type,
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

      if (file.size > 1024 * 1024) {
        await reportProgress(sessionId, 100);
        await sendResult(sessionId, finalResult);
      }

      return finalResult;
    } else {
      return await processMultipartUpload(
        sessionId,
        id,
        slug,
        file,
        fileBuffer,
        key,
        domain,
      );
    }
  } catch (error) {
    console.error(`Upload failed for ${sessionId}:`, error);
    if (file.size > 1024 * 1024) {
      await sendError(
        sessionId,
        error instanceof Error ? error.message : "Upload failed",
      );
    }
    throw error;
  }
}

function calculateExpiresAt(expiresField: string, from: Date): Date {
  const now = from || new Date();

  switch (expiresField) {
    case "1h":
      return new Date(now.getTime() + 1 * 60 * 60 * 1000);
    case "1d":
      return computeExpiresAt(now, 1);
    case "7d":
      return computeExpiresAt(now, 7);
    case "30d":
      return computeExpiresAt(now, 30);
    default:
      return computeExpiresAt(now, 7);
  }
}

async function processMultipartUpload(
  sessionId: string,
  id: string,
  slug: string,
  file: any,
  fileBuffer: Buffer,
  key: string,
  domain: string,
) {
  const r2 = getR2Client();
  const bucket = process.env.R2_BUCKET;

  if (!r2 || !bucket) throw new Error("R2 not configured");

  const CHUNK_SIZE = 8 * 1024 * 1024;
  const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

  const createRes = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.type,
    }),
  );

  const multipartUploadId = createRes.UploadId as string;
  const parts: Array<{ ETag?: string; PartNumber: number }> = [];

  try {
    await reportProgress(sessionId, 40);

    const uploadPromises = [];

    for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
      const chunk = fileBuffer.subarray(start, end);

      uploadPromises.push(
        r2
          .send(
            new UploadPartCommand({
              Bucket: bucket,
              Key: key,
              UploadId: multipartUploadId,
              PartNumber: partNumber,
              Body: chunk,
            }),
          )
          .then(({ ETag }) => {
            parts.push({ ETag, PartNumber: partNumber });

            if (partNumber % Math.max(1, Math.floor(totalChunks / 5)) === 0) {
              const progress = Math.round((partNumber / totalChunks) * 50) + 40;
              return reportProgress(sessionId, progress);
            }
          }),
      );
    }

    await Promise.all(uploadPromises);
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

    await reportProgress(sessionId, 100);
    await sendResult(sessionId, finalResult);

    return finalResult;
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
