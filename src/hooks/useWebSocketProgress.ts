import { useState, useEffect, useRef } from "react";

interface WebSocketMessage {
  type: "progress" | "complete" | "error" | "chunk_ack";
  data: any;
}

const wsConnectionCache = new Map<string, WebSocket>();
const connectionSubscribers = new Map<string, number>();
const messageCallbacks = new Map<
  string,
  Set<(message: WebSocketMessage) => void>
>();

export function useWebSocketProgress(
  fileId: string | null,
  enabled: boolean = true,
) {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedChunks, setReceivedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageCallbackRef = useRef<
    ((message: WebSocketMessage) => void) | null
  >(null);

  const getOrCreateWebSocket = (fileId: string): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsConnectionCache.has(fileId)) {
        const existingWs = wsConnectionCache.get(fileId);
        if (existingWs && existingWs.readyState === WebSocket.OPEN) {
          resolve(existingWs);
          return;
        } else {
          wsConnectionCache.delete(fileId);
        }
      }

      try {
        setIsLoading(true);
        setError(null);

        const wsUrl = `ws://localhost:3070/ws/${fileId}`;
        const ws = new WebSocket(wsUrl);

        wsConnectionCache.set(fileId, ws);

        ws.onopen = () => {
          const subscribersCount = connectionSubscribers.get(fileId) || 0;
          setIsLoading(false);
          setError(null);
          resolve(ws);
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            const callbacks = messageCallbacks.get(fileId);
            if (callbacks) {
              callbacks.forEach((callback) => callback(message));
            }
          } catch (parseError) {
            console.error("Error parsing WebSocket message:", parseError);
          }
        };

        ws.onclose = (event) => {
          setIsLoading(false);

          if (event.code !== 1000 || !event.reason.includes("completed")) {
            wsConnectionCache.delete(fileId);
            messageCallbacks.delete(fileId);
          }

          const currentSubscribers = connectionSubscribers.get(fileId) || 0;
          if (
            enabled &&
            fileId &&
            event.code !== 1000 &&
            !event.reason.includes("Component unmounted") &&
            currentSubscribers > 0
          ) {
            reconnectTimeoutRef.current = setTimeout(() => {
              getOrCreateWebSocket(fileId);
            }, 2000);
          }
        };

        ws.onerror = (error) => {
          setError("WebSocket connection failed");
          setIsLoading(false);
          reject(error);
        };
      } catch (err) {
        setError("Failed to establish real-time connection");
        setIsLoading(false);
        reject(err);
      }
    });
  };

  const sendWebSocketMessage = async (
    fileId: string,
    message: WebSocketMessage,
  ) => {
    try {
      const ws = await getOrCreateWebSocket(fileId);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error(`Failed to send WebSocket message for ${fileId}:`, error);
    }
  };

  useEffect(() => {
    if (!fileId || !enabled) {
      if (fileId && connectionSubscribers.has(fileId)) {
        const currentCount = connectionSubscribers.get(fileId) || 0;
        if (currentCount > 1) {
          connectionSubscribers.set(fileId, currentCount - 1);
        } else {
          if (wsConnectionCache.has(fileId)) {
            const ws = wsConnectionCache.get(fileId);
            if (ws) {
              ws.close(1000, "No more subscribers");
            }
            wsConnectionCache.delete(fileId);
            connectionSubscribers.delete(fileId);
            messageCallbacks.delete(fileId);
          }
        }
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    const currentSubscribers = connectionSubscribers.get(fileId) || 0;
    connectionSubscribers.set(fileId, currentSubscribers + 1);

    if (!messageCallbacks.has(fileId)) {
      messageCallbacks.set(fileId, new Set());
    }

    messageCallbackRef.current = (message: WebSocketMessage) => {
      switch (message.type) {
        case "progress":
          const progressData = message.data;
          setProgress(progressData.progress);
          setReceivedChunks(progressData.receivedChunks);
          setTotalChunks(progressData.totalChunks);
          setIsComplete(progressData.isComplete);
          break;

        case "complete":
          setIsComplete(true);
          setProgress(100);
          setTimeout(() => {
            if (wsConnectionCache.has(fileId)) {
              const ws = wsConnectionCache.get(fileId);
              if (ws) {
                ws.close(1000, "Upload completed");
              }
              wsConnectionCache.delete(fileId);
              connectionSubscribers.delete(fileId);
              messageCallbacks.delete(fileId);
            }
          }, 3000);
          break;

        case "chunk_ack":
          break;

        case "error":
          const errorData = message.data;
          setError(errorData.error);
          setIsComplete(false);
          setIsLoading(false);
          break;
      }
    };

    messageCallbacks.get(fileId)!.add(messageCallbackRef.current);

    getOrCreateWebSocket(fileId);

    return () => {
      if (fileId && messageCallbackRef.current) {
        const callbacks = messageCallbacks.get(fileId);
        if (callbacks) {
          callbacks.delete(messageCallbackRef.current);
          if (callbacks.size === 0) {
            messageCallbacks.delete(fileId);
          }
        }
      }

      if (fileId && connectionSubscribers.has(fileId)) {
        const currentCount = connectionSubscribers.get(fileId) || 0;
        if (currentCount > 1) {
          connectionSubscribers.set(fileId, currentCount - 1);
        } else {
          connectionSubscribers.delete(fileId);
        }
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [fileId, enabled]);

  return {
    progress,
    isComplete,
    isLoading,
    error,
    receivedChunks,
    totalChunks,
    sendWebSocketMessage: fileId
      ? (message: WebSocketMessage) => sendWebSocketMessage(fileId, message)
      : null,
  };
}
