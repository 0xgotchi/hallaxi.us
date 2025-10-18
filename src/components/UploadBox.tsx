"use client";

import { Check, Clock, Copy, HardDrive } from "lucide-react";
import { useRef, useState } from "react";
import { FadeInUp } from "@/components/AnimatedPage";
import { useToast } from "@/components/Toast";
import {
  accept as defaultAccept,
  formatBytes,
  validateFile,
} from "@/config/upload";

export type UploadBoxProps = {
  accept?: string;
  onFilesSelected?: (files: FileList) => void;
};

export function UploadBox({ accept, onFilesSelected }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();
  const [titleText, setTitleText] = useState<string>(
    "Click here to select a file",
  );
  const [fileInfo, setFileInfo] = useState<string>("No file selected");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const effectiveAccept = accept ?? defaultAccept;

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setTitleText("Click here to select a file");
      setFileInfo("No file selected");
      return;
    }

    const f = files[0];
    const { valid, error: err } = validateFile(f);
    if (!valid) {
      const msg = err ?? "Invalid file.";
      setError(msg);
      toast.error(msg);
      setTitleText("Click here to select a file");
      setFileInfo("No file selected");
      return;
    }

    setError(null);
    setTitleText(f.name);
    setFileInfo(formatBytes(f.size));

    onFilesSelected?.(files);

    void uploadFile(f);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setProgress(0);
      setFinalUrl(null);

      const form = new FormData();
      form.append("file", file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setProgress(pct);
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) return;
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const origin =
                typeof window !== "undefined" ? window.location.origin : "";
              const link = data?.url
                ? `${origin}${data.url}`
                : data?.publicUrl || "";
              if (!link) {
                throw new Error("Invalid server response");
              }
              setFinalUrl(link);
              setProgress(100);
              toast.success("Upload completed successfully.");
              resolve();
            } catch (e) {
              reject(e);
            }
          } else {
            try {
              const err =
                JSON.parse(xhr.responseText)?.error ??
                `HTTP error ${xhr.status}`;
              reject(new Error(err));
            } catch (_) {
              reject(new Error(`HTTP error ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network failure during upload"));

        xhr.send(form);
      });
    } catch (e: unknown) {
      const hasMessage = (v: unknown): v is { message: string } =>
        typeof v === "object" &&
        v !== null &&
        "message" in v &&
        typeof (v as Record<string, unknown>).message === "string";
      const msg =
        e instanceof Error
          ? e.message
          : hasMessage(e)
            ? e.message
            : "Upload failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={effectiveAccept}
        onChange={handleChange}
      />

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-600 dark:text-neutral-400">
          <Clock className="h-4 w-4" />
          <span>Uploaded files are automatically deleted after 7 days.</span>
        </div>
        <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-600 dark:text-neutral-400">
          <HardDrive className="h-4 w-4" />
          <span>Maximum file size: 500MB.</span>
        </div>
      </div>

      <button
        type="button"
        onClick={!isUploading ? handleClick : undefined}
        disabled={isUploading}
        className={`w-full border-2 border-dashed rounded-lg p-14 md:p-16 text-center cursor-pointer select-none
                   bg-white/60 dark:bg-black/30 backdrop-blur transition-colors
                   border-neutral-300 dark:border-neutral-700
                   ${!isUploading ? "hover:bg-neutral-100/70 dark:hover:bg-neutral-800/40" : ""}
                   ${isUploading ? "opacity-60 cursor-not-allowed pointer-events-none" : ""}`}
        aria-label="Select file to upload"
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg md:text-xl font-medium">{titleText}</span>
          <span className="text-sm md:text-base text-neutral-500 dark:text-neutral-400">
            {fileInfo}
          </span>
          {error ? (
            <span className="text-xs text-red-600 dark:text-red-400">
              {error}
            </span>
          ) : null}
        </div>
      </button>

      <div className="mt-4">
        {isUploading ? (
          <div className="flex items-center gap-3">
            <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-200/60 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400 w-10 text-right">
              {progress}%
            </div>
          </div>
        ) : finalUrl ? (
          <FadeInUp>
            <div className="flex items-center gap-2">
              <input
                className="flex-1 h-10 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 text-sm select-none cursor-text overflow-hidden truncate"
                title={finalUrl}
                aria-label="File URL (read-only)"
                readOnly
                value={finalUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(finalUrl);
                      setCopied(true);
                      toast.success("Link copied.");
                      setTimeout(() => setCopied(false), 1500);
                    } catch (_) {
                      window.prompt("Copy the link:", finalUrl);
                      setCopied(true);
                      toast.success("Link copied.");
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-200 text-black hover:bg-neutral-200/50 transition duration-300 cursor-pointer"
                  aria-label={copied ? "Copied" : "Copy URL"}
                  title={copied ? "Copied" : "Copy URL"}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          </FadeInUp>
        ) : null}
      </div>
    </div>
  );
}

export default UploadBox;
