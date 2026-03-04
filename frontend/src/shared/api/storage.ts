import { apiFetch } from "./http";
import { API_PATHS } from "./endpoints";

export type StorageUsage = {
  usedBytes: number;
  reservedBytes: number;
  quotaBytes: number;
  effectiveUsedBytes: number;
};

function withPatientId(path: string, patientId?: string | null): string {
  const p = typeof patientId === "string" ? patientId.trim() : "";
  if (!p) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}patientId=${encodeURIComponent(p)}`;
}

export async function presignDriveUpload(params: {
  filename: string;
  contentType: string;
  sizeBytes: number;
  patientId?: string | null;
}): Promise<{
  url: string;
  key: string;
  expiresInSeconds: number;
  usage?: StorageUsage;
  warning?: "soft_over" | null;
  reservationExpiresAt?: string;
}> {
  const path = params.patientId
    ? withPatientId(API_PATHS.caregiverStoragePresign, params.patientId)
    : API_PATHS.meStoragePresign;

  const res = await apiFetch<{
    ok: true;
    url: string;
    key: string;
    bucket: string;
    expiresInSeconds: number;
    usage?: StorageUsage;
    warning?: "soft_over" | null;
    reservationExpiresAt?: string;
  }>(path, {
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

export async function confirmDriveUpload(params: {
  key: string;
  patientId?: string | null;
}): Promise<{
  usage: StorageUsage;
  warning: "soft_over" | null;
  object: { key: string; sizeBytes: number; etag: string | null };
}> {
  const path = params.patientId
    ? withPatientId(API_PATHS.caregiverStorageConfirm, params.patientId)
    : API_PATHS.meStorageConfirm;

  const res = await apiFetch<{
    ok: true;
    object: { key: string; sizeBytes: number; etag: string | null };
    usage: StorageUsage;
    warning: "soft_over" | null;
  }>(path, {
    method: "POST",
    body: JSON.stringify({ key: params.key }),
  });

  return { usage: res.usage, warning: res.warning, object: res.object };
}
