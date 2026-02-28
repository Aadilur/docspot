import { apiFetch } from "./http";
import { API_PATHS } from "./endpoints";

export type StorageUsage = {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
  effectiveUsedBytes: number;
};

export async function presignDriveUpload(params: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{
  url: string;
  key: string;
  expiresInSeconds: number;
  usage?: StorageUsage;
  warning?: "soft_over" | null;
  reservationExpiresAt?: string;
}> {
  const res = await apiFetch<{
    ok: true;
    url: string;
    key: string;
    bucket: string;
    expiresInSeconds: number;
    usage?: StorageUsage;
    warning?: "soft_over" | null;
    reservationExpiresAt?: string;
  }>(API_PATHS.meStoragePresign, {
    method: "POST",
    body: JSON.stringify({
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
    }),
  });

  return {
    url: res.url,
    key: res.key,
    expiresInSeconds: res.expiresInSeconds,
    usage: res.usage,
    warning: res.warning,
    reservationExpiresAt: res.reservationExpiresAt,
  };
}

export async function confirmDriveUpload(params: { key: string }): Promise<{
  usage: StorageUsage;
  warning: "soft_over" | null;
  object: { key: string; sizeBytes: number; etag: string | null };
}> {
  const res = await apiFetch<{
    ok: true;
    object: { key: string; sizeBytes: number; etag: string | null };
    usage: StorageUsage;
    warning: "soft_over" | null;
  }>(API_PATHS.meStorageConfirm, {
    method: "POST",
    body: JSON.stringify({ key: params.key }),
  });

  return { usage: res.usage, warning: res.warning, object: res.object };
}
