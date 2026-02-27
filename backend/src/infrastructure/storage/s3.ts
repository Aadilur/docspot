import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { S3Config } from "../config/env";
import { getConfig } from "../config/env";

let s3Client: S3Client | undefined;

export function getS3Client(): { client: S3Client; bucket: string } {
  if (s3Client) {
    const { s3 } = getConfig();
    if (!s3) throw new Error("S3 is not configured.");
    return { client: s3Client, bucket: s3.bucket };
  }

  const { s3 } = getConfig();
  if (!s3) {
    throw new Error(
      "S3 is not configured. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.",
    );
  }

  s3Client = createS3Client(s3);
  return { client: s3Client, bucket: s3.bucket };
}

function createS3Client(config: S3Config): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function createPresignedPutUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{
  url: string;
  key: string;
  bucket: string;
  expiresInSeconds: number;
}> {
  const { client, bucket } = getS3Client();

  const expiresInSeconds = Math.max(
    30,
    Math.min(60 * 10, params.expiresInSeconds ?? 60),
  );
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });
  return { url, key: params.key, bucket, expiresInSeconds };
}

export async function createPresignedGetUrl(params: {
  key: string;
  expiresInSeconds?: number;
}): Promise<{
  url: string;
  key: string;
  bucket: string;
  expiresInSeconds: number;
}> {
  const { client, bucket } = getS3Client();

  const expiresInSeconds = Math.max(
    30,
    Math.min(60 * 10, params.expiresInSeconds ?? 60),
  );
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: params.key,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSeconds,
  });
  return { url, key: params.key, bucket, expiresInSeconds };
}

export async function deleteObject(params: { key: string }): Promise<void> {
  const { client, bucket } = getS3Client();
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: params.key,
  });
  await client.send(command);
}
