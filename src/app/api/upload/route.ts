import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt, validateFile } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { generateSlug, generateSnowflakeId } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const expiresField = String(formData.get("expires") ?? "7d");
    const submittedDomain = String(formData.get("domain") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File not provided" }, { status: 400 });
    }

    const { valid, error } = validateFile(file);
    if (!valid) return NextResponse.json({ error }, { status: 400 });

    const domain = allowedDomains.includes(submittedDomain as any)
      ? submittedDomain
      : allowedDomains[0];

    const slug = generateSlug();
    const id = generateSnowflakeId();

    const now = new Date();
    const expiresAt = computeExpiresAt(expiresField, now);

    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;
    const sanitizedFileName = file.name.replace(/\s+/g, "_");
    const key = `${id}/${sanitizedFileName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    console.log(
      `Uploading file: ${sanitizedFileName} (${fileBuffer.length} bytes) to domain: ${domain}`,
    );

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: file.type,
      }),
    );

    const upload = await prisma.upload.create({
      data: {
        id,
        filename: sanitizedFileName,
        type: file.type,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: key,
      },
    });

    console.log(`Upload completed: ${slug} on ${domain}`);

    return NextResponse.json({
      id: upload.id,
      slug: upload.url,
      filename: upload.filename,
      size: file.size,
      type: file.type,
      url: `/${upload.url}`,
      publicUrl: buildPublicUrl(upload.url, domain),
      completed: true,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
