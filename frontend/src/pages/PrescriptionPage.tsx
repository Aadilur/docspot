import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Calendar,
  FileText,
  Info,
  Mic,
  Pause,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import AudioRecorderPolyfill from "audio-recorder-polyfill";
import { useReactMediaRecorder } from "react-media-recorder";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  deletePrescription,
  listPrescriptions,
  PrescriptionRecord,
  StoredFile,
  upsertPrescription,
} from "../shared/storage/prescriptions";

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 30;

function generateId(prefix: string) {
  const rand = Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now().toString(16)}-${rand}`;
}

function toIsoDateInput(value: Date) {
  const yyyy = value.getFullYear();
  const mm = String(value.getMonth() + 1).padStart(2, "0");
  const dd = String(value.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function bytesToMb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function isAllowedFile(file: File) {
  if (file.type === "application/pdf") return true;
  return file.type.startsWith("image/");
}

function clampNonNegative(n: number) {
  return n < 0 ? 0 : n;
}

function createObjectUrlSafe(blob: Blob) {
  return URL.createObjectURL(blob);
}

// Some browsers (notably older Safari versions) don't ship MediaRecorder.
// This polyfill records to WAV and allows our main feature (voice note) to work.
if (
  typeof window !== "undefined" &&
  typeof (window as unknown as { MediaRecorder?: unknown }).MediaRecorder ===
    "undefined"
) {
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder =
    AudioRecorderPolyfill as unknown as any;
}

function humanizeRecorderError(message: string) {
  const m = message.toLowerCase();
  if (
    m.includes("permission") ||
    m.includes("notallowederror") ||
    m.includes("denied")
  ) {
    return "permission";
  }
  if (m.includes("notfounderror") || m.includes("no_specified_media_found")) {
    return "notfound";
  }
  if (m.includes("notreadableerror") || m.includes("trackstarterror")) {
    return "busy";
  }
  if (m.includes("overconstrainederror")) {
    return "constraints";
  }
  if (m.includes("security") || m.includes("secure")) {
    return "secure";
  }
  return "generic";
}

async function hasAudioInputDevice() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return true;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === "audioinput");
  } catch {
    return true;
  }
}

async function getMicrophonePermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  try {
    const navAny = navigator as any;
    if (!navAny.permissions?.query) return "unknown";
    const result = await navAny.permissions.query({ name: "microphone" });
    if (result?.state === "granted") return "granted";
    if (result?.state === "denied") return "denied";
    if (result?.state === "prompt") return "prompt";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export default function PrescriptionPage() {
  const { t } = useTranslation();

  const [items, setItems] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingRecord = useMemo(
    () => items.find((r) => r.id === editingId) ?? null,
    [items, editingId],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const records = await listPrescriptions();
        if (!alive) return;
        setItems(records);
      } catch (e) {
        if (!alive) return;
        setPageError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [sheetOpen]);

  const openCreate = () => {
    setEditingId(null);
    setSheetOpen(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setSheetOpen(true);
  };

  const onDelete = async (id: string) => {
    try {
      await deletePrescription(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setPageError(e instanceof Error ? e.message : String(e));
    }
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
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addPrescription")}
            </button>
          </div>

          {(pageError || null) && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {pageError}
            </div>
          )}

          {loading ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("loading")}
            </div>
          ) : items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("noPrescriptions")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {item.title}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        {t("prescriptionListMeta", {
                          issueDate: item.issueDate,
                          nextAppointment: item.nextAppointment || "—",
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                          <FileText
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {t("filesCount", { count: item.files.length })}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.audioNote ? t("audioYes") : t("audioNo")}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                          <Calendar
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {t("updatedAt", { value: item.updatedAt })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                        aria-label={t("edit")}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(item.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                        aria-label={t("remove")}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />

      {sheetOpen && (
        <AddEditPrescriptionSheet
          initial={editingRecord}
          onClose={() => setSheetOpen(false)}
          onSaved={(saved) => {
            setItems((prev) => {
              const idx = prev.findIndex((p) => p.id === saved.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
              }
              return [saved, ...prev];
            });
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddEditPrescriptionSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: PrescriptionRecord | null;
  onClose: () => void;
  onSaved: (saved: PrescriptionRecord) => void;
}) {
  const { t } = useTranslation();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [issueDate, setIssueDate] = useState(
    initial?.issueDate ?? toIsoDateInput(new Date()),
  );
  const [nextAppointment, setNextAppointment] = useState(
    initial?.nextAppointment ?? "",
  );
  const [textNote, setTextNote] = useState(initial?.textNote ?? "");
  const [files, setFiles] = useState<StoredFile[]>(initial?.files ?? []);
  const [audioNote, setAudioNote] = useState<PrescriptionRecord["audioNote"]>(
    initial?.audioNote ?? null,
  );

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [voiceErrorKind, setVoiceErrorKind] = useState<
    | "permission"
    | "secure"
    | "notfound"
    | "busy"
    | "notsupported"
    | "generic"
    | null
  >(null);
  const [voiceErrorMessage, setVoiceErrorMessage] = useState<string | null>(
    null,
  );
  const [voiceHelpOpen, setVoiceHelpOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const audioUrl = useMemo(() => {
    if (!audioNote) return null;
    return createObjectUrlSafe(audioNote.blob);
  }, [audioNote]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const previewUrls = useMemo(() => {
    return files.map((f) => {
      const url = createObjectUrlSafe(f.blob);
      return { id: f.id, url, type: f.type, name: f.name };
    });
  }, [files]);

  useEffect(() => {
    return () => {
      for (const p of previewUrls) URL.revokeObjectURL(p.url);
    };
  }, [previewUrls]);

  const [recordSecondsLeft, setRecordSecondsLeft] = useState(MAX_AUDIO_SECONDS);
  const [recording, setRecording] = useState(false);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtMsRef = useRef<number | null>(null);
  const stopRequestedRef = useRef(false);

  const recordedDurationSec = useMemo(() => {
    if (!audioNote) return 0;
    return clampNonNegative(Math.round(audioNote.durationSec));
  }, [audioNote]);

  const stopTimer = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const {
    startRecording,
    stopRecording,
    error: recorderError,
  } = useReactMediaRecorder({
    audio: true,
    askPermissionOnMount: false,
    onStop: (_blobUrl, blob) => {
      if (!blob) return;
      const startedAt = recordStartedAtMsRef.current;
      const duration = startedAt
        ? Math.min(
            MAX_AUDIO_SECONDS,
            Math.round((Date.now() - startedAt) / 1000),
          )
        : 0;
      setAudioNote({
        blob,
        durationSec: clampNonNegative(duration),
      });
    },
  });

  useEffect(() => {
    if (!recorderError) return;
    stopTimer();
    recordStartedAtMsRef.current = null;
    stopRequestedRef.current = true;
    setRecording(false);

    const kind = humanizeRecorderError(recorderError);
    if (kind === "permission") {
      setVoiceErrorKind("permission");
      setVoiceErrorMessage(t("micPermissionDenied"));
      setVoiceHelpOpen(false);
    } else if (kind === "notfound") {
      setVoiceErrorKind("notfound");
      setVoiceErrorMessage(t("micNotFound"));
    } else if (kind === "secure") {
      setVoiceErrorKind("secure");
      setVoiceErrorMessage(t("micNeedsSecureContext"));
    } else if (kind === "busy") {
      setVoiceErrorKind("busy");
      setVoiceErrorMessage(t("micBusy"));
    } else {
      setVoiceErrorKind("generic");
      setVoiceErrorMessage(t("micGenericError"));
    }
  }, [recorderError]);

  const beginRecord = async () => {
    setVoiceErrorKind(null);
    setVoiceErrorMessage(null);
    setVoiceHelpOpen(false);
    if (!window.isSecureContext) {
      setVoiceErrorKind("secure");
      setVoiceErrorMessage(t("micNeedsSecureContext"));
      return;
    }

    const canUseMic =
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    if (!canUseMic) {
      setVoiceErrorKind("notsupported");
      setVoiceErrorMessage(t("micNotSupported"));
      return;
    }

    const perm = await getMicrophonePermissionState();
    if (perm === "denied") {
      setVoiceErrorKind("permission");
      setVoiceErrorMessage(t("micPermissionDenied"));
      return;
    }

    const hasDevice = await hasAudioInputDevice();
    if (!hasDevice) {
      setVoiceErrorKind("notfound");
      setVoiceErrorMessage(t("micNotFound"));
      return;
    }

    stopRequestedRef.current = false;
    setAudioNote(null);
    setRecordSecondsLeft(MAX_AUDIO_SECONDS);
    setRecording(true);
    recordStartedAtMsRef.current = Date.now();

    stopTimer();

    try {
      startRecording();
    } catch {
      stopTimer();
      recordStartedAtMsRef.current = null;
      setRecording(false);
      setVoiceErrorKind("generic");
      setVoiceErrorMessage(t("micGenericError"));
      return;
    }

    recordTimerRef.current = window.setInterval(() => {
      setRecordSecondsLeft((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          stopTimer();
          setRecording(false);
          stopRequestedRef.current = true;
          stopRecording();
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const endRecord = () => {
    stopTimer();
    setRecording(false);
    stopRequestedRef.current = true;
    stopRecording();
  };

  const onPickFiles = async (picked: FileList | null) => {
    if (!picked) return;
    setFormError(null);

    const currentCount = files.length;
    const pickedArray = Array.from(picked);

    const invalidType = pickedArray.find((f) => !isAllowedFile(f));
    if (invalidType) {
      setFormError(t("fileTypeError"));
      return;
    }

    const tooLarge = pickedArray.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setFormError(
        t("fileTooLargeError", { maxMb: bytesToMb(MAX_FILE_SIZE_BYTES) }),
      );
      return;
    }

    if (currentCount + pickedArray.length > MAX_FILES) {
      setFormError(t("fileCountError", { max: MAX_FILES }));
      return;
    }

    const next: StoredFile[] = pickedArray.map((f) => ({
      id: generateId("file"),
      name: f.name,
      type: f.type,
      size: f.size,
      blob: f,
    }));
    setFiles((prev) => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const save = async () => {
    setFormError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setFormError(t("titleRequired"));
      return;
    }
    if (!issueDate) {
      setFormError(t("issueDateRequired"));
      return;
    }

    const now = new Date().toISOString();
    const record: PrescriptionRecord = {
      id: initial?.id ?? generateId("rx"),
      title: trimmed,
      issueDate,
      nextAppointment: nextAppointment,
      textNote: textNote.trim(),
      files,
      audioNote,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      setBusy(true);
      await upsertPrescription(record);
      onSaved(record);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("addPrescription")}
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
              {initial ? t("editPrescription") : t("addPrescription")}
            </div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("prescriptionSheetHint")}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {formError && (
          <div className="px-5 pb-3">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {formError}
            </div>
          </div>
        )}

        <div className="max-h-[75dvh] overflow-y-auto px-5 pb-28">
          <div className="grid gap-4">
            <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("basicInfo")}
              </div>

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
                      accept="image/*,application/pdf"
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
                          {p.type === "application/pdf" ? (
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
                  {t("audioLimit", { seconds: MAX_AUDIO_SECONDS })}
                </span>
              </summary>

              <div className="mt-4 grid gap-2">
                {voiceErrorKind === "permission" ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate">
                        {t("micPermissionBlockedLine")}
                      </div>
                      <button
                        type="button"
                        onClick={() => setVoiceHelpOpen((v) => !v)}
                        className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950 dark:focus:ring-amber-900"
                        aria-expanded={voiceHelpOpen}
                        aria-label={t("micPermissionHowTo")}
                      >
                        <Info className="h-4 w-4" aria-hidden="true" />
                        {t("micPermissionHowTo")}
                      </button>
                    </div>

                    {voiceHelpOpen && (
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
                ) : voiceErrorMessage ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {voiceErrorMessage}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {recording
                        ? t("recording", {
                            left: clampNonNegative(recordSecondsLeft),
                          })
                        : audioNote
                          ? t("recorded", { seconds: recordedDurationSec })
                          : t("notRecorded")}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!recording ? (
                        audioNote ? (
                          <button
                            type="button"
                            onClick={() => void beginRecord()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                          >
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            {t("replaceRecording")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void beginRecord()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                          >
                            <Mic className="h-4 w-4" aria-hidden="true" />
                            {t("startRecording")}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={endRecord}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                        >
                          <Pause className="h-4 w-4" aria-hidden="true" />
                          {t("stopRecording")}
                        </button>
                      )}

                      {audioNote && (
                        <button
                          type="button"
                          onClick={() => setAudioNote(null)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  </div>

                  {audioUrl && (
                    <div className="mt-4">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                        {t("reviewAudio")}
                      </div>
                      <audio controls src={audioUrl} className="w-full" />
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
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {t("saveNow")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
