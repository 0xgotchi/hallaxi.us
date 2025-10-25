import { NextRequest, NextResponse } from "next/server";
import { getLastProgress, getResult } from "@/lib/realtime";

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    const progress = await getLastProgress(sessionId);
    const result = await getResult(sessionId);

    return NextResponse.json({
      progress,
      hasResult: !!result,
      result: result || null,
    });
  } catch (error) {
    console.error("Progress check error:", error);
    return NextResponse.json(
      { error: "Failed to check progress" },
      { status: 500 },
    );
  }
}
