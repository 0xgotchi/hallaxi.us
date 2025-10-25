"use client";

import { Check, Clock, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FadeInUp } from "@/components/AnimatedPage";
import { toast } from "sonner";
import { accept as defaultAccept, formatBytes, validateFile } from "@/config/upload";
import { allowedDomains, AllowedDomain, buildPublicUrl } from "@/config/domain";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

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
  const [selectedDomain, setSelectedDomain] = useState<AllowedDomain>(allowedDomains[0]);

  const effectiveAccept = accept ?? defaultAccept;

  const handleClick = () => inputRef.current?.click();

  const resetInputOnly = () => {
    setTitleText("Click here to select a file");
    setFileInfo("Maximum file size: 500MB");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      resetInputOnly();
      return;
    }

    const f = files[0];
    const { valid, error: err } = validateFile(f);
    if (!valid) {
      const msg = err ?? "Invalid file.";
      setError(msg);
      toast.error(msg);
      resetInputOnly();
      return;
    }

    setError(null);
    setTitleText(f.name);
    setFileInfo(formatBytes(f.size));

    onFilesSelected?.(files);
    void uploadFile(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      setProgress(0);

      const form = new FormData();
      form.append("file", file);
      form.append("expires", expiresOption);
      form.append("domain", selectedDomain);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/upload");

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onreadystatechange = () => {
          if (xhr.readyState !== XMLHttpRequest.DONE) return;

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              const slug = data?.slug ?? null;
              if (!slug) throw new Error("Invalid server response");

              const link = buildPublicUrl(slug, selectedDomain);
              setFinalUrl(link);
              setProgress(100);
              toast.success("Upload completed successfully.");

              setTimeout(() => resetInputOnly());

              resolve();
            } catch (e) {
              reject(e);
            }
          } else {
            try {
              const err = JSON.parse(xhr.responseText)?.error ?? `HTTP error ${xhr.status}`;
              reject(new Error(err));
            } catch (_) {
              reject(new Error(`HTTP error ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error("Network failure during upload"));
        xhr.send(form);
      });
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : "Upload failed";
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

        <Select value={selectedDomain} onValueChange={(v) => setSelectedDomain(v as AllowedDomain)}>
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
        {isUploading ? (
          <div className="flex items-center gap-3">
            <div
              className="relative h-[9px] w-full rounded-full border border-neutral-200/20 bg-transparent overflow-hidden"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="absolute left-0 top-0 h-full bg-white transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-xs text-neutral-200/60 w-10 text-right">
              {progress}%
            </div>
          </div>
        ) : finalUrl ? (
          <FadeInUp>
            <div className="flex items-center gap-2 select-none">
              <Input
                className="flex-1 h-10 rounded-lg border border-neutral-600 text-neutral-200/80 bg-transparent px-3 text-sm"
                title={finalUrl ?? ""}
                aria-label="File URL"
                disabled
                value={finalUrl ?? ""}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="relative">
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(finalUrl ?? "");
                      setCopied(true);
                      toast.success("Link copied.");
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      window.prompt("Copy the link:", finalUrl ?? "");
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
        ) : null}
      </div>
    </div>
  );
}

export default UploadBox;
