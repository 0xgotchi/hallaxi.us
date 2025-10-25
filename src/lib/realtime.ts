import { pusherServer } from "./pusher/server";
import { withRedis } from "./redis";

export async function reportProgress(sessionId: string, progress: number) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "progress", {
      progress,
      timestamp: Date.now(),
    });
  } catch (pusherError) {
    console.error("Pusher failed:", pusherError);
  }

  await withRedis(async (redis) => {
    await redis.setEx(
      `upload:progress:${sessionId}`,
      3600,
      progress.toString(),
    );
  });
}

export async function sendResult(sessionId: string, result: any) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "result", result);
  } catch (error) {
    console.error("Pusher result failed:", error);
  }

  await withRedis(async (redis) => {
    await redis.setEx(
      `upload:result:${sessionId}`,
      3600,
      JSON.stringify(result),
    );
  });
}

export async function sendError(sessionId: string, error: string) {
  try {
    await pusherServer.trigger(`upload-${sessionId}`, "error", { error });
  } catch (pusherError) {
    console.error("Pusher error failed:", pusherError);
  }

  await withRedis(async (redis) => {
    await redis.setEx(
      `upload:result:${sessionId}`,
      3600,
      JSON.stringify({ error }),
    );
  });
}

export async function getLastProgress(sessionId: string): Promise<number> {
  return await withRedis(async (redis) => {
    const progress = await redis.get(`upload:progress:${sessionId}`);
    return progress ? parseInt(progress) : 0;
  });
}

export async function getResult(sessionId: string): Promise<any> {
  return await withRedis(async (redis) => {
    const result = await redis.get(`upload:result:${sessionId}`);
    return result ? JSON.parse(result) : null;
  });
}

export async function cleanupSession(sessionId: string) {
  await withRedis(async (redis) => {
    await redis.del(`upload:progress:${sessionId}`);
    await redis.del(`upload:result:${sessionId}`);
  });
}
