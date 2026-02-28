import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  ChevronRight,
  Pause,
  Plus,
  Upload,
  Mic,
  Trash2,
  Info,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuthState } from "../shared/firebase/useAuthState";
import { compressImageFile } from "../shared/images/compress";
import { uploadStore } from "../shared/uploads/store";
import { confirmDriveUpload, presignDriveUpload } from "../shared/api/storage";
import {
  DEFAULT_MAX_AUDIO_SECONDS,
  useVoiceNoteRecorder,
} from "../shared/audio/useVoiceNoteRecorder";
import {
  addInvoiceAttachment,
  createInvoiceGroupWithFirstReport,
  listInvoiceGroups,
  type InvoiceGroupListItem,
} from "../shared/api/invoices";

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function bytesToMb(bytes: number) {
  return Math.max(0, Math.round((bytes / (1024 * 1024)) * 10) / 10);
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function extensionForMime(mime: string) {
  const m = (mime || "").toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  if (m.includes("mp4")) return "m4a";
  return "audio";
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function InvoicePage() {
  const { t } = useTranslation();

  const { configured, loading: authLoading, user } = useAuthState();

  const [items, setItems] = useState<InvoiceGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [issueDateDraft, setIssueDateDraft] = useState<string>("");
  const [textNoteDraft, setTextNoteDraft] = useState<string>("");
  const [createSheetError, setCreateSheetError] = useState<string | null>(null);

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

  const canUse = configured && !authLoading && !!user;

  const sorted = useMemo(() => {
    return [...items].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  }, [items]);

  async function refresh() {
    if (!canUse) return;
    setError(null);
    setLoading(true);
    try {
      const groups = await listInvoiceGroups();
      setItems(groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  async function onCreate() {
    const trimmed = titleDraft.trim();
    if (!trimmed) return;

    setBusyCreate(true);
    setError(null);
    setCreateSheetError(null);
    try {
      const preparedFiles = await Promise.all(
        files.map((x) => preparePickedFile(x.file)),
      );
      const tooMany = preparedFiles.length > MAX_FILES;
      if (tooMany) {
        setCreateSheetError(t("fileCountError", { max: MAX_FILES }));
        return;
      }
      const invalid = preparedFiles.find((f) => !isAllowedUpload(f));
      if (invalid) {
        setCreateSheetError(t("fileTypeError"));
        return;
      }
      const tooLarge = preparedFiles.find((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (tooLarge) {
        setCreateSheetError(t("fileTooLargeError", { maxMb: 10 }));
        return;
      }

      const created = await createInvoiceGroupWithFirstReport({
        report: {
          title: trimmed,
          issueDate: issueDateDraft.trim() ? issueDateDraft.trim() : null,
          textNote: textNoteDraft.trim() ? textNoteDraft.trim() : null,
          doctor: null,
          nextAppointment: null,
        },
      });

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
            await addInvoiceAttachment({
              groupId: created.group.id,
              reportId: created.report.id,
              key: presign.key,
              filename,
              contentType,
              kind,
            });
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

      setCreateOpen(false);
      setTitleDraft("");
      setIssueDateDraft("");
      setTextNoteDraft("");
      setFiles([]);
      voice.clearNote();

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyCreate(false);
    }
  }

  const pickFiles = () => {
    fileInputRef.current?.click();
  };

  const onPickedFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    setFiles((prev) => {
      const next = [...prev];
      for (const file of picked) {
        next.push({ id: newLocalId(), file });
      }
      return next;
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("invoicePageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("invoicePageSubtitle")}
          </p>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("yourInvoices")}
            </h2>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
              disabled={!canUse}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addInvoice")}
            </button>
          </div>

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
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : loading ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("loading")}
            </div>
          ) : sorted.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("noInvoices")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {sorted.map((g) => (
                <Link
                  key={g.id}
                  to={`/invoice/${g.id}`}
                  className="group rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {g.title || g.latestReport?.title || t("invoiceGroup")}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        {g.latestReport?.title
                          ? g.latestReport.title
                          : t("noReportsYet")}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {t("updatedAt", { value: formatDateTime(g.updatedAt) })}{" "}
                        • {t("reportsCount", { count: g.reportCount })}
                      </div>
                    </div>
                    <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 group-hover:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />

      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setCreateOpen(false)}
            className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px] dark:bg-black/40"
          />

          <div className="relative w-full max-w-2xl rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200 dark:bg-zinc-800" />

            <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-4">
              <div>
                <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("addInvoice")}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("invoiceCreateHint")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label={t("close")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                ×
              </button>
            </div>

            <div className="px-5 pb-5">
              {createSheetError ? (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {createSheetError}
                </div>
              ) : null}

              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("title")}
                  </span>
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
                    placeholder={t("invoiceTitlePlaceholder")}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("issueDate")}
                  </span>
                  <input
                    type="date"
                    value={issueDateDraft}
                    onChange={(e) => setIssueDateDraft(e.target.value)}
                    className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("textNote")}
                  </span>
                  <textarea
                    value={textNoteDraft}
                    onChange={(e) => setTextNoteDraft(e.target.value)}
                    rows={3}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-brand-900"
                    placeholder={t("textNotePlaceholder")}
                  />
                </label>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("attachments")}
                    </div>
                    <button
                      type="button"
                      onClick={pickFiles}
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {t("addFiles")}
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,audio/*"
                    className="hidden"
                    onChange={onPickedFiles}
                  />

                  {files.length === 0 ? (
                    <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("invoiceSheetHint")}
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {previewUrls.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {p.name}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                {p.type || t("unknownType")}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeFile(p.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                              aria-label={t("remove")}
                            >
                              ×
                            </button>
                          </div>
                          {p.url ? (
                            <img
                              src={p.url}
                              alt={p.name}
                              className="mt-3 max-h-56 w-full rounded-xl object-contain"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                          <audio
                            controls
                            src={voice.audioUrl}
                            className="w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </div>

              <button
                type="button"
                onClick={() => void onCreate()}
                disabled={!titleDraft.trim() || busyCreate || !canUse}
                className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
              >
                {busyCreate
                  ? t("creating")
                  : t("createInvoiceAndUpload", {
                      mb: bytesToMb(
                        files.reduce((acc, f) => acc + f.file.size, 0) +
                          (voice.note?.blob.size ?? 0),
                      ),
                    })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
