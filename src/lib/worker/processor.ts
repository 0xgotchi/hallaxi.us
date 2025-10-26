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

const chunkStorage = new Map();

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

    const fileBuffer = Buffer.from(file.buffer, "base64");
    const key = `${id}/${file.name}`;

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
  } = jobData;

  try {
    if (!chunkStorage.has(fileId)) {
      chunkStorage.set(fileId, {
        chunks: new Map(),
        fileName,
        fileType,
        fileSize,
        expiresField,
        submittedDomain,
        createdAt: Date.now(),
      });
    }

    const fileData = chunkStorage.get(fileId);
    fileData.chunks.set(chunk.index, Buffer.from(chunk.data, "base64"));

    const progress = Math.round(((chunk.index + 1) / chunk.total) * 80) + 10;
    await reportProgress(sessionId, progress);

    return { success: true, chunkIndex: chunk.index };
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
        filename: fileName,
        type: fileType,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: "",
      },
    });

    await reportProgress(sessionId, 95);

    const fileData = chunkStorage.get(fileId);
    if (!fileData) {
      throw new Error("File chunks not found");
    }

    // Aqui, adicionamos a tipagem explícita para 'chunks.entries()'
    const chunksArray = Array.from(fileData.chunks.entries()) as [
      number,
      Buffer,
    ][];

    // Ordenar e mapear explicitamente
    chunksArray.sort((a, b) => a[0] - b[0]); // Ordena pela chave (índice do chunk)
    const chunks: Buffer[] = chunksArray.map((entry) => entry[1]); // Extrai os buffers

    const fileBuffer = Buffer.concat(chunks);
    const key = `${id}/${fileName}`;

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

    await prisma.upload.update({
      where: { id },
      data: { r2Key: key, domain },
    });

    chunkStorage.delete(fileId);

    const finalResult = {
      slug,
      filename: fileName,
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
  const CHUNK_SIZE = 5 * 1024 * 1024;
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
            // Adicionando tipo para 'res'
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
