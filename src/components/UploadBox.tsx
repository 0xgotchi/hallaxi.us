"use client";

import { Check, Clock, Copy, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FadeInUp } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AllowedDomain, allowedDomains } from "@/config/domain";
import {
  CHUNK_SIZE,
  accept as defaultAccept,
  formatBytes,
  validateFile,
} from "@/config/upload";
import { useUploadProgress } from "@/hooks/useUploadProgress";
import { hallaxiusClient } from "@/lib/client";
import { generateSnowflakeId } from "@/lib/utils";

export type UploadBoxProps = {
  accept?: string;
  onFilesSelected?: (files: FileList) => void;
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replace(/\s+/g, "_");

export function UploadBox({ accept, onFilesSelected }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleText, setTitleText] = useState("Click here to select a file");
  const [fileInfo, setFileInfo] = useState("Maximum file size: 500MB");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [expiresOption, setExpiresOption] = useState("7d");
  const [copied, setCopied] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<AllowedDomain>(
    allowedDomains[0],
  );
  const [currentFileId, setCurrentFileId] = useState<string>("");
  const [currentFileSize, setCurrentFileSize] = useState<number>(0);

  const effectiveAccept = accept ?? defaultAccept;

  const {
    progress,
    isComplete,
    error: progressError,
    receivedChunks,
    totalChunks,
  } = useUploadProgress(currentFileId, isUploading && currentFileId !== "");

  const progressAnimationRef = useRef<number | null>(null);
  const [animatedProgress, setAnimatedProgress] = useState<number>(0);

  useEffect(() => {
    if (progressAnimationRef.current)
      cancelAnimationFrame(progressAnimationRef.current);

    const animateProgress = () => {
      setAnimatedProgress((current) => {
        if (Math.abs(current - progress) < 0.5) return progress;
        const diff = progress - current;
        const step = diff * 0.08;
        return Math.min(100, Math.max(0, current + step));
      });

      if (Math.abs(animatedProgress - progress) > 0.5) {
        progressAnimationRef.current = requestAnimationFrame(animateProgress);
      }
    };

    if (Math.abs(animatedProgress - progress) > 0.5) {
      progressAnimationRef.current = requestAnimationFrame(animateProgress);
    }

    return () => {
      if (progressAnimationRef.current)
        cancelAnimationFrame(progressAnimationRef.current);
    };
  }, [progress, animatedProgress]);

  const handleClick = () => inputRef.current?.click();

  const resetUploadState = () => {
    setTitleText("Click here to select a file");
    setFileInfo("Maximum file size: 500MB");
    setError(null);
    setCurrentFileId("");
    setCurrentFileSize(0);
    setIsUploading(false);
    setAnimatedProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const resetAllState = () => {
    resetUploadState();
    setFinalUrl(null);
  };

  useEffect(() => {
    if (isComplete && currentFileId && isUploading) handleUploadComplete();
  }, [isComplete, currentFileId, isUploading]);

  const handleUploadComplete = async () => {
    try {
      const response = await fetch("/api/upload/reassemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: currentFileId,
          expiresField: expiresOption,
          submittedDomain: selectedDomain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Finalize error ${response.status}`);
      }

      const data = await response.json();
      if (data && data.publicUrl) {
        setFinalUrl(data.publicUrl);
        toast.success("Upload completed successfully.");
        resetUploadState();
        setIsUploading(false);

        await hallaxiusClient.reportComplete(currentFileId, data);
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Finalize failed";
      setError(msg);

      await hallaxiusClient.reportError(currentFileId, msg);

      toast.error(msg);
      setIsUploading(false);
    }
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      resetAllState();
      return;
    }

    const originalFile = files[0];
    const sanitizedFileName = sanitizeFileName(originalFile.name);
    let fileToUpload = originalFile;

    if (sanitizedFileName !== originalFile.name) {
      fileToUpload = new File([originalFile], sanitizedFileName, {
        type: originalFile.type,
        lastModified: originalFile.lastModified,
      });
    }

    const { valid, error: err } = validateFile(fileToUpload);
    if (!valid) {
      const msg = err ?? "Invalid file.";
      setError(msg);
      toast.error(msg);
      resetAllState();
      return;
    }

    setError(null);
    setTitleText(sanitizedFileName);
    setFileInfo(formatBytes(fileToUpload.size));
    setCurrentFileSize(fileToUpload.size);
    setFinalUrl(null);
    setAnimatedProgress(0);
    onFilesSelected?.(files);
    void uploadFile(fileToUpload);
  };

  const uploadChunk = async (
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    fileId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
  ): Promise<boolean> => {
    try {
      const chunkFormData = new FormData();
      chunkFormData.append("chunk", chunk);
      chunkFormData.append("chunkIndex", chunkIndex.toString());
      chunkFormData.append("totalChunks", totalChunks.toString());
      chunkFormData.append("fileId", fileId);
      chunkFormData.append("fileName", fileName);
      chunkFormData.append("fileType", fileType);
      chunkFormData.append("fileSize", fileSize.toString());

      const response = await fetch("/api/upload/chunk", {
        method: "POST",
        body: chunkFormData,
      });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      const data = await response.json();
      if (data.success) {
        await hallaxiusClient.reportProgress({
          fileId,
          progress: data.progress,
          receivedChunks: data.receivedChunks,
          totalChunks: data.totalChunks,
          isComplete: data.isComplete,
        });

        return true;
      } else {
        throw new Error(`Chunk upload failed: ${data.error}`);
      }
    } catch (error) {
      return false;
    }
  };

  const uploadFileInChunks = async (
    file: File,
    fileId: string,
    totalChunks: number,
  ) => {
    const failedChunks: number[] = [];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const success = await uploadChunk(
        chunk,
        chunkIndex,
        totalChunks,
        fileId,
        file.name,
        file.type,
        file.size,
      );

      if (!success) {
        failedChunks.push(chunkIndex);
      }
    }

    if (failedChunks.length > 0) {
      throw new Error(
        `Failed to upload ${failedChunks.length} chunks: ${failedChunks.slice(0, 10).join(", ")}${failedChunks.length > 10 ? "..." : ""}`,
      );
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setAnimatedProgress(0);

      const fileId = generateSnowflakeId();
      setCurrentFileId(fileId);

      if (file.size > 4 * 1024 * 1024) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        await uploadFileInChunks(file, fileId, totalChunks);
      } else {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("expires", expiresOption);
        formData.append("domain", selectedDomain);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const result = await response.json();
        if (result && result.publicUrl) {
          setFinalUrl(result.publicUrl);
          toast.success("Upload completed successfully.");
          resetUploadState();
          setIsUploading(false);

          await hallaxiusClient.reportComplete(fileId, result);
        }
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);

      if (currentFileId) {
        await hallaxiusClient.reportError(currentFileId, msg);
      }

      toast.error(msg);
      setIsUploading(false);
    }
  };

  const getChunkText = () => {
    if (receivedChunks === totalChunks && totalChunks > 0) {
      return "Processing";
    }
    return `${receivedChunks} of ${totalChunks} chunks`;
  };

  const showProgressBar = isUploading && currentFileSize > 5 * 1024 * 1024;

  return (
    <div className="w-full max-w-2xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={effectiveAccept}
        onChange={handleChange}
      />

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col w-full md:w-auto">
          <div className="flex items-center gap-2 text-sm text-neutral-200/60 mb-2">
            <Clock className="h-4 w-4" />
            <span>Expires</span>
          </div>
          <Tabs
            defaultValue="7d"
            value={expiresOption}
            onValueChange={setExpiresOption}
            className="w-full max-w-[400px]"
          >
            <TabsList className="w-full">
              <TabsTrigger value="1h" className="flex-1">
                1h
              </TabsTrigger>
              <TabsTrigger value="1d" className="flex-1">
                1d
              </TabsTrigger>
              <TabsTrigger value="7d" className="flex-1">
                7d
              </TabsTrigger>
              <TabsTrigger value="30d" className="flex-1">
                30d
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col w-full md:w-auto">
          <div className="flex items-center gap-2 text-sm text-neutral-200/60 mb-2">
            <Globe className="h-4 w-4" />
            <span>Domain</span>
          </div>
          <Select
            value={selectedDomain}
            onValueChange={(v) => setSelectedDomain(v as AllowedDomain)}
          >
            <SelectTrigger className="w-full sm:w-48 md:w-64">
              <SelectValue placeholder="Select domain" />
            </SelectTrigger>
            <SelectContent>
              {allowedDomains.map((domain) => (
                <SelectItem key={domain} value={domain}>
                  {domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="w-full max-w-full overflow-hidden">
        <Button
          type="button"
          onClick={handleClick}
          disabled={isUploading}
          aria-label="Select file to upload"
          className={`w-full border-2 border-dashed border-primary/20 rounded-2xl p-16 sm:p-20 md:p-24 text-center cursor-pointer select-none bg-transparent duration-300 hover:bg-primary-foreground ${isUploading ? "opacity-60 cursor-not-allowed" : "hover:border-neutral-200/25"}`}
        >
          <div className="flex flex-col items-center gap-3 w-full">
            <span className="text-base sm:text-lg md:text-xl font-medium text-neutral-200/80 max-w-full line-clamp-2 wrap-break-word px-2">
              {titleText}
            </span>
            <span className="text-sm sm:text-base text-neutral-200/60">
              {fileInfo}
            </span>
            {error && (
              <span className="text-sm text-red-600 text-center max-w-full wrap-break-word px-2">
                {error}
              </span>
            )}
          </div>
        </Button>
      </div>

      {showProgressBar && (
        <div className="mt-6 w-full max-w-full overflow-hidden">
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 text-sm text-neutral-200/40 min-w-0 flex-1">
              {totalChunks > 0 && (
                <span className="text-xs sm:text-sm wrap-break-word truncate">
                  {getChunkText()}
                </span>
              )}
            </div>
            <span className="text-xs sm:text-sm text-neutral-200/40 shrink-0">
              {Math.round(animatedProgress)}%
            </span>
          </div>
          <div className="w-full max-w-full">
            <Progress value={animatedProgress} className="h-2 w-full" />
          </div>
          {progressError && (
            <div className="text-xs sm:text-sm text-amber-500 mt-1 wrap-break-word max-w-full">
              WebSocket error: {progressError}
            </div>
          )}
        </div>
      )}

      {finalUrl && !isUploading && (
        <div className="mt-6 w-full max-w-full overflow-hidden">
          <FadeInUp>
            <div className="flex flex-col sm:flex-row items-center gap-2 select-none w-full">
              <Input
                title={finalUrl}
                aria-label="File URL"
                readOnly
                value={finalUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="font-mono text-xs sm:text-sm select-none w-full wrap-break-word"
              />
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(finalUrl);
                    setCopied(true);
                    toast.success("Link copied.");
                    setTimeout(() => setCopied(false), 1500);
                  } catch {
                    window.prompt("Copy the link:", finalUrl);
                    setCopied(true);
                    toast.success("Link copied.");
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
                className="h-10 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border px-4 sm:px-3"
                aria-label={copied ? "Copied" : "Copy URL"}
                title={copied ? "Copied" : "Copy URL"}
                size="default"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span className="sm:hidden">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
          </FadeInUp>
        </div>
      )}
    </div>
  );
}

export default UploadBox;
