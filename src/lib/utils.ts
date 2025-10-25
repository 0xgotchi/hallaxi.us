import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { nanoid } from "nanoid";
import { Snowflake } from "@sapphire/snowflake";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateSlug(): string {
  return nanoid(6);
}

let snowflake: Snowflake | null = null;

function getSnowflakeInstance() {
  if (!snowflake) {
    snowflake = new Snowflake(Date.now());
  }
  return snowflake;
}

export function generateSnowflakeId(): string {
  const id = getSnowflakeInstance().generate();
  return id.toString().padStart(18, "0").slice(0, 18);
}
