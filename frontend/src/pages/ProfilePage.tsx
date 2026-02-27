import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { API_BASE_URL, ApiError, apiFetch } from "../shared/api/http";
import {
  deleteUser,
  firebaseUserToUpsertPayload,
  getUserByProvider,
  patchUser,
  presignUserPhotoUpload,
  upsertUser,
  type UserRecord,
  type UserType,
} from "../shared/api/users";
import { useAuthState } from "../shared/firebase/useAuthState";

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = value;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function resolveApiAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `${API_BASE_URL}${pathOrUrl}`;
  return `${API_BASE_URL}/${pathOrUrl}`;
}

function withCacheBust(url: string, token: string): string {
  const safe = encodeURIComponent(token);
  return url.includes("?") ? `${url}&v=${safe}` : `${url}?v=${safe}`;
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { configured, loading, user } = useAuthState();

  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<UserRecord | null>(null);

  const [userType, setUserType] = useState<UserType>("free");
  const [subscriptionType, setSubscriptionType] = useState<string>("");
  const [storageQuotaMb, setStorageQuotaMb] = useState<string>("");

  const providerKey = useMemo(() => {
    if (!user) return null;
    const provider = user.providerData?.[0]?.providerId || "firebase";
    return { provider, providerUserId: user.uid };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await apiFetch("/health");
        if (!cancelled) {
          setServerOk(true);
          setServerError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setServerOk(false);
          setServerError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSync = configured && !loading && !!user;

  async function refreshFromServer() {
    if (!providerKey) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const found = await getUserByProvider(providerKey);
      setRecord(found);
      setUserType(found.userType);
      setSubscriptionType(found.subscriptionType ?? "");
      setStorageQuotaMb(
        found.storageQuotaBytes
          ? String(Math.round(found.storageQuotaBytes / 1024 / 1024))
          : "",
      );
      setMessage(t("profileLoaded"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function syncUser() {
    if (!user) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = firebaseUserToUpsertPayload(user);
      const saved = await upsertUser(payload);
      setRecord(saved);
      setUserType(saved.userType);
      setSubscriptionType(saved.subscriptionType ?? "");
      setStorageQuotaMb(
        String(Math.round(saved.storageQuotaBytes / 1024 / 1024)),
      );
      setMessage(t("profileSynced"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    if (!record) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const quotaMb = storageQuotaMb.trim()
      ? Number(storageQuotaMb.trim())
      : null;
    const storageQuotaBytes =
      quotaMb == null || !Number.isFinite(quotaMb)
        ? null
        : Math.max(0, Math.round(quotaMb * 1024 * 1024));

    try {
      const updated = await patchUser(record.id, {
        userType,
        subscriptionType: subscriptionType.trim()
          ? subscriptionType.trim()
          : null,
        storageQuotaBytes,
      });
      setRecord(updated);
      setMessage(t("profileUpdated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser() {
    if (!record) return;
    if (!confirm(t("profileDeleteConfirm"))) return;

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await deleteUser(record.id);
      setRecord(null);
      setMessage(t("profileDeleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadProfilePhoto(file: File) {
    if (!record) return;

    if (!file.type.startsWith("image/")) {
      setError(t("profilePhotoUnsupported"));
      return;
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(t("profilePhotoTooLarge"));
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const presign = await presignUserPhotoUpload({
        id: record.id,
        filename: file.name || "avatar.png",
        contentType: file.type || "image/png",
      });

      const putRes = await fetch(presign.url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (${putRes.status})`);
      }

      const updated = await patchUser(record.id, {
        photoKey: presign.key,
      });
      setRecord(updated);
      setMessage(t("profilePhotoUpdated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetPhotoToProvider() {
    if (!record) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await patchUser(record.id, {
        photoKey: null,
        photoUrl: user?.photoURL ?? null,
      });
      setRecord(updated);
      setMessage(t("profilePhotoResetDone"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const serverBadge =
    serverOk === null
      ? {
          label: t("serverChecking"),
          tone: "border-zinc-200 bg-white/70 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300",
        }
      : serverOk
        ? {
            label: t("serverOnline"),
            tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200",
          }
        : {
            label: t("serverOffline"),
            tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
          };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {t("profilePageTitle")}
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {t("profilePageSubtitle")}
              </p>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 text-xs ${serverBadge.tone}`}
            >
              <div className="font-semibold">{serverBadge.label}</div>
              <div className="mt-0.5 opacity-80">{API_BASE_URL}</div>
            </div>
          </div>

          {!configured && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              {t("firebaseNotConfigured")}
            </div>
          )}

          {serverError && serverOk === false && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {serverError}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={syncUser}
              disabled={!canSync || busy}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {t("profileSync")}
            </button>

            <button
              type="button"
              onClick={refreshFromServer}
              disabled={!providerKey || busy}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
            >
              {t("profileRefresh")}
            </button>
          </div>

          {(message || error) && (
            <div
              className={
                "mt-4 rounded-xl border px-4 py-3 text-sm " +
                (error
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200")
              }
            >
              {error ?? message}
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("profileLocalAuth")}
            </h2>
            <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              {user ? (
                <div className="grid gap-1">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("signedInAs")}:
                    </span>{" "}
                    {user.email ?? user.displayName ?? user.uid}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    UID: {user.uid}
                  </div>
                </div>
              ) : (
                t("profileNotSignedIn")
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("profileServerRecord")}
            </h2>
            <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              {record ? (
                <div className="grid gap-1">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    ID: {record.id}
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("profileStorage")}:{" "}
                    </span>
                    {formatBytes(record.storageUsedBytes)} /{" "}
                    {formatBytes(record.storageQuotaBytes)}
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {" "}
                      ({formatBytes(record.storageLeftBytes)}{" "}
                      {t("profileStorageLeft")})
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("updatedAt", {
                      value: new Date(record.updatedAt).toLocaleString(),
                    })}
                  </div>
                </div>
              ) : (
                t("profileNoServerRecord")
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("profilePhotoTitle")}
            </h2>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("profilePhotoHint")}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                {record?.photoUrl ? (
                  <img
                    alt={t("accountAvatarAlt")}
                    className="h-full w-full object-cover"
                    src={withCacheBust(
                      resolveApiAssetUrl(record.photoUrl),
                      record.updatedAt,
                    )}
                  />
                ) : user?.photoURL ? (
                  <img
                    alt={t("accountAvatarAlt")}
                    className="h-full w-full object-cover"
                    src={user.photoURL}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                    {t("profilePhotoEmpty")}
                  </div>
                )}
              </div>

              <div className="grid gap-1">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("profilePhotoCurrent")}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {record
                    ? t("profilePhotoBackedByStorage")
                    : t("profilePhotoSyncFirst")}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!record || busy}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    // allow selecting same file again
                    e.currentTarget.value = "";
                    if (!f) return;
                    void uploadProfilePhoto(f);
                  }}
                />
                {t("profilePhotoUpload")}
              </label>

              <button
                type="button"
                onClick={resetPhotoToProvider}
                disabled={!record || busy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                {t("profilePhotoReset")}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("profilePlanTitle")}
            </h2>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("profilePlanHint")}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t("profileUserType")}
              </span>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value as UserType)}
                disabled={!record || busy}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
              >
                <option value="free">{t("profileFree")}</option>
                <option value="paid">{t("profilePaid")}</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t("profileSubscriptionType")}
              </span>
              <input
                value={subscriptionType}
                onChange={(e) => setSubscriptionType(e.target.value)}
                disabled={!record || busy}
                placeholder="e.g. monthly"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {t("profileQuotaMb")}
              </span>
              <input
                inputMode="numeric"
                value={storageQuotaMb}
                onChange={(e) => setStorageQuotaMb(e.target.value)}
                disabled={!record || busy}
                placeholder="100"
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={savePlan}
              disabled={!record || busy}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {t("profileSave")}
            </button>
            <button
              type="button"
              onClick={removeUser}
              disabled={!record || busy}
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60 dark:border-red-900/60 dark:bg-zinc-950 dark:text-red-200 dark:hover:bg-red-950/30"
            >
              {t("profileDelete")}
            </button>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
