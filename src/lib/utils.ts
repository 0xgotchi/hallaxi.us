import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { customAlphabet } from "nanoid";
import { createHash } from "crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const slugAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const slugGenerator = customAlphabet(slugAlphabet, 6);

export function generateSlug(): string {
  return slugGenerator();
}

export function generateSnowflakeIdFor(filename: string): string {
  const hash = createHash("sha256").update(filename).digest("base64url");
  return hash.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18).padEnd(18, "0");
}
