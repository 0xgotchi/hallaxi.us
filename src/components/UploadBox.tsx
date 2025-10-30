"use client";

import { Check, Clock, Copy, Globe } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeInUp } from "@/components/AnimatedPage";
import { toast } from "sonner";
import {
  accept as defaultAccept,
  formatBytes,
  validateFile,
} from "@/config/upload";
import { allowedDomains, AllowedDomain } from "@/config/domain";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { usePusherChannel } from "@/hooks/usePusherChannel";
import { useUploadSession } from "@/hooks/useUploadSession";
import { Progress } from "@/components/ui/progress";

export type UploadBoxProps = {
  accept?: string;
  onFilesSelected?: (files: FileList) => void;
};

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_RETRIES = 5;
const RETRY_DELAY = 1000;
const CONCURRENT_UPLOADS = 2;

const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/\s+/g, "_");
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [uploadedChunks, setUploadedChunks] = useState<number>(0);
  const [totalChunks, setTotalChunks] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [targetProgress, setTargetProgress] = useState<number>(0);
  const progressAnimationRef = useRef<number | null>(null);

  const { saveSession } = useUploadSession();
  const effectiveAccept = accept ?? defaultAccept;
  const channelName = currentSessionId ? `upload-${currentSessionId}` : null;
  const { channel } = usePusherChannel(channelName);

  // Progress animation effect
  useEffect(() => {
    if (progressAnimationRef.current) {
      cancelAnimationFrame(progressAnimationRef.current);
    }

    const animateProgress = () => {
      setProgress((current) => {
        if (Math.abs(current - targetProgress) < 0.5) {
          return targetProgress;
        }
        
        // Suave easing function para animação fluida
        const diff = targetProgress - current;
        const step = diff * 0.08; // Progressão suave de ~1%
        
        return Math.min(100, Math.max(0, current + step));
      });

      if (Math.abs(progress - targetProgress) > 0.5) {
        progressAnimationRef.current = requestAnimationFrame(animateProgress);
      }
    };

    if (Math.abs(progress - targetProgress) > 0.5) {
      progressAnimationRef.current = requestAnimationFrame(animateProgress);
    }

    return () => {
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
    };
  }, [targetProgress, progress]);

  const handleClick = () => inputRef.current?.click();

  const resetUploadState = () => {
    setTitleText("Click here to select a file");
    setFileInfo("Maximum file size: 500MB");
    setError(null);
    setCurrentSessionId("");
    setIsUploading(false);
    setUploadedChunks(0);
    setTotalChunks(0);
    setProgress(0);
    setTargetProgress(0);
    
    if (inputRef.current) inputRef.current.value = "";
  };

  const resetAllState = () => {
    resetUploadState();
    setFinalUrl(null);
  };

  useEffect(() => {
    if (!channel) return;

    const handleResult = (data: any) => {
      setFinalUrl(data.publicUrl);
      setIsUploading(false);
      setTargetProgress(100);
      
      // Reseta imediatamente quando chegar a 100%
      resetUploadState();

      toast.success("Upload completed successfully.");

      saveSession({
        id: currentSessionId,
        status: "completed",
        progress: 100,
        filename: data.filename,
        fileType: data.type,
        fileSize: data.size,
        expiresField: expiresOption,
        domain: selectedDomain,
        result: data,
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    };

    const handleError = (data: any) => {
      setIsUploading(false);
      setTargetProgress(0);
      toast.error(data.error || "Upload failed");

      saveSession({
        id: currentSessionId,
        status: "failed",
        progress: 0,
        filename:
          titleText !== "Click here to select a file" ? titleText : "Unknown",
        fileType: "unknown",
        fileSize: 0,
        expiresField: expiresOption,
        domain: selectedDomain,
        error: data.error,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    };

    channel.bind("result", handleResult);
    channel.bind("error", handleError);

    return () => {
      channel.unbind("result", handleResult);
      channel.unbind("error", handleError);
    };
  }, [
    channel,
    currentSessionId,
    expiresOption,
    selectedDomain,
    titleText,
    saveSession,
  ]);

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
    setFinalUrl(null);
    setProgress(0);
    setTargetProgress(0);

    onFilesSelected?.(files);
    void uploadFile(fileToUpload);
  };

  const updateProgress = (uploaded: number, total: number) => {
    const newProgress = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    setTargetProgress(newProgress);
  };

  const uploadChunkWithRetry = async (
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    fileId: string,
    fileName: string,
    fileType: string,
    fileSize: number,
  ): Promise<boolean> => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const chunkFormData = new FormData();
        chunkFormData.append("file", chunk);
        chunkFormData.append("chunkIndex", chunkIndex.toString());
        chunkFormData.append("totalChunks", totalChunks.toString());
        chunkFormData.append("fileId", fileId);
        chunkFormData.append("fileName", fileName);
        chunkFormData.append("fileType", fileType);
        chunkFormData.append("fileSize", fileSize.toString());
        chunkFormData.append("expires", expiresOption);
        chunkFormData.append("domain", selectedDomain);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: chunkFormData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
          return true;
        } else {
          throw new Error(`Chunk upload failed: ${data.error}`);
        }
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          return false;
        }

        await delay(RETRY_DELAY * attempt);
      }
    }
    return false;
  };

  const uploadFileInChunks = async (
    file: File,
    fileId: string,
    totalChunks: number,
  ) => {
    const failedChunks: number[] = [];
    let uploadedCount = 0;

    setTotalChunks(totalChunks);
    setUploadedChunks(0);
    setTargetProgress(0);

    const chunksToUpload = Array.from({ length: totalChunks }, (_, i) => i);

    while (chunksToUpload.length > 0) {
      const currentBatch = chunksToUpload.splice(0, CONCURRENT_UPLOADS);

      const uploadPromises = currentBatch.map(async (chunkIndex) => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const success = await uploadChunkWithRetry(
          chunk,
          chunkIndex,
          totalChunks,
          fileId,
          file.name,
          file.type,
          file.size,
        );

        if (success) {
          uploadedCount++;
          setUploadedChunks(uploadedCount);
          updateProgress(uploadedCount, totalChunks);
        } else {
          failedChunks.push(chunkIndex);
        }
      });

      await Promise.all(uploadPromises);

      if (chunksToUpload.length > 0) {
        await delay(100);
      }
    }

    if (failedChunks.length > 0) {
      throw new Error(
        `Failed to upload ${failedChunks.length} chunks: ${failedChunks.slice(0, 10).join(", ")}${failedChunks.length > 10 ? "..." : ""}`,
      );
    }

    const finalizeFormData = new FormData();
    finalizeFormData.append("finalize", "true");
    finalizeFormData.append("fileId", fileId);
    finalizeFormData.append("fileName", file.name);
    finalizeFormData.append("fileType", file.type);
    finalizeFormData.append("fileSize", file.size.toString());
    finalizeFormData.append("expires", expiresOption);
    finalizeFormData.append("domain", selectedDomain);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: finalizeFormData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Finalize error ${response.status}`);
    }

    const data = await response.json();
    return data.result;
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setProgress(0);
      setTargetProgress(0);

      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setCurrentSessionId(sessionId);

      saveSession({
        id: sessionId,
        status: "processing",
        progress: 0,
        filename: file.name,
        fileType: file.type,
        fileSize: file.size,
        expiresField: expiresOption,
        domain: selectedDomain,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      let result;

      if (file.size > 4 * 1024 * 1024) {
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const fileId =
          Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

        // Progresso inicial para uploads chunked
        setTargetProgress(5);
        
        result = await uploadFileInChunks(file, fileId, totalChunks);
      } else {
        // Para arquivos pequenos, progresso direto
        setTargetProgress(50);
        
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

        // Progresso final para arquivos pequenos
        setTargetProgress(100);

        const data = await response.json();
        result = data.result;
      }

      if (result && result.publicUrl) {
        setFinalUrl(result.publicUrl);
        setIsUploading(false);

        saveSession({
          id: sessionId,
          status: "completed",
          progress: 100,
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
          expiresField: expiresOption,
          domain: selectedDomain,
          result: result,
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });

        toast.success("Upload completed successfully.");
        resetUploadState();
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      toast.error(msg);
      setIsUploading(false);
      setTargetProgress(0);
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

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-200/60 mb-2">
            <Clock className="h-4 w-4" />
            <span>Expires</span>
          </div>
          <Tabs
            defaultValue="7d"
            value={expiresOption}
            onValueChange={setExpiresOption}
          >
            <TabsList>
              <TabsTrigger value="1h">1h</TabsTrigger>
              <TabsTrigger value="1d">1d</TabsTrigger>
              <TabsTrigger value="7d">7d</TabsTrigger>
              <TabsTrigger value="30d">30d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs md:text-sm text-neutral-200/60 mb-2">
            <Globe className="h-4 w-4" />
            <span>Domain</span>
          </div>
          <Select
            value={selectedDomain}
            onValueChange={(v) => setSelectedDomain(v as AllowedDomain)}
          >
            <SelectTrigger className="w-64">
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

      <Button
        type="button"
        onClick={handleClick}
        disabled={isUploading}
        aria-label="Select file to upload"
        className={`w-full border-2 border-dashed border-primary/20 rounded-2xl p-20 md:p-24 text-center cursor-pointer select-none bg-transparent duration-300 hover:bg-primary-foreground ${isUploading ? "opacity-60 cursor-not-allowed" : "hover:border-neutral-200/25"}`}
      >
        <div className="flex flex-col items-center gap-2">
          <span className="text-lg md:text-xl font-medium text-neutral-200/80">
            {titleText}
          </span>
          <span className="text-sm md:text-base text-neutral-200/60">
            {fileInfo}
          </span>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </Button>

      {/* Progress Bar abaixo da upload zone com mesma largura */}
      {isUploading && (
        <div className="mt-6 w-full">
          <Progress value={progress} className="h-2 w-full" />
          <div className="flex justify-between text-xs text-neutral-200/40 mt-2">
            <span>{Math.round(progress)}%</span>
            {totalChunks > 0 && (
              <span>
                {uploadedChunks} of {totalChunks} chunks
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-6">
        {finalUrl && (
          <FadeInUp>
            <div className="flex items-center gap-2 select-none mt-4">
              <Input
                title={finalUrl}
                aria-label="File URL"
                disabled
                value={finalUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="relative">
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
                  className="h-10 w-10 inline-flex items-center justify-center rounded-lg border"
                  aria-label={copied ? "Copied" : "Copy URL"}
                  title={copied ? "Copied" : "Copy URL"}
                  size="icon"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
            </div>
          </FadeInUp>
        )}
      </div>
    </div>
  );
}

export default UploadBox;