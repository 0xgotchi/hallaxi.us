import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import { allowedDomains, buildPublicUrl } from "@/config/domain";
import { computeExpiresAt } from "@/config/upload";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { PostgresChunkStorage } from "@/lib/storage";
import { generateSlug } from "@/lib/utils";
export const dynamic = "force-dynamic";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { fileId, expiresField = "7d", submittedDomain } = await req.json();

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 },
      );
    }

    console.log(`Finalizing upload for fileId: ${fileId}`);

    const { chunks, session } = await PostgresChunkStorage.getAllChunks(fileId);

    const progress = await PostgresChunkStorage.getProgress(fileId);
    console.log(
      `Progress: ${progress.receivedChunks}/${session.totalChunks} chunks`,
    );

    if (progress.receivedChunks !== session.totalChunks) {
      return NextResponse.json(
        {
          error: `Not all chunks received. ${progress.receivedChunks}/${session.totalChunks} chunks uploaded`,
        },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length !== session.fileSize) {
      throw new Error(
        `File size mismatch. Expected ${session.fileSize}, got ${fileBuffer.length}`,
      );
    }

    console.log(`File buffer assembled: ${fileBuffer.length} bytes`);

    const domain = allowedDomains.includes(submittedDomain as any)
      ? submittedDomain
      : allowedDomains[0];

    const slug = generateSlug();
    const id = fileId;

    const now = new Date();
    const expiresAt = computeExpiresAt(expiresField, now);

    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;
    const key = `${id}/${session.fileName}`;

    console.log(`Uploading to R2: ${key} on domain: ${domain}`);

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileBuffer,
        ContentType: session.fileType,
      }),
    );

    console.log("R2 upload complete, creating database record");

    const upload = await prisma.upload.create({
      data: {
        id,
        filename: session.fileName,
        type: session.fileType,
        url: slug,
        uploadAt: now,
        expiresAt,
        domain,
        r2Key: key,
      },
    });

    console.log("Database record created, cleaning up chunks");

    await PostgresChunkStorage.cleanup(fileId);

    console.log(`Chunked upload finalized successfully: ${slug} on ${domain}`);

    return NextResponse.json({
      id: upload.id,
      slug: upload.url,
      filename: upload.filename,
      size: session.fileSize,
      type: session.fileType,
      url: `/${upload.url}`,
      publicUrl: buildPublicUrl(upload.url, domain),
      completed: true,
    });
  } catch (error) {
    console.error("Finalize upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to finalize upload",
      },
      { status: 500 },
    );
  }
}
