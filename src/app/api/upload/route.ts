export const runtime = "nodejs";
export const maxDuration = 300;

import {
  PutObjectCommand,
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt, validateFile } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { generateSlug, generateSnowflakeId } from "@/lib/utils";
import { withRedis } from "@/lib/redis";

const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 10 * 1024 * 1024;
const SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024;

function calculateOptimalChunkSize(fileSize: number): number {
  if (fileSize <= MIN_CHUNK_SIZE * 2) {
    return MIN_CHUNK_SIZE;
  }
  if (fileSize <= 100 * 1024 * 1024) {
    return MIN_CHUNK_SIZE;
  }
  return MAX_CHUNK_SIZE;
}

async function reportProgress(uploadId: string, progress: number) {
  try {
    await withRedis(async (redis) => {
      await redis.setEx(`upload:progress:${uploadId}`, 3600, progress.toString());
    });
  } catch (error) {
    console.error('Failed to report progress:', error);
  }
}

export async function POST(req: NextRequest) {
  let uploadId: string = '';
  
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const expiresField = String(formData.get("expires") ?? "7d");
    const submittedDomain = String(formData.get("domain") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File not provided (field 'file')" },
        { status: 400 },
      );
    }

    const { valid, error } = validateFile(file);
    if (!valid) return NextResponse.json({ error }, { status: 400 });

    const r2 = getR2Client();
    if (!r2) {
      console.error("R2 client not initialized");
      return NextResponse.json(
        { error: "R2 client not initialized" },
        { status: 500 },
      );
    }

    const bucket = process.env.R2_BUCKET || "";
    if (!bucket) {
      return NextResponse.json(
        { error: "R2_BUCKET not configured" },
        { status: 500 },
      );
    }

    const host = req.headers.get("host") ?? "";
    const domain = allowedDomains.includes(submittedDomain as any)
      ? submittedDomain
      : allowedDomains.includes(host as any)
        ? host
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

    const maxAttempts = 5;
    let created: any = null;
    let id: string = "";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const generatedId = generateSnowflakeId();
      try {
        created = await prisma.upload.create({
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
      } catch (e: unknown) {
        const isUniqueConstraint =
          e && typeof e === "object" && (e as any).code === "P2002";
        if (isUniqueConstraint && attempt < maxAttempts - 1) {
          console.log(`ID collision, retrying... attempt ${attempt + 1}`);
          continue;
        }
        throw e;
      }
    }

    if (!id || id === "") {
      throw new Error("Failed to create upload record after multiple attempts - no ID generated");
    }

    uploadId = id;
    await reportProgress(uploadId, 5);
    
    const key = `${id}/${file.name}`;
    const sse = process.env.R2_FORCE_SSE === "true" ? ("AES256" as const) : undefined;

    if (file.size <= SIMPLE_UPLOAD_THRESHOLD) {
      console.log(`Using simple upload for small file: ${file.name} (${file.size} bytes)`);
      
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
      
      await reportProgress(uploadId, 100);
      console.log(`Simple upload completed for ${file.name}`);
    } else {
      console.log(`Starting multipart upload for: ${file.name} (${file.size} bytes)`);
      
      const chunkSize = calculateOptimalChunkSize(file.size);
      const totalChunks = Math.ceil(file.size / chunkSize);
      
      console.log(`Using chunk size: ${chunkSize} bytes, total chunks: ${totalChunks}`);
      
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
        
        console.log(`Starting multipart upload with ${totalChunks} chunks`);
        
        await reportProgress(uploadId, 10);
        
        for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
          const start = (partNumber - 1) * chunkSize;
          const end = Math.min(start + chunkSize, file.size);
          const chunk = file.slice(start, end);
          
          const chunkBuffer = await chunk.arrayBuffer();
          console.log(`Uploading chunk ${partNumber}/${totalChunks} (${end - start} bytes)`);
          
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
          
          const progress = Math.round((partNumber / totalChunks) * 90) + 10;
          await reportProgress(uploadId, progress);
          
          console.log(`Upload progress: ${partNumber}/${totalChunks} chunks (${progress}%)`);
        }

        console.log(`Completing multipart upload with ${parts.length} parts`);
        
        parts.sort((a, b) => a.PartNumber - b.PartNumber);
        
        await r2.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: multipartUploadId,
            MultipartUpload: { Parts: parts },
          }),
        );
        
        await reportProgress(uploadId, 100);
        console.log(`Multipart upload completed successfully for ${file.name}`);
      } catch (e) {
        console.error(`Multipart upload failed for ${file.name}:`, e);
        try {
          await r2.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: key,
              UploadId: multipartUploadId,
            }),
          );
          console.log(`Aborted multipart upload for ${file.name}`);
        } catch (abortError) {
          console.error("Failed to abort multipart upload:", abortError);
        }
        throw e;
      }
    }

    await prisma.upload.update({ 
      where: { id }, 
      data: { r2Key: key, domain } 
    });

    const responsePayload = {
      slug,
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/${slug}`,
      publicUrl: buildPublicUrl(slug, domain),
      uploadId: uploadId,
    };

    console.log(`Upload completed successfully: ${file.name} -> ${slug}`);
    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err: unknown) {
    console.error("Upload error:", err);

    if (uploadId) {
      try {
        await withRedis(async (redis) => {
          await redis.del(`upload:progress:${uploadId}`);
        });
      } catch (error) {
        console.error('Failed to cleanup progress:', error);
      }
    }

    let message = "Upload failed";
    if (err && typeof err === "object") {
      const e = err as any;
      if (e.name === "AccessDenied" || e.Code === "AccessDenied") {
        message = "Access denied to R2 bucket. Check keys and permissions.";
      } else if (e.name === "EntityTooSmall" || e.Code === "EntityTooSmall") {
        message = "Upload failed: File parts are too small. Please try again or contact support.";
      } else if (e.message) {
        message = e.message;
      }
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}