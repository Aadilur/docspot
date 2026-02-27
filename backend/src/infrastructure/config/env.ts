type EnvString = string | undefined;

function readEnvString(key: string): EnvString {
  const value = process.env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnvBoolean(key: string, defaultValue: boolean): boolean {
  const raw = readEnvString(key);
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type AppConfig = {
  port: number;
  databaseUrl?: string;
  s3?: S3Config;
};

export function getConfig(): AppConfig {
  const port = Number(readEnvString("PORT") ?? 3001);

  const databaseUrl = readEnvString("DATABASE_URL");

  const s3Endpoint = readEnvString("S3_ENDPOINT");
  const s3Region = readEnvString("S3_REGION") ?? "auto";
  const s3Bucket = readEnvString("S3_BUCKET");
  const s3AccessKeyId = readEnvString("S3_ACCESS_KEY_ID");
  const s3SecretAccessKey = readEnvString("S3_SECRET_ACCESS_KEY");
  const s3ForcePathStyle = readEnvBoolean("S3_FORCE_PATH_STYLE", true);

  let s3: S3Config | undefined;
  if (s3Endpoint && s3Bucket && s3AccessKeyId && s3SecretAccessKey) {
    s3 = {
      endpoint: s3Endpoint,
      region: s3Region,
      bucket: s3Bucket,
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey,
      forcePathStyle: s3ForcePathStyle,
    };
  }

  return { port, databaseUrl, s3 };
}

export function getS3MissingKeys(): string[] {
  const s3Endpoint = readEnvString("S3_ENDPOINT");
  const s3Bucket = readEnvString("S3_BUCKET");
  const s3AccessKeyId = readEnvString("S3_ACCESS_KEY_ID");
  const s3SecretAccessKey = readEnvString("S3_SECRET_ACCESS_KEY");

  const anyProvided =
    !!s3Endpoint || !!s3Bucket || !!s3AccessKeyId || !!s3SecretAccessKey;
  if (!anyProvided) return [];

  const missingKeys: string[] = [];
  if (!s3Endpoint) missingKeys.push("S3_ENDPOINT");
  if (!s3Bucket) missingKeys.push("S3_BUCKET");
  if (!s3AccessKeyId) missingKeys.push("S3_ACCESS_KEY_ID");
  if (!s3SecretAccessKey) missingKeys.push("S3_SECRET_ACCESS_KEY");
  return missingKeys;
}
