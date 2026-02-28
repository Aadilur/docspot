import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import {
  ArrowLeft,
  Plus,
  Pencil,
  Share2,
  Trash2,
  Upload,
  Copy,
  ExternalLink,
  FileText,
  X,
  Mic,
  Pause,
  Info,
  Calendar,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuthState } from "../shared/firebase/useAuthState";
import { compressImageFile } from "../shared/images/compress";
import { uploadStore } from "../shared/uploads/store";
import { presignDriveUpload, confirmDriveUpload } from "../shared/api/storage";
import {
  DEFAULT_MAX_AUDIO_SECONDS,
  useVoiceNoteRecorder,
} from "../shared/audio/useVoiceNoteRecorder";
import {
  addObjectAttachment,
  createObjectReport,
  createObjectShareLink,
  deleteObjectGroup,
  getObjectGroupDetails,
  patchObjectGroup,
  patchObjectReport,
  type ObjectAttachment,
  type ObjectGroup,
  type ObjectReport,
} from "../shared/api/objects";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;

function bytesToMb(bytes: number) {
  return Math.max(0, Math.round((bytes / (1024 * 1024)) * 10) / 10);
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionForMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4")) return "m4a";
  return "audio";
}

type ReportWithAttachments = ObjectReport & {
  attachments: ObjectAttachment[];
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function isAllowedUpload(file: File) {
  if (file.type === "application/pdf") return true;
  if (file.type.startsWith("image/")) return true;
  if (file.type.startsWith("audio/")) return true;
  return false;
}

async function preparePickedFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  try {
    const prepared = await compressImageFile(file, {
      maxWidth: 2000,
      maxHeight: 2000,
      outputType: file.type === "image/png" ? "image/png" : "image/jpeg",
      quality: 0.82,
      keepIfSmallerThanBytes: 500 * 1024,
    });
    return prepared.file;
  } catch {
    return file;
  }
}

function buildShareUrl(sharePath: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}${sharePath}`;
}

function socialShareLinks(url: string) {
  const u = encodeURIComponent(url);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    twitter: `https://twitter.com/intent/tweet?url=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
  };
}

const SHARE_PRESETS: Array<{ label: string; ttlSeconds: number }> = [
  { label: "30 sec", ttlSeconds: 30 },
  { label: "1 min", ttlSeconds: 60 },
  { label: "10 min", ttlSeconds: 10 * 60 },
  { label: "30 min", ttlSeconds: 30 * 60 },
  { label: "1 hour", ttlSeconds: 60 * 60 },
  { label: "6 hours", ttlSeconds: 6 * 60 * 60 },
  { label: "12 hours", ttlSeconds: 12 * 60 * 60 },
  { label: "1 day", ttlSeconds: 24 * 60 * 60 },
];

function bestTitle(group: ObjectGroup, reports: ReportWithAttachments[]) {
  if (reports.length <= 1) return reports[0]?.title || group.title || "";
  return group.title || reports[0]?.title || "";
}

