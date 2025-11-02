import { useEffect, useState } from "react";

export interface UploadSession {
  id: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  filename: string;
  fileType: string;
  fileSize: number;
  expiresField: string;
  domain: string;
  error?: string;
  result?: any;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  fileId?: string;
}

export function useUploadSession() {
  const [sessions, setSessions] = useState<UploadSession[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("uploadSessions");
    if (stored) {
      setSessions(JSON.parse(stored));
    }
  }, []);

  const saveSession = (session: UploadSession) => {
    const updated = sessions.filter((s) => s.id !== session.id);
    updated.push(session);
    setSessions(updated);
    localStorage.setItem("uploadSessions", JSON.stringify(updated));
  };

  const getSession = (id: string): UploadSession | undefined => {
    return sessions.find((s) => s.id === id);
  };

  const removeSession = (id: string) => {
    const updated = sessions.filter((s) => s.id !== id);
    setSessions(updated);
    localStorage.setItem("uploadSessions", JSON.stringify(updated));
  };

  const clearCompleted = () => {
    const active = sessions.filter((s) => s.status === "processing");
    setSessions(active);
    localStorage.setItem("uploadSessions", JSON.stringify(active));
  };

  const updateSessionProgress = (id: string, progress: number) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? { ...session, progress, updatedAt: new Date().toISOString() }
          : session,
      ),
    );
    localStorage.setItem("uploadSessions", JSON.stringify(sessions));
  };

  const updateSessionStatus = (
    id: string,
    status: UploadSession["status"],
    result?: any,
  ) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              status,
              result,
              progress: status === "completed" ? 100 : session.progress,
              completedAt:
                status === "completed"
                  ? new Date().toISOString()
                  : session.completedAt,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
    localStorage.setItem("uploadSessions", JSON.stringify(sessions));
  };

  return {
    sessions,
    saveSession,
    getSession,
    removeSession,
    clearCompleted,
    updateSessionProgress,
    updateSessionStatus,
  };
}
