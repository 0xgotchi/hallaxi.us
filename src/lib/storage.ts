import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import prisma from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";

export class PostgresChunkStorage {
  static async createSession(data: {
    fileId: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    totalChunks: number;
  }): Promise<void> {
    try {
      await prisma.chunkSession.create({
        data: {
          id: data.fileId,
          fileId: data.fileId,
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          totalChunks: data.totalChunks,
        },
      });
    } catch (error: any) {
      if (error.code === "P2002") {
        return;
      }
      throw error;
    }
  }

  static async addChunk(
    fileId: string,
    chunkIndex: number,
    chunkData: Buffer,
  ): Promise<{
    receivedChunks: number;
    totalChunks: number;
    isComplete: boolean;
  }> {
    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;

    const session = await prisma.chunkSession.findUnique({
      where: { id: fileId },
    });

    if (!session) {
      throw new Error("Session not found");
    }

    const existingChunk = await prisma.chunkRecord.findUnique({
      where: {
        sessionId_chunkIndex: {
          sessionId: fileId,
          chunkIndex: chunkIndex,
        },
      },
    });

    if (!existingChunk) {
      const chunkKey = `chunks/${fileId}/${chunkIndex}`;
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chunkKey,
          Body: chunkData,
          ContentType: "application/octet-stream",
        }),
      );

      await prisma.chunkRecord.create({
        data: {
          sessionId: fileId,
          chunkIndex: chunkIndex,
        },
      });
    }

    const receivedCount = await prisma.chunkRecord.count({
      where: { sessionId: fileId },
    });

    return {
      receivedChunks: receivedCount,
      totalChunks: session.totalChunks,
      isComplete: receivedCount >= session.totalChunks,
    };
  }

  static async getChunk(fileId: string, chunkIndex: number): Promise<Buffer> {
    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;

    const chunkKey = `chunks/${fileId}/${chunkIndex}`;
    const response = await r2.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: chunkKey,
      }),
    );

    return Buffer.from(await response.Body!.transformToByteArray());
  }

  static async getAllChunks(
    fileId: string,
  ): Promise<{ chunks: Buffer[]; session: any }> {
    const [session, chunkRecords] = await Promise.all([
      prisma.chunkSession.findUnique({
        where: { id: fileId },
      }),
      prisma.chunkRecord.findMany({
        where: { sessionId: fileId },
        orderBy: { chunkIndex: "asc" },
      }),
    ]);

    if (!session) {
      throw new Error("Session not found");
    }

    const chunkPromises = chunkRecords.map((record) =>
      PostgresChunkStorage.getChunk(fileId, record.chunkIndex),
    );

    const chunks = await Promise.all(chunkPromises);

    return { chunks, session };
  }

  static async getProgress(fileId: string): Promise<{
    receivedChunks: number;
    totalChunks: number;
    progress: number;
  }> {
    const [session, receivedCount] = await Promise.all([
      prisma.chunkSession.findUnique({
        where: { id: fileId },
      }),
      prisma.chunkRecord.count({
        where: { sessionId: fileId },
      }),
    ]);

    if (!session) {
      throw new Error("Session not found");
    }

    return {
      receivedChunks: receivedCount,
      totalChunks: session.totalChunks,
      progress: Math.round((receivedCount / session.totalChunks) * 100),
    };
  }

  static async cleanup(fileId: string): Promise<void> {
    const r2 = getR2Client();
    const bucket = process.env.R2_BUCKET!;

    try {
      const chunkRecords = await prisma.chunkRecord.findMany({
        where: { sessionId: fileId },
      });

      const deletePromises = chunkRecords.map(async (record) => {
        const chunkKey = `chunks/${fileId}/${record.chunkIndex}`;
        try {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: chunkKey,
            }),
          );
        } catch (error) {
          console.warn(`Failed to delete chunk ${chunkKey}:`, error);
        }
      });

      await Promise.all(deletePromises);

      await prisma.chunkSession.delete({
        where: { id: fileId },
      });
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }

  static async cleanupExpiredSessions(
    maxAgeHours: number = 24,
  ): Promise<number> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    const expiredSessions = await prisma.chunkSession.findMany({
      where: {
        createdAt: { lt: cutoffTime },
      },
      select: { id: true },
    });

    let cleanedCount = 0;
    for (const session of expiredSessions) {
      try {
        await PostgresChunkStorage.cleanup(session.id);
        cleanedCount++;
      } catch (error) {
        console.error(`Failed to cleanup session ${session.id}:`, error);
      }
    }

    console.log(`Cleaned up ${cleanedCount} expired chunk sessions`);
    return cleanedCount;
  }
}
