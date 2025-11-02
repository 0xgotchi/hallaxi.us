import { type NextRequest, NextResponse } from "next/server";
import { PostgresChunkStorage } from "@/lib/chunk/storage";
import { reportProgress } from "@/lib/realtime";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
    const sessionId = formData.get("sessionId") as string;
    if (
      !chunk ||
      isNaN(chunkIndex) ||
      isNaN(totalChunks) ||
      !fileId ||
      !fileName
    ) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    console.log(
      `Receiving chunk ${chunkIndex + 1}/${totalChunks} for file ${fileId}`,
    );

    try {
      await PostgresChunkStorage.createSession({
        fileId,
        fileName: fileName.replace(/\s+/g, "_"),
        fileType: fileType || "application/octet-stream",
        fileSize,
        totalChunks,
      });
      console.log(`Created new session for fileId: ${fileId}`);
    } catch (error: any) {
      if (!error.message?.includes("Unique constraint")) {
        console.log(
          `Session creation skipped for fileId: ${fileId} - ${error.message}`,
        );
      }
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const result = await PostgresChunkStorage.addChunk(
      fileId,
      chunkIndex,
      chunkBuffer,
    );

    console.log(
      `Chunk ${chunkIndex} processed. Progress: ${result.receivedChunks}/${result.totalChunks}`,
    );

    if (sessionId) {
      const progress = Math.round(
        (result.receivedChunks / result.totalChunks) * 100,
      );
      await reportProgress(sessionId, progress);
    }

    return NextResponse.json({
      success: true,
      chunkIndex,
      receivedChunks: result.receivedChunks,
      totalChunks: result.totalChunks,
      isComplete: result.isComplete,
      progress: Math.round((result.receivedChunks / result.totalChunks) * 100),
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
