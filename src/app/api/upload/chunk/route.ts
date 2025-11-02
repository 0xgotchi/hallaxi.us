import { type NextRequest, NextResponse } from "next/server";
import { PostgresChunkStorage } from "@/lib/storage";

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

    if (chunkIndex === 0) {
      try {
        await PostgresChunkStorage.createSession({
          fileId,
          fileName: fileName.replace(/\s+/g, "_"),
          fileType: fileType || "application/octet-stream",
          fileSize,
          totalChunks,
        });
        console.log(`Session created for file ${fileId}`);
      } catch (error: any) {
        if (error.code === "P2002" || error.message?.includes("Unique constraint")) {
          console.log(`Session already exists for file ${fileId}`);
        } else {
          console.error("Session creation error:", error);
          throw error;
        }
      }
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
    const result = await PostgresChunkStorage.addChunk(
      fileId,
      chunkIndex,
      chunkBuffer,
    );

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