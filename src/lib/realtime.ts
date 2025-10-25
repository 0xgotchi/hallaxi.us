import { pusherServer } from "./pusher/server";

export async function reportProgress(sessionId: string, progress: number) {
  try {
    console.log(`Reporting progress for ${sessionId}: ${progress}%`);
    await pusherServer.trigger(`upload-${sessionId}`, "progress", {
      progress,
      timestamp: Date.now(),
    });
    console.log(`Progress reported successfully for ${sessionId}`);
  } catch (pusherError) {
    console.error("Pusher failed:", pusherError);
  }
}

export async function sendResult(sessionId: string, result: any) {
  try {
    console.log(`Sending result for ${sessionId}:`, result);
    await pusherServer.trigger(`upload-${sessionId}`, "result", result);
    console.log(`Result sent successfully for ${sessionId}`);
  } catch (error) {
    console.error("Pusher result failed:", error);
  }
}

export async function sendError(sessionId: string, error: string) {
  try {
    console.log(`Sending error for ${sessionId}:`, error);
    await pusherServer.trigger(`upload-${sessionId}`, "error", { error });
    console.log(`Error sent successfully for ${sessionId}`);
  } catch (pusherError) {
    console.error("Pusher error failed:", pusherError);
  }
}
