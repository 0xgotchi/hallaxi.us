"use client";

import { Check, Clock, Copy, Globe } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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

export type UploadBoxProps = {
  accept?: string;
  onFilesSelected?: (files: FileList) => void;
};

const CHUNK_SIZE = 4 * 1024 * 1024;

const sanitizeFileName = (fileName: string): string => {
  return fileName.replace(/\s+/g, "_");
};

export function UploadBox({ accept, onFilesSelected }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleText, setTitleText] = useState("Click here to select a file");
  const [fileInfo, setFileInfo] = useState("Maximum file size: 500MB");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [expiresOption, setExpiresOption] = useState("7d");
  const [copied, setCopied] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<AllowedDomain>(
    allowedDomains[0],
  );
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [currentSessionId, setCurrentSessionId] = useState<string>("");

  const { saveSession, getSession } = useUploadSession();
  const effectiveAccept = accept ?? defaultAccept;
  const channelName = currentSessionId ? `upload-${currentSessionId}` : null;
  const { channel } = usePusherChannel(channelName);

  const handleClick = () => inputRef.current?.click();

  const resetUploadState = () => {
    setTitleText("Click here to select a file");
    setFileInfo("Maximum file size: 500MB");
    setError(null);
    setProgress(0);
    setUploadStatus("");
    setCurrentSessionId("");
    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const resetAllState = () => {
    resetUploadState();
    setFinalUrl(null);
  };

  useEffect(() => {
    if (!currentSessionId || !isUploading) return;

    let pollCount = 0;
    const maxPolls = 180;

    const pollInterval = setInterval(async () => {
      pollCount++;

      if (pollCount >= maxPolls) {
        setUploadStatus("Upload timeout");
        setIsUploading(false);
        toast.error("Upload took too long, please try again");
        clearInterval(pollInterval);
        return;
      }

      try {
        const response = await fetch(
          `/api/upload?sessionId=${currentSessionId}`,
        );
        if (!response.ok) return;

        const data = await response.json();

        if (data.status === "completed" && data.result) {
          setFinalUrl(data.result.publicUrl);
          setProgress(100);
          setUploadStatus("Completed");
          setIsUploading(false);
          toast.success("Upload completed successfully.");
          clearInterval(pollInterval);

          setTimeout(() => {
            resetUploadState();
          });
        } else if (data.status === "failed") {
          setUploadStatus("Upload failed");
          setIsUploading(false);
          toast.error(data.error || "Upload failed");
          clearInterval(pollInterval);
        } else if (data.progress !== undefined) {
          if (data.progress > progress) {
            setProgress(data.progress);
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [currentSessionId, isUploading, progress]);

  useEffect(() => {
    if (!channel) return;

    const handleProgress = (data: any) => {
      const newProgress = data.progress || 0;
      setProgress(newProgress);

      if (newProgress === -1) {
        setUploadStatus("Upload failed");
        setIsUploading(false);
        toast.error("Upload failed");
      }
    };

    const handleResult = (data: any) => {
      setFinalUrl(data.publicUrl);
      setProgress(100);
      setUploadStatus("Completed");
      setIsUploading(false);
      toast.success("Upload completed successfully.");

      setTimeout(() => {
        resetUploadState();
      });
    };

    const handleError = (data: any) => {
      setUploadStatus("Upload failed");
      setIsUploading(false);
      toast.error(data.error);
    };

    channel.bind("progress", handleProgress);
    channel.bind("result", handleResult);
    channel.bind("error", handleError);

    return () => {
      channel.unbind("progress", handleProgress);
      channel.unbind("result", handleResult);
      channel.unbind("error", handleError);
    };
  }, [channel]);

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
    setUploadStatus("");
    setFinalUrl(null);

    onFilesSelected?.(files);
    void uploadFile(fileToUpload);
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

      const chunkFormData = new FormData();
      chunkFormData.append("file", chunk);
      chunkFormData.append("chunkIndex", chunkIndex.toString());
      chunkFormData.append("totalChunks", totalChunks.toString());
      chunkFormData.append("fileId", fileId);
      chunkFormData.append("fileName", file.name);
      chunkFormData.append("fileType", file.type);
      chunkFormData.append("fileSize", file.size.toString());
      chunkFormData.append("expires", expiresOption);
      chunkFormData.append("domain", selectedDomain);

      try {
        const response = await fetch("/api/upload", {
          method: "POST",
          body: chunkFormData,
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        const chunkProgress = Math.round(((chunkIndex + 1) / totalChunks) * 90);
        setProgress(chunkProgress);
      } catch (error) {
        console.error(`Chunk ${chunkIndex} upload failed:`, error);
        failedChunks.push(chunkIndex);

        try {
          const retryResponse = await fetch("/api/upload", {
            method: "POST",
            body: chunkFormData,
          });

          if (!retryResponse.ok) {
            throw new Error(`Retry failed for chunk ${chunkIndex}`);
          }

          failedChunks.splice(failedChunks.indexOf(chunkIndex), 1);
        } catch (retryError) {
          throw new Error(`Failed to upload chunk ${chunkIndex} after retry`);
        }
      }
    }

    if (failedChunks.length > 0) {
      throw new Error(`Failed to upload chunks: ${failedChunks.join(", ")}`);
    }

    setProgress(95);

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
      setUploadStatus("");

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

        result = await uploadFileInChunks(file, fileId, totalChunks);
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

        const data = await response.json();
        result = data.result;

        setProgress(100);
      }

      setFinalUrl(result.publicUrl);
      setProgress(100);

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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });

      toast.success("Upload completed successfully.");

      setTimeout(() => {
        resetUploadState();
      });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      setUploadStatus("");
      toast.error(msg);
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

      <div className="mt-6">
        {(isUploading || finalUrl) && (
          <div className="flex flex-col gap-3">
            {isUploading && (
              <div className="relative pt-5">
                <Progress value={progress} className="h-2 bg-neutral-800" />
                <span className="absolute top-0 right-0 text-sm text-neutral-200/60">
                  {progress}%
                </span>
              </div>
            )}

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
        )}
      </div>
    </div>
  );
}

export default UploadBox;
