"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
};

type ToastContextValue = {
  show: (message: string, type?: ToastType, duration?: number) => string;
  success: (message: string, duration?: number) => string;
  error: (message: string, duration?: number) => string;
  info: (message: string, duration?: number) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const MAX_TOASTS = 3;

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = "info", duration = 2000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: ToastItem = { id, message, type, duration };
      setToasts((prev) => {
        const next = [...prev, toast];
        if (next.length > MAX_TOASTS) {
          return next.slice(next.length - MAX_TOASTS);
        }
        return next;
      });
      window.setTimeout(() => remove(id), duration);
      return id;
    },
    [remove],
  );

  const api = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (message, duration) => show(message, "success", duration),
      error: (message, duration) => show(message, "error", duration),
      info: (message, duration) => show(message, "info", duration),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.output
              key={t.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={[
                "min-w-56 max-w-80 rounded-lg border shadow px-3 py-2 text-sm",
                "bg-white dark:bg-neutral-900",
                "text-neutral-900 dark:text-neutral-100",
                t.type === "success" && "border-emerald-400/60",
                t.type === "error" && "border-red-400/60",
                t.type === "info" &&
                  "border-neutral-300 dark:border-neutral-700",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5">
                  {t.type === "success" && (
                    <CheckCircle2 size={18} className="text-emerald-500" />
                  )}
                  {t.type === "error" && (
                    <TriangleAlert size={18} className="text-red-500" />
                  )}
                  {t.type === "info" && (
                    <Info size={18} className="text-neutral-500" />
                  )}
                </span>
                <span className="whitespace-pre-line leading-5 pr-1">
                  {t.message}
                </span>
              </div>
            </motion.output>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
