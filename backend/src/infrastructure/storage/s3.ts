import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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

export async function deleteObjects(params: { keys: string[] }): Promise<void> {
  const { client, bucket } = getS3Client();
  const keys = params.keys.filter(Boolean);
  if (keys.length === 0) return;

  // S3 DeleteObjects supports up to 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: chunk.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

export async function headObject(params: {
  key: string;
}): Promise<{ key: string; sizeBytes: number; etag: string | null }> {
  const { client, bucket } = getS3Client();
  const res = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: params.key,
    }),
  );

  const size = typeof res.ContentLength === "number" ? res.ContentLength : 0;
  return {
    key: params.key,
    sizeBytes: Number.isFinite(size) && size >= 0 ? size : 0,
    etag: typeof res.ETag === "string" ? res.ETag : null,
  };
}

export async function getPrefixUsage(params: {
  prefix: string;
}): Promise<{ prefix: string; totalBytes: number; objectCount: number }> {
  const { client, bucket } = getS3Client();

  const prefix = params.prefix.startsWith("/")
    ? params.prefix.slice(1)
    : params.prefix;

  let totalBytes = 0;
  let objectCount = 0;
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const contents = res.Contents ?? [];
    for (const obj of contents) {
      if (typeof obj.Size === "number" && Number.isFinite(obj.Size)) {
        totalBytes += obj.Size;
      }
      objectCount += 1;
    }

    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return { prefix, totalBytes, objectCount };
}
