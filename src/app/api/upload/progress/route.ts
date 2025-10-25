import { NextRequest, NextResponse } from "next/server";
import { withRedis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const { uploadId } = await req.json();
    
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    const progress = await withRedis(async (redis) => {
      const result = await redis.get(`upload:progress:${uploadId}`);
      return result ? parseInt(result, 10) : 0;
    });

    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Progress GET error:", error);
    return NextResponse.json({ error: "Failed to get progress" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { uploadId, progress } = await req.json();
    
    if (!uploadId || progress === undefined) {
      return NextResponse.json({ error: "uploadId and progress are required" }, { status: 400 });
    }

    await withRedis(async (redis) => {
      await redis.setEx(`upload:progress:${uploadId}`, 3600, progress.toString());
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress PUT error:", error);
    return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { uploadId } = await req.json();
    
    if (!uploadId) {
      return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    }

    await withRedis(async (redis) => {
      await redis.del(`upload:progress:${uploadId}`);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Progress DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete progress" }, { status: 500 });
  }
}