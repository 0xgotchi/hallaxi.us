import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (!redisClient) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL environment variable is not set");
    }

    redisClient = createClient({
      url,
      socket: {
        connectTimeout: 60000,
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    redisClient.on("connect", () => {
      console.log("Redis Client Connected");
    });

    await redisClient.connect();
  }

  return redisClient;
}

export async function withRedis<T>(
  operation: (client: ReturnType<typeof createClient>) => Promise<T>,
): Promise<T> {
  const client = await getRedisClient();
  return await operation(client);
}
