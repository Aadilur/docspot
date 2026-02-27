import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { API_BASE_URL, apiFetch } from "../shared/api/http";
import {
  getMe,
  getMyPhotoUrl,
  patchMe,
  presignMyPhotoUpload,
  type UserRecord,
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

function isLikelyCorsNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /failed to fetch/i.test(err.message);
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { configured, loading, user } = useAuthState();

  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [loadingMe, setLoadingMe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<UserRecord | null>(null);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    if (!configured || loading) return;
    if (!user) {
      setRecord(null);
      setLoadingMe(false);
      return;
    }

    setLoadingMe(true);
    setError(null);
    setMessage(null);

    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setRecord(me);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingMe(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, loading, user?.uid]);

  useEffect(() => {
    let cancelled = false;

    if (!configured || loading) return;
    if (!user) {
      setPhotoSrc(null);
      return;
    }

    if (!record?.photoUrl) {
      setPhotoSrc(null);
      return;
    }

    (async () => {
      try {
        setLoadingPhoto(true);
        const { url } = await getMyPhotoUrl();
        if (!cancelled) {
          setPhotoSrc(withCacheBust(resolveApiAssetUrl(url), record.updatedAt));
        }
      } catch {
        if (!cancelled) setPhotoSrc(null);
      } finally {
        if (!cancelled) setLoadingPhoto(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, loading, user?.uid, record?.photoUrl, record?.updatedAt]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
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

    await runAction(async () => {
      try {
        const contentType = file.type || "image/png";
        const presign = await presignMyPhotoUpload({
          filename: file.name || "avatar.png",
          contentType,
        });

        const putRes = await fetch(presign.url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(
            `${t("profilePhotoUploadFailed")} (${putRes.status})`,
          );
        }

        const updated = await patchMe({ photoKey: presign.key });
        setRecord(updated);
        setMessage(t("profilePhotoUpdated"));
      } catch (e) {
        if (isLikelyCorsNetworkError(e)) {
          setError(t("profilePhotoUploadCors"));
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      }
    });
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                {photoSrc ? (
                  <img
                    alt={t("accountAvatarAlt")}
                    className="h-full w-full object-cover"
                    src={photoSrc}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                    {record?.photoUrl && loadingPhoto
                      ? t("loading")
                      : t("profilePhotoEmpty")}
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {t("profilePageTitle")}
                </h1>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("profilePageSubtitle")}
                </p>
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${serverBadge.tone}`}
              >
                <div className="font-semibold">{serverBadge.label}</div>
                <div className="mt-0.5 opacity-80">{API_BASE_URL}</div>
              </div>

              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                {loadingMe ? t("loading") : ""}
              </div>
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
                t("profilePleaseLogin")
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
                  <div className="mt-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                (record.storageUsedBytes /
                                  Math.max(1, record.storageQuotaBytes)) *
                                  100,
                              ),
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("updatedAt", {
                      value: new Date(record.updatedAt).toLocaleString(),
                    })}
                  </div>
                </div>
              ) : user ? (
                <div className="text-zinc-500 dark:text-zinc-400">
                  {t("profileNoServerRecord")}
                </div>
              ) : (
                <div className="text-zinc-500 dark:text-zinc-400">
                  {t("profilePleaseLogin")}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("profilePhotoTitle")}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t("profilePhotoHint")}
              </p>
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {t("profilePhotoBackedByStorage")}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[160px,1fr]">
            <div>
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {t("profilePhotoCurrent")}
              </div>
              <div className="mt-2 h-28 w-28 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                {photoSrc ? (
                  <img
                    alt={t("accountAvatarAlt")}
                    className="h-full w-full object-cover"
                    src={photoSrc}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                    {record?.photoUrl && loadingPhoto
                      ? t("loading")
                      : t("profilePhotoEmpty")}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              {!user && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                  {t("profilePleaseLogin")}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={!record || busy}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.currentTarget.value = "";
                      void uploadProfilePhoto(file);
                    }}
                  />
                  {t("profilePhotoUpload")}
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void runAction(async () => {
                      const updated = await patchMe({ photoKey: null });
                      setRecord(updated);
                      setMessage(t("profilePhotoResetDone"));
                    })
                  }
                  disabled={!record || busy}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                >
                  {t("remove")}
                </button>
              </div>

              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("profilePhotoBackedByStorage")}
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
