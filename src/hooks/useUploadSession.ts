import { useState, useEffect } from "react";

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

  return {
    sessions,
    saveSession,
    getSession,
    removeSession,
    clearCompleted,
  };
}
