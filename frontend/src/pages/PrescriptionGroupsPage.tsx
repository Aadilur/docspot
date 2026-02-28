import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  Plus,
  ChevronRight,
  Upload,
  FileText,
  X,
  Mic,
  Pause,
  Trash2,
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
  addPrescriptionAttachment,
  createPrescriptionGroupWithFirstReport,
  listPrescriptionGroups,
  type PrescriptionGroupListItem,
} from "../shared/api/prescriptions";
import {
  DEFAULT_MAX_AUDIO_SECONDS,
  useVoiceNoteRecorder,
} from "../shared/audio/useVoiceNoteRecorder";

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

export default function PrescriptionGroupsPage() {
  const { t } = useTranslation();
  const { configured, loading: authLoading, user } = useAuthState();

  const [items, setItems] = useState<PrescriptionGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [issueDateDraft, setIssueDateDraft] = useState<string>("");
  const [nextAppointmentDraft, setNextAppointmentDraft] = useState<string>("");
  const [doctorDraft, setDoctorDraft] = useState<string>("");
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
      const groups = await listPrescriptionGroups();
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

      const created = await createPrescriptionGroupWithFirstReport({
        report: {
          title: trimmed,
          issueDate: issueDateDraft.trim() ? issueDateDraft.trim() : null,
          nextAppointment: nextAppointmentDraft.trim()
            ? nextAppointmentDraft.trim()
            : null,
          doctor: doctorDraft.trim() ? doctorDraft.trim() : null,
          textNote: textNoteDraft.trim() ? textNoteDraft.trim() : null,
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
            await addPrescriptionAttachment({
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
      setNextAppointmentDraft("");
      setDoctorDraft("");
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

  const onPickFiles = async (picked: FileList | null) => {
    if (!picked) return;
    setCreateSheetError(null);

    const pickedArray = Array.from(picked);
    const total = files.length + pickedArray.length;
    if (total > MAX_FILES) {
      setCreateSheetError(t("fileCountError", { max: MAX_FILES }));
      return;
    }

    const invalid = pickedArray.find((f) => !isAllowedUpload(f));
    if (invalid) {
      setCreateSheetError(t("fileTypeError"));
      return;
    }

    const prepared = await Promise.all(pickedArray.map(preparePickedFile));
    const tooLarge = prepared.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setCreateSheetError(t("fileTooLargeError", { maxMb: 10 }));
      return;
    }

    setFiles((prev) => [
      ...prev,
      ...prepared.map((file) => ({ id: newLocalId(), file })),
    ]);
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
            {t("prescriptionPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("prescriptionPageSubtitle")}
          </p>
        </section>

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("yourPrescriptions")}
            </h2>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
              disabled={!canUse}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addPrescription")}
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
              {t("noPrescriptions")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {sorted.map((g) => (
                <Link
                  key={g.id}
                  to={`/prescription/${g.id}`}
                  className="group rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {g.title ||
                          g.latestReport?.title ||
                          t("prescriptionGroup")}
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
                  {t("addPrescription")}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("prescriptionCreateHint")}
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

            <div className="max-h-[75dvh] overflow-y-auto px-5 pb-28">
              <div className="grid gap-4">
                {(createSheetError || null) && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {createSheetError}
                  </div>
                )}

                <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("titleLabel")}
                      <span className="text-brand-700 dark:text-brand-300">
                        {" "}
                        *
                      </span>
                    </span>
                    <input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
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
                        value={issueDateDraft}
                        onChange={(e) => setIssueDateDraft(e.target.value)}
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
                      {t("filesSelected", {
                        count: files.length,
                        max: MAX_FILES,
                      })}
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
                        value={doctorDraft}
                        onChange={(e) => setDoctorDraft(e.target.value)}
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
                          value={nextAppointmentDraft}
                          onChange={(e) =>
                            setNextAppointmentDraft(e.target.value)
                          }
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
                        value={textNoteDraft}
                        onChange={(e) => setTextNoteDraft(e.target.value)}
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
                  onClick={() => setCreateOpen(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                >
                  {t("close")}
                </button>

                <button
                  type="button"
                  onClick={() => void onCreate()}
                  disabled={busyCreate || !titleDraft.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                >
                  {t("saveNow")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
