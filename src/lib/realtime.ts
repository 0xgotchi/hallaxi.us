import { pusherServer } from "./pusher/server";

export async function reportProgress(sessionId: string, progress: number) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "progress", {
      progress,
      timestamp: Date.now(),
    });
  } catch (pusherError) {
    console.error("Pusher failed:", pusherError);
  }
}

export async function sendResult(sessionId: string, result: any) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "result", result);
  } catch (error) {
    console.error("Pusher result failed:", error);
  }
}

export async function sendError(sessionId: string, error: string) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "error", { error });
  } catch (pusherError) {
    console.error("Pusher error failed:", pusherError);
  }
}
