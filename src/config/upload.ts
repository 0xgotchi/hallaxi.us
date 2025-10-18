// Configurações de upload: formatos permitidos e limite de tamanho
export type UploadConstraints = {
  // Extensões permitidas (usadas no atributo `accept` do input)
  allowedExtensions: string[];
  // Tipos MIME permitidos (útil para validações no backend ou client)
  allowedMimeTypes: string[];
  // Limite máximo de tamanho por arquivo em bytes
  maxFileSizeBytes: number;
};

export const uploadConfig: UploadConstraints = {
  allowedExtensions: [
    // Imagens
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
    // Áudio
    ".mp3",
    ".wav",
    ".ogg",
    ".m4a",
    ".flac",
    ".aac",
    ".webma",
    ".opus",
    // Vídeo
    ".mp4",
    ".webm",
    ".ogv",
    ".mov",
    ".mkv",
    ".avi",
    ".m4v",
    ".ts",
    ".3gp",
    // Documentos
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
    // Imagens
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
    // Áudio
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/flac",
    "audio/aac",
    "audio/webm",
    "audio/opus",
    // Vídeo
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
    "video/x-matroska",
    "video/x-msvideo",
    "video/x-m4v",
    "video/mp2t",
    "video/3gpp",
    // Documentos
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
  maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
};

// String para o atributo `accept` (ex.: .png,.jpg,.jpeg,.webp,.pdf)
export const accept = uploadConfig.allowedExtensions.join(",");

// Dias para expiração padrão (configurável)
export const defaultExpiresDays = 7;

export function computeExpiresAt(
  from: Date = new Date(),
  days = defaultExpiresDays,
) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

// Utilitário para formatar bytes em unidade legível (B/KB/MB/GB/TB)
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

// Validação simples de arquivo (pode ser usada no client e replicada no backend)
export function validateFile(
  file: File,
  cfg: UploadConstraints = uploadConfig,
): { valid: boolean; error?: string } {
  const ext = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
  const typeOk =
    cfg.allowedMimeTypes.includes(file.type) ||
    cfg.allowedExtensions.includes(ext);
  if (!typeOk) {
    return { valid: false, error: "Formato de arquivo não permitido." };
  }
  if (file.size > cfg.maxFileSizeBytes) {
    return {
      valid: false,
      error: "Arquivo excede o tamanho máximo permitido.",
    };
  }
  return { valid: true };
}
