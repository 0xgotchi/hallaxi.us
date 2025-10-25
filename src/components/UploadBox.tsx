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

export type UploadBoxProps = {
  accept?: string;
  onFilesSelected?: (files: FileList) => void;
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
    if (!channel) return;

    const handleProgress = (data: any) => {
      const newProgress = data.progress || 0;
      setProgress(newProgress);

      if (newProgress === -1) {
        setUploadStatus("Upload failed");
        setIsUploading(false);
        toast.error("Upload failed");
      } else if (newProgress < 10) {
        setUploadStatus("Preparing upload...");
      } else if (newProgress < 100) {
        setUploadStatus(`Uploading... ${newProgress}%`);
      } else if (newProgress === 100) {
        setUploadStatus("Finalizing...");
      }
    };

    const handleResult = (data: any) => {
      setFinalUrl(data.publicUrl);
      setProgress(100);
      setUploadStatus("Upload completed!");
      setIsUploading(false);
      toast.success("Upload completed successfully.");

      setTimeout(() => {
        resetUploadState();
      }, 3000);
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

    const f = files[0];
    const { valid, error: err } = validateFile(f);
    if (!valid) {
      const msg = err ?? "Invalid file.";
      setError(msg);
      toast.error(msg);
      resetAllState();
      return;
    }

    setError(null);
    setTitleText(f.name);
    setFileInfo(formatBytes(f.size));
    setUploadStatus("Starting upload...");
    setFinalUrl(null);

    onFilesSelected?.(files);
    void uploadFile(f);
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setProgress(0);
      setUploadStatus("Starting upload...");

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

      if (data.sessionId) {
        setCurrentSessionId(data.sessionId);
        setUploadStatus("Upload started...");
      } else {
        throw new Error("No session ID received");
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      setUploadStatus("Upload failed");
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
              <>
                <div className="flex items-center justify-between text-sm text-neutral-200/60">
                  <span>{uploadStatus}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2 bg-neutral-800" />
              </>
            )}

            {finalUrl && (
              <FadeInUp>
                <div className="flex items-center gap-2 select-none mt-4">
                  <Input
                    className="flex-1 h-10 rounded-lg border border-neutral-600 text-neutral-200/80 bg-transparent px-3 text-sm"
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
