import { type NextRequest, NextResponse } from "next/server";
import { PostgresChunkStorage } from "@/lib/storage";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 },
      );
    }

    const progress = await PostgresChunkStorage.getProgress(fileId);

    return NextResponse.json({
      fileId,
      receivedChunks: progress.receivedChunks,
      totalChunks: progress.totalChunks,
      progress: progress.progress,
      isComplete: progress.receivedChunks >= progress.totalChunks,
    });
  } catch (error) {
    console.error("Progress check error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to check progress",
      },
      { status: 500 },
    );
  }
}
