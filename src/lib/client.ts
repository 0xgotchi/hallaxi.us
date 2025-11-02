import { getWebSocketUrl } from "./websocket";

const HALLAXIUS_SERVER_URL =
  process.env.NEXT_PUBLIC_HALLAXIUS_SERVER_URL || "http://localhost:3070";

const wsConnections = new Map<string, WebSocket>();

export const hallaxiusClient = {
  reportProgress: async (progressData: {
    fileId: string;
    progress: number;
    receivedChunks: number;
    totalChunks: number;
    isComplete: boolean;
  }) => {
    try {
      const ws = wsConnections.get(progressData.fileId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "progress",
            data: progressData,
          }),
        );
        return;
      }

      const response = await fetch(`${HALLAXIUS_SERVER_URL}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(progressData),
      });
      if (!response.ok) console.warn("Failed to report progress to server");
    } catch (error) {
      console.warn("Could not connect to progress server:", error);
    }
  },

  reportChunkAck: async (fileId: string, chunkIndex: number) => {
    try {
      const ws = wsConnections.get(fileId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "chunk_ack",
            data: { fileId, chunkIndex },
          }),
        );
        return;
      }

      const response = await fetch(`${HALLAXIUS_SERVER_URL}/chunk-ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, chunkIndex }),
      });
      if (!response.ok) console.warn("Failed to report chunk ack to server");
    } catch (error) {
      console.warn("Could not report chunk acknowledgment:", error);
    }
  },

  reportComplete: async (fileId: string, result: any) => {
    try {
      const ws = wsConnections.get(fileId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "complete",
            data: { fileId, result },
          }),
        );

        setTimeout(() => {
          if (wsConnections.has(fileId)) {
            const wsToClose = wsConnections.get(fileId);
            if (wsToClose) {
              wsToClose.close(1000, "Upload completed");
            }
            wsConnections.delete(fileId);
          }
        }, 1000);
        return;
      }

      const response = await fetch(`${HALLAXIUS_SERVER_URL}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, result }),
      });
      if (!response.ok) console.warn("Failed to report completion to server");
    } catch (error) {
      console.warn("Could not connect to completion server:", error);
    }
  },

  reportError: async (fileId: string, error: string) => {
    try {
      const ws = wsConnections.get(fileId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: { fileId, error },
          }),
        );
        return;
      }

      const response = await fetch(`${HALLAXIUS_SERVER_URL}/error`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, error }),
      });
      if (!response.ok) console.warn("Failed to report error to server");
    } catch (error) {
      console.warn("Could not connect to error server:", error);
    }
  },

  getWebSocketUrl: (fileId: string) => {
    return getWebSocketUrl(`/ws/${fileId}`);
  },

  getOrCreateWebSocket: (fileId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsConnections.has(fileId)) {
        const existingWs = wsConnections.get(fileId);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
          resolve(existingWs);
          return;
        } else {
          wsConnections.delete(fileId);
        }
      }

      try {
        const wsUrl = getWebSocketUrl(`/ws/${fileId}`);
        const ws = new WebSocket(wsUrl);

        wsConnections.set(fileId, ws);

        ws.onopen = () => {
          resolve(ws);
        };

        ws.onerror = (error) => {
          reject(error);
        };

        ws.onclose = (event) => {
          if (event.code !== 1000) {
            wsConnections.delete(fileId);
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  },

  sendWebSocketMessage: async (fileId: string, message: any) => {
    try {
      const ws = await hallaxiusClient.getOrCreateWebSocket(fileId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error(`Failed to send WebSocket message for ${fileId}:`, error);
    }
  },
};
