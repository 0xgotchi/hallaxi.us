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

const SNOWFLAKE_EPOCH = Date.UTC(2025, 9, 25);

let snowflake: Snowflake | null = null;

function getSnowflakeInstance(): Snowflake {
  if (!snowflake) {
    snowflake = new Snowflake(SNOWFLAKE_EPOCH);
  }
  return snowflake;
}

export function generateSnowflakeId(): string {
  const instance = getSnowflakeInstance();
  const snowflakeId = instance.generate();
  return snowflakeId.toString().padStart(18, "0").slice(0, 18);
}
