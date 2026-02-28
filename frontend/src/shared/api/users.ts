import type { User } from "firebase/auth";

import { API_PATHS } from "./endpoints";
import { apiFetch } from "./http";

export type UserType = "free" | "paid";

export type UserRecord = {
  id: string;
  provider: string;
  providerUserId: string;
  providerAppId: string | null;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  locale: string | null;
  userType: UserType;
  subscriptionType: string | null;
  subscriptionStatus: string | null;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  storageLeftBytes: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  metadata: unknown | null;
};

export async function getMe(): Promise<UserRecord> {
  const res = await apiFetch<{ ok: true; user: UserRecord }>(API_PATHS.me);
  return res.user;
}

export async function patchMe(
  patch: Partial<{
    displayName: string | null;
    locale: string | null;
    photoKey: string | null;
  }>,
): Promise<UserRecord> {
  const res = await apiFetch<{ ok: true; user: UserRecord }>(API_PATHS.me, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return res.user;
}

export async function presignMyPhotoUpload(params: {
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ url: string; key: string; expiresInSeconds: number }> {
  const res = await apiFetch<{
    ok: true;
    url: string;
    key: string;
    bucket: string;
    expiresInSeconds: number;
  }>(API_PATHS.mePhotoPresign, {
    method: "POST",
    body: JSON.stringify({
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
    }),
  });

  return { url: res.url, key: res.key, expiresInSeconds: res.expiresInSeconds };
}

export async function confirmMyPhotoUpload(params: {
  key: string;
}): Promise<UserRecord> {
  const res = await apiFetch<{ ok: true; user: UserRecord }>(
    API_PATHS.mePhotoConfirm,
    {
      method: "POST",
      body: JSON.stringify({ key: params.key }),
    },
  );
  return res.user;
}

export async function getMyPhotoUrl(): Promise<{
  url: string;
  expiresInSeconds: number;
}> {
  const res = await apiFetch<{
    ok: true;
    url: string;
    expiresInSeconds: number;
  }>(API_PATHS.mePhotoUrl);

  return { url: res.url, expiresInSeconds: res.expiresInSeconds };
}

export async function getMyStorageUsage(params?: {
  folder?: string;
}): Promise<{ prefix: string; totalBytes: number; objectCount: number }> {
  const qs = new URLSearchParams();
  if (params?.folder) qs.set("folder", params.folder);

  const res = await apiFetch<{
    ok: true;
    prefix: string;
    totalBytes: number;
    objectCount: number;
  }>(`${API_PATHS.meStorageUsage}${qs.toString() ? `?${qs.toString()}` : ""}`);

  return {
    prefix: res.prefix,
    totalBytes: res.totalBytes,
    objectCount: res.objectCount,
  };
}

export async function upsertUser(payload: {
  provider: string;
  providerUserId: string;
  providerAppId?: string | null;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
  locale?: string | null;
  metadata?: unknown | null;
}): Promise<UserRecord> {
  const res = await apiFetch<{ ok: true; user: UserRecord }>(
    API_PATHS.usersUpsert,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.user;
}

export async function getUserByProvider(params: {
  provider: string;
  providerUserId: string;
}): Promise<UserRecord> {
  const qs = new URLSearchParams({
    provider: params.provider,
    providerUserId: params.providerUserId,
  });
  const res = await apiFetch<{ ok: true; user: UserRecord }>(
    `${API_PATHS.usersByProvider}?${qs.toString()}`,
  );
  return res.user;
}

export async function patchUser(
  id: string,
  patch: Partial<{
    photoUrl: string | null;
    photoKey: string | null;
    userType: UserType;
    subscriptionType: string | null;
    subscriptionStatus: string | null;
    storageQuotaBytes: number | null;
    storageUsedBytes: number;
  }>,
): Promise<UserRecord> {
  const res = await apiFetch<{ ok: true; user: UserRecord }>(
    API_PATHS.userById(id),
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return res.user;
}

export async function presignUserPhotoUpload(params: {
  id: string;
  filename: string;
  contentType: string;
}): Promise<{ url: string; key: string; expiresInSeconds: number }> {
  const res = await apiFetch<{
    ok: true;
    url: string;
    key: string;
    bucket: string;
    expiresInSeconds: number;
  }>(API_PATHS.userPhotoPresign(params.id), {
    method: "POST",
    body: JSON.stringify({
      filename: params.filename,
      contentType: params.contentType,
    }),
  });

  return { url: res.url, key: res.key, expiresInSeconds: res.expiresInSeconds };
}

export async function deleteUser(id: string): Promise<void> {
  await apiFetch<{ ok: true }>(API_PATHS.userById(id), {
    method: "DELETE",
  });
}

export async function listUsers(params?: {
  limit?: number;
  offset?: number;
}): Promise<UserRecord[]> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));

  const res = await apiFetch<{ ok: true; users: UserRecord[] }>(
    `${API_PATHS.users}?${qs.toString()}`,
  );
  return res.users;
}

export function firebaseUserToUpsertPayload(user: User): {
  provider: string;
  providerUserId: string;
  providerAppId: string | null;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  locale: string | null;
  metadata: unknown;
} {
  const provider = user.providerData?.[0]?.providerId || "firebase";

  return {
    provider,
    providerUserId: user.uid,
    providerAppId:
      (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) ?? null,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoUrl: user.photoURL ?? null,
    locale: (navigator.language || "").slice(0, 20) || null,
    metadata: {
      firebase: {
        uid: user.uid,
      },
    },
  };
}
