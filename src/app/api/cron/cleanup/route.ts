import { NextRequest, NextResponse } from "next/server";
import { PostgresChunkStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cleanedCount = await PostgresChunkStorage.cleanupExpiredSessions(24);
    return NextResponse.json({
      success: true,
      cleanedCount,
      message: `Cleaned up ${cleanedCount} expired sessions`,
    });
  } catch (error) {
    console.error("Cleanup cron error:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
