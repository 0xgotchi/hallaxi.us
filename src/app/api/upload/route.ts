import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload as S3Upload } from "@aws-sdk/lib-storage";
import { type NextRequest, NextResponse } from "next/server";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt, validateFile } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { generateSlug, generateSnowflakeIdFor } from "@/lib/utils";

export async function POST(req: NextRequest) {
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
    const bucket = process.env.R2_BUCKET || "";
    if (!bucket)
      return NextResponse.json(
        { error: "R2_BUCKET not configured" },
        { status: 500 },
      );

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

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const generatedId = generateSnowflakeIdFor(
        `${file.name}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      );
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
        break;
      } catch (e: unknown) {
        const isUniqueConstraint =
          e && typeof e === "object" && (e as any).code === "P2002";
        if (isUniqueConstraint && attempt < maxAttempts - 1) continue;
        throw e;
      }
    }

    const id = created.id;
    const key = `${id}/${file.name}`;
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

    await prisma.upload.update({ where: { id }, data: { r2Key: key, domain } });

    const responsePayload = {
      slug,
      filename: file.name,
      size: file.size,
      type: file.type,
      url: `/${slug}`,
      publicUrl: buildPublicUrl(slug, domain),
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
