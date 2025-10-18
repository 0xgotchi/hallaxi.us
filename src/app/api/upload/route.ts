import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload as S3Upload } from "@aws-sdk/lib-storage";
import { type NextRequest, NextResponse } from "next/server";
import { computeExpiresAt, validateFile } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";

function generateSlug(length = 6) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let res = "";
  for (let i = 0; i < length; i++)
    res += chars[Math.floor(Math.random() * chars.length)];
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File not provided (field 'file')" },
        { status: 400 },
      );
    }

    const { valid, error } = validateFile(file);
    if (!valid) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET || "";
    if (!bucket) {
      return NextResponse.json(
        { error: "R2_BUCKET not configured" },
        { status: 500 },
      );
    }

    const key = `${Date.now()}-${crypto.randomUUID()}-${file.name}`;

    const isLarge = file.size > 500 * 1024 * 1024;

    if (isLarge) {
      const sse =
        process.env.R2_FORCE_SSE === "true" ? ("AES256" as const) : undefined;
      const createRes = await r2.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          ContentType: file.type,
          ...(sse ? { ServerSideEncryption: sse } : {}),
        }),
      );
      const uploadId = createRes.UploadId as string;

      try {
        const partSize = 10 * 1024 * 1024;
        const parts: Array<{ ETag?: string; PartNumber: number }> = [];
        const stream = file.stream();
        const reader = stream.getReader();
        let partNumber = 1;
        let buffer = new Uint8Array(0);

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          const merged = new Uint8Array(buffer.length + value.length);
          merged.set(buffer);
          merged.set(value, buffer.length);
          buffer = merged;

          while (buffer.length >= partSize) {
            const chunk = buffer.subarray(0, partSize);
            buffer = buffer.subarray(partSize);
            const { ETag } = await r2.send(
              new UploadPartCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: chunk,
              }),
            );
            parts.push({ ETag, PartNumber: partNumber });
            partNumber++;
          }
        }

        if (buffer.length > 0) {
          const { ETag } = await r2.send(
            new UploadPartCommand({
              Bucket: bucket,
              Key: key,
              UploadId: uploadId,
              PartNumber: partNumber,
              Body: buffer,
            }),
          );
          parts.push({ ETag, PartNumber: partNumber });
        }

        await r2.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            MultipartUpload: { Parts: parts },
          }),
        );
      } catch (e) {
        try {
          await r2.send(
            new AbortMultipartUploadCommand({
              Bucket: bucket,
              Key: key,
              UploadId: uploadId,
            }),
          );
        } catch (_) {}
        throw e;
      }
    } else {
      const sse =
        process.env.R2_FORCE_SSE === "true" ? ("AES256" as const) : undefined;
      const uploader = new S3Upload({
        client: r2,
        params: {
          Bucket: bucket,
          Key: key,
          Body: file.stream(),
          ContentType: file.type,
          ...(sse ? { ServerSideEncryption: sse } : {}),
        },
      });
      await uploader.done();
    }

    let slug = generateSlug(6);
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.upload.findUnique({ where: { url: slug } });
      if (!exists) break;
      slug = generateSlug(6);
    }

    const expiresAt = computeExpiresAt(new Date());

    await prisma.upload.create({
      data: {
        filename: file.name,
        type: file.type,
        url: slug,
        uploadAt: new Date(),
        expiresAt,
        r2Key: key,
      },
    });

    const publicBase = process.env.R2_PUBLIC_BASE_URL || "";
    const responsePayload = {
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/${slug}`,
      publicUrl: publicBase ? `${publicBase}/${key}` : null,
    };

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err: unknown) {
    console.error("Upload error:", err);
    let message = "Upload failed";
    if (err && typeof err === "object") {
      const e = err as { name?: unknown; Code?: unknown };
      if (e.name === "AccessDenied" || e.Code === "AccessDenied") {
        message = "Access denied to R2 bucket. Check keys and permissions.";
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const runtime = "nodejs";