export default function ObjectGroupDetailsPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { configured, loading: authLoading, user } = useAuthState();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<ObjectGroup | null>(null);
  const [reports, setReports] = useState<ReportWithAttachments[]>([]);

  const [editGroupTitle, setEditGroupTitle] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [busyGroup, setBusyGroup] = useState(false);

  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePreset, setSharePreset] = useState<number>(
    () => SHARE_PRESETS[1].ttlSeconds,
  );
  const [customTtl, setCustomTtl] = useState<string>("");
  const [shareResult, setShareResult] = useState<{
    url: string;
    expiresAt: string;
    limitPer24h: number;
  } | null>(null);

  const canUse = configured && !authLoading && !!user && !!groupId;

  const editingReport = useMemo(() => {
    if (!editingReportId) return null;
    return reports.find((r) => r.id === editingReportId) ?? null;
  }, [reports, editingReportId]);

  async function refresh() {
    if (!canUse || !groupId) return;

    setError(null);
    setLoading(true);
    try {
      const details = await getObjectGroupDetails(groupId);
      if (!mountedRef.current) return;
      setGroup(details.group);
      setReports(
        [...details.reports].sort((a, b) => {
          const at = new Date(a.createdAt).getTime();
          const bt = new Date(b.createdAt).getTime();
          return bt - at;
        }),
      );
      setGroupTitleDraft(details.group.title ?? "");
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse, groupId]);

  async function saveGroupTitle() {
    if (!groupId || !group) return;

    setBusyGroup(true);
    setError(null);
    try {
      const updated = await patchObjectGroup({
        groupId,
        title: groupTitleDraft.trim() ? groupTitleDraft.trim() : null,
      });
      if (!mountedRef.current) return;
      setGroup(updated);
      setEditGroupTitle(false);
      await refresh();
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!mountedRef.current) return;
      setBusyGroup(false);
    }
  }

  async function onDeleteGroup() {
    if (!groupId) return;
    const ok = window.confirm(t("objectDeleteConfirm"));
    if (!ok) return;

    setError(null);
    setBusyGroup(true);
    try {
      await deleteObjectGroup(groupId);
      navigate("/other-doc");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyGroup(false);
    }
  }

  async function startShareCreate() {
    if (!groupId) return;

    const customRaw = customTtl.trim();
    const customParsed = customRaw ? Number(customRaw) : null;
    const ttl =
      typeof customParsed === "number" && Number.isFinite(customParsed)
        ? Math.max(1, Math.trunc(customParsed))
        : sharePreset;

    setShareBusy(true);
    setShareError(null);
    setShareResult(null);
    try {
      const res = await createObjectShareLink({
        groupId,
        ttlSeconds: ttl,
      });
      const url = buildShareUrl(res.sharePath);
      setShareResult({
        url,
        expiresAt: res.expiresAt,
        limitPer24h: res.limitPer24h,
      });
    } catch (e) {
      setShareError(e instanceof Error ? e.message : String(e));
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareUrl() {
    if (!shareResult?.url) return;
    try {
      await navigator.clipboard.writeText(shareResult.url);
    } catch {
      // ignore
    }
  }

  const pageTitle =
    group && reports.length ? bestTitle(group, reports) : t("objectDetails");

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/other-doc")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("back")}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShareOpen(true);
                setShareError(null);
                setShareResult(null);
              }}
              disabled={!canUse}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              aria-label={t("share")}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => void onDeleteGroup()}
              disabled={!canUse || busyGroup}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              aria-label={t("remove")}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingReportId(null);
                setReportSheetOpen(true);
              }}
              disabled={!canUse}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addReport")}
            </button>
          </div>
        </div>

        {(error || null) && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        {!configured ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            {t("firebaseNotConfigured")}
          </div>
        ) : authLoading ? (
          <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
            {t("loading")}
          </div>
        ) : !user ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            {t("profilePleaseLogin")}
          </div>
        ) : loading ? (
          <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
            {t("loading")}
          </div>
        ) : !group ? (
          <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
            {t("notFound")}
          </div>
        ) : (
          <>
            <section className="mt-5 rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    {t("objectDetails")}
                  </div>
                  <div className="mt-2 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {pageTitle}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("updatedAt", { value: formatDateTime(group.updatedAt) })}
                  </div>
                </div>

                {reports.length > 1 && (
                  <div className="flex items-center gap-2">
                    {!editGroupTitle ? (
                      <button
                        type="button"
                        onClick={() => setEditGroupTitle(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        {t("editGroupTitle")}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <input
                          value={groupTitleDraft}
                          onChange={(e) => setGroupTitleDraft(e.target.value)}
                          placeholder={t("groupTitlePlaceholder")}
                          className="h-10 w-full min-w-[16rem] rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditGroupTitle(false)}
                            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                          >
                            {t("close")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveGroupTitle()}
                            disabled={busyGroup}
                            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                          >
                            {t("saveNow")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-5 grid gap-4">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {r.title}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {t("updatedAt", { value: formatDateTime(r.updatedAt) })}
                      </div>
                      <div className="mt-3 grid gap-1 text-sm text-zinc-700 dark:text-zinc-200">
                        <div>
                          <span className="font-semibold">
                            {t("issueDate")}:
                          </span>{" "}
                          {r.issueDate || "—"}
                        </div>
                        <div>
                          <span className="font-semibold">
                            {t("nextAppointment")}:
                          </span>{" "}
                          {r.nextAppointment || "—"}
                        </div>
                        <div>
                          <span className="font-semibold">{t("doctor")}:</span>{" "}
                          {r.doctor || "—"}
                        </div>
                      </div>
                      {r.textNote ? (
                        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                          {r.textNote}
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingReportId(r.id);
                        setReportSheetOpen(true);
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                      aria-label={t("edit")}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-4">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("attachments")}
                    </div>

                    {r.attachments.length === 0 ? (
                      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                        {t("noAttachments")}
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-3">
                        {r.attachments.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                  {a.filename || a.key}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                  {(a.contentType || "").toLowerCase()}
                                </div>
                              </div>

                              {a.url ? (
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                                  aria-label={t("open")}
                                >
                                  <ExternalLink
                                    className="h-4 w-4"
                                    aria-hidden="true"
                                  />
                                </a>
                              ) : null}
                            </div>

                            {a.url &&
                            (a.contentType || "").startsWith("image/") ? (
                              <img
                                src={a.url}
                                alt={a.filename || "attachment"}
                                className="mt-3 max-h-72 w-full rounded-xl object-contain"
                                loading="lazy"
                              />
                            ) : null}

                            {a.url && a.kind === "audio" ? (
                              <audio
                                className="mt-3 w-full"
                                controls
                                src={a.url}
                              />
                            ) : null}

                            {a.url &&
                            (a.contentType || "") === "application/pdf" ? (
                              <a
                                href={a.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                              >
                                {t("openPdf")}
                                <ExternalLink
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </main>

      <Footer />

      {reportSheetOpen && groupId && (
        <ReportSheet
          t={t}
          groupId={groupId}
          initial={editingReport}
          onClose={() => {
            setReportSheetOpen(false);
            setEditingReportId(null);
          }}
          onSaved={async () => {
            await refresh();
          }}
        />
      )}

      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setShareOpen(false)}
            className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px] dark:bg-black/40"
          />

          <div className="relative w-full max-w-2xl rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />

            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
              <div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("share")}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("shareHint")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShareOpen(false)}
                aria-label={t("close")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                ×
              </button>
            </div>

            <div className="max-h-[75dvh] overflow-y-auto px-5 pb-28">
              {shareError ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {shareError}
                </div>
              ) : null}

              <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("linkExpiry")}
                  </span>
                  <select
                    value={String(sharePreset)}
                    onChange={(e) => setSharePreset(Number(e.target.value))}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  >
                    {SHARE_PRESETS.map((p) => (
                      <option key={p.ttlSeconds} value={String(p.ttlSeconds)}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("customSeconds")} ({t("optional")})
                  </span>
                  <input
                    value={customTtl}
                    onChange={(e) => setCustomTtl(e.target.value)}
                    inputMode="numeric"
                    placeholder={t("customSecondsPlaceholder")}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void startShareCreate()}
                  disabled={shareBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  {t("generateLink")}
                </button>

                {shareResult ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    <div className="font-semibold">{t("shareLink")}</div>
                    <div className="mt-2 break-all rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                      {shareResult.url}
                    </div>
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {t("expiresAt", {
                        value: formatDateTime(shareResult.expiresAt),
                      })}{" "}
                      • {t("shareLimit", { count: shareResult.limitPer24h })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void copyShareUrl()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        {t("copy")}
                      </button>

                      {(() => {
                        const links = socialShareLinks(shareResult.url);
                        return (
                          <>
                            <a
                              href={links.facebook}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                            >
                              Facebook
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </a>
                            <a
                              href={links.twitter}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                            >
                              X
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </a>
                            <a
                              href={links.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                            >
                              LinkedIn
                              <ExternalLink
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            </a>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportSheet({
  t,
  groupId,
  initial,
  onClose,
  onSaved,
}: {
  t: (key: string, opts?: any) => string;
  groupId: string;
  initial: ReportWithAttachments | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<Array<{ id: string; file: File }>>([]);
  const [previewUrls, setPreviewUrls] = useState<
    Array<{ id: string; url: string; name: string; type: string }>
  >([]);

  useEffect(() => {
    const next = files.map((f) => ({
      id: f.id,
      name: f.file.name,
      type: f.file.type,
      url: f.file.type.startsWith("image/") ? URL.createObjectURL(f.file) : "",
    }));
    setPreviewUrls(next);

    return () => {
      for (const p of next) {
        if (p.url) URL.revokeObjectURL(p.url);
      }
    };
  }, [files]);

  const voice = useVoiceNoteRecorder({
    t,
    maxSeconds: DEFAULT_MAX_AUDIO_SECONDS,
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? "");
  const [nextAppointment, setNextAppointment] = useState(
    initial?.nextAppointment ?? "",
  );
  const [doctor, setDoctor] = useState(initial?.doctor ?? "");
  const [textNote, setTextNote] = useState(initial?.textNote ?? "");

  async function saveReport() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(t("titleRequired"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const patch = {
        title: trimmed,
        issueDate: issueDate.trim() ? issueDate.trim() : null,
        nextAppointment: nextAppointment.trim() ? nextAppointment.trim() : null,
        doctor: doctor.trim() ? doctor.trim() : null,
        textNote: textNote.trim() ? textNote.trim() : null,
      };

      let reportId = initial?.id ?? null;

      if (!initial) {
        const created = await createObjectReport({
          groupId,
          ...patch,
        });
        reportId = created.id;
      } else {
        const needsPatch =
          patch.title !== initial.title ||
          patch.issueDate !== (initial.issueDate ?? null) ||
          patch.nextAppointment !== (initial.nextAppointment ?? null) ||
          patch.doctor !== (initial.doctor ?? null) ||
          patch.textNote !== (initial.textNote ?? null);

        if (needsPatch) {
          await patchObjectReport({
            groupId,
            reportId: initial.id,
            patch,
          });
        }
      }

      if (!reportId) {
        throw new Error("Missing report id");
      }

      const preparedFiles = await Promise.all(
        files.map((x) => preparePickedFile(x.file)),
      );
      const tooMany = preparedFiles.length > MAX_FILES;
      if (tooMany) {
        setError(t("fileCountError", { max: MAX_FILES }));
        return;
      }

      const invalid = preparedFiles.find((f) => !isAllowedUpload(f));
      if (invalid) {
        setError(t("fileTypeError"));
        return;
      }

      const tooLarge = preparedFiles.find((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (tooLarge) {
        setError(t("fileTooLargeError", { maxMb: 10 }));
        return;
      }

      const uploadOne = async (file: File, kind: "file" | "audio") => {
        const contentType = file.type || "application/octet-stream";
        const filename = file.name || "upload";

        const presign = await presignDriveUpload({
          filename,
          contentType,
          sizeBytes: file.size,
        });

        uploadStore.startPut({
          label: t("uploadingFile", { name: filename }),
          url: presign.url,
          body: file,
          contentType,
          onFinalize: async () => {
            await confirmDriveUpload({ key: presign.key });
            await addObjectAttachment({
              groupId,
              reportId,
              key: presign.key,
              filename,
              contentType,
              kind,
            });
            await onSaved();
          },
        });
      };

      for (const f of preparedFiles) {
        const kind = f.type?.startsWith("audio/") ? "audio" : "file";
        await uploadOne(f, kind);
      }

      if (voice.note) {
        const mime = voice.note.blob.type || "audio/wav";
        const ext = extensionForMime(mime);
        const voiceFile = new File([voice.note.blob], `voice-note.${ext}`, {
          type: mime,
        });
        await uploadOne(voiceFile, "audio");
      }

      await onSaved();
      setFiles([]);
      voice.clearNote();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const onPickFiles = async (picked: FileList | null) => {
    if (!picked) return;
    setError(null);

    const pickedArray = Array.from(picked);
    const total = files.length + pickedArray.length;
    if (total > MAX_FILES) {
      setError(t("fileCountError", { max: MAX_FILES }));
      return;
    }

    const invalid = pickedArray.find((f) => !isAllowedUpload(f));
    if (invalid) {
      setError(t("fileTypeError"));
      return;
    }

    const prepared = await Promise.all(pickedArray.map(preparePickedFile));
    const tooLarge = prepared.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setError(t("fileTooLargeError", { maxMb: 10 }));
      return;
    }

    setFiles((prev) => [
      ...prev,
      ...prepared.map((file) => ({ id: newLocalId(), file })),
    ]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px] dark:bg-black/40"
      />

      <div className="relative w-full max-w-2xl rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />

        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {initial ? t("editReport") : t("addReport")}
            </div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("reportHint")}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            ×
          </button>
        </div>

        {error ? (
          <div className="px-5 pb-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          </div>
        ) : null}

        <div className="max-h-[75dvh] overflow-y-auto px-5 pb-28">
          <div className="grid gap-4">
            <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("titleLabel")}
                  <span className="text-brand-700 dark:text-brand-300"> *</span>
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("issueDate")}
                </span>
                <div className="relative">
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 pr-10 text-sm text-zinc-900 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  />
                  <Calendar
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                </div>
              </label>
            </div>

            <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="cursor-pointer list-none select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                {t("attachments")}
                <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {t("filesSelected", { count: files.length, max: MAX_FILES })}
                </span>
              </summary>

              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("filesLabel")}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {t("fileLimits", {
                      maxFiles: MAX_FILES,
                      maxMb: bytesToMb(MAX_FILE_SIZE_BYTES),
                    })}
                  </span>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {t("selectFiles")}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {t("addFiles")}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf,audio/*"
                      className="hidden"
                      onChange={(e) => void onPickFiles(e.target.files)}
                    />
                  </div>

                  {files.length > 0 && (
                    <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
                      {previewUrls.map((p) => (
                        <div
                          key={p.id}
                          className="relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                          title={p.name}
                        >
                          {p.type === "application/pdf" ||
                          p.type.startsWith("audio/") ? (
                            <div className="flex h-16 items-center justify-center text-zinc-500 dark:text-zinc-400">
                              <FileText
                                className="h-6 w-6"
                                aria-hidden="true"
                              />
                            </div>
                          ) : (
                            <img
                              src={p.url}
                              alt={p.name}
                              className="h-16 w-full object-cover"
                              loading="lazy"
                            />
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setFiles((prev) =>
                                prev.filter((f) => f.id !== p.id),
                              )
                            }
                            aria-label={t("remove")}
                            className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white/90 text-zinc-700 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-200 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </details>

            <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="cursor-pointer list-none select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                {t("notes")}
                <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {t("audioLimit", { seconds: DEFAULT_MAX_AUDIO_SECONDS })}
                </span>
              </summary>

              <div className="mt-4 grid gap-2">
                {voice.voiceErrorKind === "permission" ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate">
                        {t("micPermissionBlockedLine")}
                      </div>
                      <button
                        type="button"
                        onClick={() => voice.setVoiceHelpOpen((v) => !v)}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950 dark:focus:ring-amber-900"
                        aria-expanded={voice.voiceHelpOpen}
                        aria-label={t("micPermissionHowTo")}
                      >
                        <Info className="h-4 w-4" aria-hidden="true" />
                        {t("micPermissionHowTo")}
                      </button>
                    </div>

                    {voice.voiceHelpOpen && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                        <div className="font-semibold">
                          {t("micEnableTitle")}
                        </div>
                        <ol className="mt-2 list-decimal pl-5">
                          <li>{t("micEnableStep1")}</li>
                          <li>{t("micEnableStep2")}</li>
                          <li>{t("micEnableStep3")}</li>
                        </ol>
                        <div className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/80">
                          {t("micEnableNote")}
                        </div>
                      </div>
                    )}
                  </div>
                ) : voice.voiceErrorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {voice.voiceErrorMessage}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {voice.recording
                        ? t("recording", {
                            left: Math.max(0, voice.recordSecondsLeft),
                          })
                        : voice.note
                          ? t("recorded", {
                              seconds: voice.recordedDurationSec,
                            })
                          : t("notRecorded")}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!voice.recording ? (
                        voice.note ? (
                          <button
                            type="button"
                            onClick={() => void voice.beginRecord()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                          >
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            {t("replaceRecording")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void voice.beginRecord()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                          >
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            {t("startRecording")}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={voice.endRecord}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                        >
                          <Pause className="h-4 w-4" aria-hidden="true" />
                          {t("stopRecording")}
                        </button>
                      )}

                      {voice.note && (
                        <button
                          type="button"
                          onClick={() => voice.clearNote()}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  </div>

                  {voice.audioUrl && (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        {t("reviewAudio")}
                      </div>
                      <audio controls src={voice.audioUrl} className="w-full" />
                    </div>
                  )}
                </div>
              </div>
            </details>

            <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <summary className="cursor-pointer list-none select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                {t("optionalDetails")}
              </summary>

              <div className="mt-4 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("doctor")}
                  </span>
                  <input
                    value={doctor}
                    onChange={(e) => setDoctor(e.target.value)}
                    placeholder={t("doctorPlaceholder")}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("nextAppointment")}
                  </span>
                  <div className="relative">
                    <input
                      type="date"
                      value={nextAppointment}
                      onChange={(e) => setNextAppointment(e.target.value)}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 pr-10 text-sm text-zinc-900 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                    />
                    <Calendar
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                  </div>
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("textNote")}
                  </span>
                  <textarea
                    value={textNote}
                    onChange={(e) => setTextNote(e.target.value)}
                    rows={4}
                    placeholder={t("textNotePlaceholder")}
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  />
                </label>
              </div>
            </details>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
            >
              {t("close")}
            </button>

            <button
              type="button"
              onClick={() => void saveReport()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
            >
              {t("saveNow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
