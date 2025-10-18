import { S3Client } from "@aws-sdk/client-s3";

export function getR2Client() {
  const region = "auto";

  const accountId = process.env.R2_ACCOUNT_ID;
  let endpoint = process.env.R2_S3_ENDPOINT;
  if (!endpoint || endpoint.includes("${")) {
    if (!accountId) {
      throw new Error(
        "R2_ACCOUNT_ID not set in .env and R2_S3_ENDPOINT is invalid",
      );
    }
    endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials: set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY in .env",
    );
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export type R2Client = ReturnType<typeof getR2Client>;
