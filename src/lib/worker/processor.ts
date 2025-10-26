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

interface ChunkData {
  chunks: Map<number, Buffer>;
  fileName: string;
  fileType: string;
  fileSize: number;
  expiresField: string;
  submittedDomain: string;
  createdAt: number;
  totalChunks: number;
  receivedChunks: Set<number>;
}

const chunkStorage = new Map<string, ChunkData>();

const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/\s+/g, "_");
};

export async function processUploadJob(jobData: any) {
  const { sessionId, file, expiresField, submittedDomain } = jobData;

  try {
    const sanitizedFileName = sanitizeFileName(file.name);

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
        filename: sanitizedFileName,
        type: file.type,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: "",
      },
    });

    const fileBuffer = Buffer.from(file.buffer, "base64");
    const key = `${id}/${sanitizedFileName}`;

    if (file.size > 1024 * 1024) {
      await reportProgress(sessionId, 10);
    }

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
      filename: sanitizedFileName,
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

export async function processChunkedUpload(jobData: any) {
  const {
    sessionId,
    chunk,
    fileId,
    fileName,
    fileType,
    fileSize,
    expiresField,
    submittedDomain,
    totalChunks,
  } = jobData;

  try {
    const sanitizedFileName = sanitizeFileName(fileName);

    if (!chunkStorage.has(fileId)) {
      chunkStorage.set(fileId, {
        chunks: new Map(),
        fileName: sanitizedFileName,
        fileType,
        fileSize,
        expiresField,
        submittedDomain,
        createdAt: Date.now(),
        totalChunks: chunk.total,
        receivedChunks: new Set(),
      });
    }

    const fileData = chunkStorage.get(fileId);
    if (!fileData) {
      throw new Error("File data not found");
    }

    if (fileData.receivedChunks.has(chunk.index)) {
      return { success: true, chunkIndex: chunk.index, duplicated: true };
    }

    fileData.chunks.set(chunk.index, Buffer.from(chunk.data, "base64"));
    fileData.receivedChunks.add(chunk.index);

    const progress =
      Math.round((fileData.receivedChunks.size / fileData.totalChunks) * 80) +
      10;
    await reportProgress(sessionId, progress);

    return {
      success: true,
      chunkIndex: chunk.index,
      receivedChunks: fileData.receivedChunks.size,
      totalChunks: fileData.totalChunks,
    };
  } catch (error) {
    console.error(`Chunk upload failed for ${sessionId}:`, error);
    await sendError(
      sessionId,
      error instanceof Error ? error.message : "Chunk upload failed",
    );
    throw error;
  }
}

export async function finalizeChunkedUpload(jobData: any) {
  const {
    sessionId,
    fileId,
    fileName,
    fileType,
    fileSize,
    expiresField,
    submittedDomain,
  } = jobData;

  try {
    const sanitizedFileName = sanitizeFileName(fileName);

    const r2 = getR2Client();
    if (!r2) throw new Error("R2 client not initialized");

    const bucket = process.env.R2_BUCKET;
    if (!bucket) throw new Error("R2_BUCKET not configured");

    const fileData = chunkStorage.get(fileId);
    if (!fileData) {
      throw new Error("File chunks not found");
    }

    if (fileData.receivedChunks.size !== fileData.totalChunks) {
      throw new Error(
        `Missing chunks. Received ${fileData.receivedChunks.size} of ${fileData.totalChunks}`,
      );
    }

    await reportProgress(sessionId, 92);

    const chunks: Buffer[] = [];
    for (let i = 0; i < fileData.totalChunks; i++) {
      const chunk = fileData.chunks.get(i);
      if (!chunk) {
        throw new Error(`Chunk ${i} not found`);
      }
      chunks.push(chunk);
    }

    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length !== fileSize) {
      throw new Error(
        `File size mismatch. Expected ${fileSize}, got ${fileBuffer.length}`,
      );
    }

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
        filename: sanitizedFileName,
        type: fileType,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: "",
      },
    });

    await reportProgress(sessionId, 95);

    const key = `${id}/${sanitizedFileName}`;

    if (fileSize <= 5 * 1024 * 1024) {
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileBuffer,
          ContentType: fileType,
        }),
      );
    } else {
      await processMultipartUploadFinal(r2, bucket, key, fileType, fileBuffer);
    }

    await reportProgress(sessionId, 98);

    await prisma.upload.update({
      where: { id },
      data: { r2Key: key, domain },
    });

    chunkStorage.delete(fileId);

    const finalResult = {
      slug,
      filename: sanitizedFileName,
      size: fileSize,
      type: fileType,
      url: `/${slug}`,
      publicUrl: buildPublicUrl(slug, domain),
      completed: true,
    };

    await reportProgress(sessionId, 100);
    await sendResult(sessionId, finalResult);

    return finalResult;
  } catch (error) {
    console.error(`Finalize upload failed for ${sessionId}:`, error);
    chunkStorage.delete(fileId);
    await sendError(
      sessionId,
      error instanceof Error ? error.message : "Finalize upload failed",
    );
    throw error;
  }
}

async function processMultipartUploadFinal(
  r2: any,
  bucket: string,
  key: string,
  fileType: string,
  fileBuffer: Buffer,
) {
  const CHUNK_SIZE = 40 * 1024 * 1024;
  const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);

  const createRes = await r2.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: fileType,
    }),
  );

  const multipartUploadId = createRes.UploadId as string;
  const parts: Array<{ ETag?: string; PartNumber: number }> = [];

  try {
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
          .then((res: { ETag?: string }) => {
            const ETag = res.ETag;
            parts.push({ ETag, PartNumber: partNumber });
          }),
      );
    }

    await Promise.all(uploadPromises);
    parts.sort((a, b) => a.PartNumber - b.PartNumber);

    await r2.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: multipartUploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  } catch (e) {
    console.error("Multipart upload failed:", e);
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
