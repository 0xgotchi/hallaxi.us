import { PutObjectCommand } from "@aws-sdk/client-s3";
import { type NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const chunk = formData.get("chunk") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const totalChunks = parseInt(formData.get("totalChunks") as string);
    const fileId = formData.get("fileId") as string;
    const fileName = formData.get("fileName") as string;
    const fileType = formData.get("fileType") as string;
    const fileSize = parseInt(formData.get("fileSize") as string);

    if (!chunk || isNaN(chunkIndex) || !fileId || !fileName) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    console.log(
      `Receiving chunk ${chunkIndex + 1}/${totalChunks} for ${fileId}`,
    );

    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;

    if (chunkIndex === 0) {
      await prisma.chunkSession.upsert({
        where: { id: fileId },
        update: {},
        create: {
          id: fileId,
          fileId: fileId,
          fileName: fileName.replace(/\s+/g, "_"),
          fileType: fileType || "application/octet-stream",
          fileSize: fileSize,
          totalChunks: totalChunks,
        },
      });
      console.log(`Session created/verified for ${fileId}`);
    } else {
      const existingSession = await prisma.chunkSession.findUnique({
        where: { id: fileId },
      });

      if (!existingSession) {
        console.warn(
          `Session ${fileId} not found for chunk ${chunkIndex}, creating...`,
        );
        await prisma.chunkSession.upsert({
          where: { id: fileId },
          update: {},
          create: {
            id: fileId,
            fileId: fileId,
            fileName: fileName.replace(/\s+/g, "_"),
            fileType: fileType || "application/octet-stream",
            fileSize: fileSize,
            totalChunks: totalChunks,
          },
        });
      }
    }

    const chunkKey = `chunks/${fileId}/${chunkIndex}`;
    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: chunkKey,
        Body: chunkBuffer,
        ContentType: "application/octet-stream",
      }),
    );

    await prisma.chunkRecord.upsert({
      where: {
        sessionId_chunkIndex: {
          sessionId: fileId,
          chunkIndex: chunkIndex,
        },
      },
      update: {},
      create: {
        sessionId: fileId,
        chunkIndex: chunkIndex,
      },
    });

    const receivedCount = await prisma.chunkRecord.count({
      where: { sessionId: fileId },
    });

    const session = await prisma.chunkSession.findUnique({
      where: { id: fileId },
    });

    return NextResponse.json({
      success: true,
      chunkIndex,
      receivedChunks: receivedCount,
      totalChunks: session?.totalChunks || totalChunks,
      isComplete: receivedCount >= (session?.totalChunks || totalChunks),
      progress: Math.round(
        (receivedCount / (session?.totalChunks || totalChunks)) * 100,
      ),
    });
  } catch (error) {
    console.error("Chunk upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload chunk",
      },
      { status: 500 },
    );
  }
}
