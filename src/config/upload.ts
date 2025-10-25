export type UploadConstraints = {
  allowedExtensions: string[];
  allowedMimeTypes: string[];
  maxFileSizeBytes: number;
};

export const uploadConfig: UploadConstraints = {
  allowedExtensions: [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
    ".tif",
    ".svg",
    ".avif",
    ".heic",
    ".heif",
    ".ico",
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".flac",
    ".aac",
    ".webma",
    ".opus",
    ".mp4",
    ".webm",
    ".ogv",
    ".mov",
    ".mkv",
    ".avi",
    ".m4v",
    ".ts",
    ".3gp",
    ".pdf",
    ".txt",
    ".md",
    ".rtf",
    ".doc",
    ".docx",
    ".odt",
    ".csv",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".json",
  ],
  allowedMimeTypes: [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/svg+xml",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/x-icon",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/flac",
    "audio/aac",
    "audio/webm",
    "audio/opus",
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-matroska",
    "video/x-msvideo",
    "video/x-m4v",
    "video/mp2t",
    "video/3gpp",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/rtf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/json",
  ],
  maxFileSizeBytes: 500 * 1024 * 1024,
};

export const accept = uploadConfig.allowedExtensions.join(",");
export const defaultExpiresDays = 7;

export function computeExpiresAt(
  from: Date = new Date(),
  days = defaultExpiresDays,
) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)}${units[i]}`;
}

export function validateFile(
  file: File,
  cfg: UploadConstraints = uploadConfig,
): { valid: boolean; error?: string } {
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const typeOk =
    cfg.allowedMimeTypes.includes(file.type) ||
    cfg.allowedExtensions.includes(ext);
  if (!typeOk) return { valid: false, error: "File type not allowed." };
  if (file.size > cfg.maxFileSizeBytes)
    return { valid: false, error: "File exceeds the maximum allowed size." };
  return { valid: true };
}
