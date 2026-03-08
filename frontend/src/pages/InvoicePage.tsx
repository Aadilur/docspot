import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  Calendar,
  ChevronDown,
  ChevronRight,
  FileText,
  Pause,
  Plus,
  Upload,
  Mic,
  Trash2,
  Info,
  X,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuthRequiredModal } from "../shared/auth";
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
const LIST_PAGE_SIZE = 20;

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
  const authRequired = useAuthRequiredModal();

  const HOW_IT_WORKS_STORAGE_KEY = "docspot:ui:howItWorks:invoice";
  const [howItWorksOpen, setHowItWorksOpen] = useState<boolean>(() => {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(HOW_IT_WORKS_STORAGE_KEY)
        : null;
    if (raw === "0") return false;
    if (raw === "1") return true;
    return true;
  });

  const [items, setItems] = useState<InvoiceGroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [issueDateDraft, setIssueDateDraft] = useState<string>("");
  const [textNoteDraft, setTextNoteDraft] = useState<string>("");
  const [createSheetError, setCreateSheetError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      HOW_IT_WORKS_STORAGE_KEY,
      howItWorksOpen ? "1" : "0",
    );
  }, [howItWorksOpen]);

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

  const beginRecordChecked = () => {
    setCreateSheetError(null);

    const hasSelectedAudioFile = files.some((f) =>
      f.file.type?.startsWith("audio/"),
    );
    if (hasSelectedAudioFile) {
      setCreateSheetError(t("audioCountError"));
      return;
    }

    const willAddNewNote = !voice.note;
    if (willAddNewNote && files.length + 1 > MAX_FILES) {
      setCreateSheetError(t("fileCountError", { max: MAX_FILES }));
      return;
    }

    void voice.beginRecord();
  };

  const canUse = configured && !authLoading && !!user;

  const sorted = useMemo(() => {
    return [...items].sort((a, b) =>
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;

    return sorted.filter((g) => {
      const hay = `${g.title ?? ""} ${g.latestReport?.title ?? ""}`
        .trim()
        .toLowerCase();
      return hay.includes(q);
    });
  }, [search, sorted]);

  const pageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  }, [filtered.length]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const currentPage = Math.min(page, pageCount - 1);

  const pageItems = useMemo(() => {
    const start = currentPage * LIST_PAGE_SIZE;
    return filtered.slice(start, start + LIST_PAGE_SIZE);
  }, [currentPage, filtered]);

  const canPrev = currentPage > 0;
  const canNext = currentPage + 1 < pageCount;

  async function refresh() {
    if (!canUse) return;
    setError(null);
    setLoading(true);
    try {
      const FETCH_LIMIT = 100;
      const MAX_OFFSET = 10_000;

      const all: InvoiceGroupListItem[] = [];
      let offset = 0;
      for (let i = 0; i < 200; i++) {
        const chunk = await listInvoiceGroups({ limit: FETCH_LIMIT, offset });
        all.push(...chunk);

        if (chunk.length < FETCH_LIMIT) break;
        offset += FETCH_LIMIT;
        if (offset > MAX_OFFSET) break;
      }

      setItems(all);
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

      const voiceCount = voice.note ? 1 : 0;
      const totalAttachments = preparedFiles.length + voiceCount;
      if (totalAttachments > MAX_FILES) {
        setCreateSheetError(t("fileCountError", { max: MAX_FILES }));
        return;
      }

      const audioAttachments =
        preparedFiles.filter((f) => f.type?.startsWith("audio/")).length +
        voiceCount;
      if (audioAttachments > 1) {
        setCreateSheetError(t("audioCountError"));
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

    setCreateSheetError(null);

    const voiceCount = voice.note ? 1 : 0;
    const total = files.length + picked.length + voiceCount;
    if (total > MAX_FILES) {
      setCreateSheetError(t("fileCountError", { max: MAX_FILES }));
      return;
    }

    const audioTotal =
      files.filter((x) => x.file.type?.startsWith("audio/")).length +
      picked.filter((x) => x.type?.startsWith("audio/")).length +
      voiceCount;
    if (audioTotal > 1) {
      setCreateSheetError(t("audioCountError"));
      return;
    }

    const invalid = picked.find((f) => !isAllowedUpload(f));
    if (invalid) {
      setCreateSheetError(t("fileTypeError"));
      return;
    }

    const prepared = await Promise.all(picked.map(preparePickedFile));
    const tooLarge = prepared.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooLarge) {
      setCreateSheetError(t("fileTooLargeError", { maxMb: 10 }));
      return;
    }

    setFiles((prev) => {
      const next = [...prev];
      for (const file of prepared) {
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

      {authRequired.modal}

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

        <details
          open={howItWorksOpen}
          onToggle={(e) => {
            setHowItWorksOpen(e.currentTarget.open);
          }}
          className="mt-4 rounded-2xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
            <span>{t("howItWorksTitle")}</span>
            <ChevronDown
              className={
                "h-4 w-4 shrink-0 transition-transform " +
                (howItWorksOpen ? "rotate-180" : "")
              }
              aria-hidden="true"
            />
          </summary>

          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            {t("invoiceHowBody", {
              defaultValue:
                "Create a group, add receipts/invoices, then search or share when needed.",
            })}
          </p>

          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
            <li>
              {t("invoiceHowStep1Title", { defaultValue: "Create a group" })}
            </li>
            <li>
              {t("invoiceHowStep2Title", {
                defaultValue: "Add receipt photos/PDFs",
              })}
            </li>
            <li>
              {t("invoiceHowStep3Title", {
                defaultValue: "Add date + a short note",
              })}
            </li>
            <li>
              {t("invoiceHowStep4Title", {
                defaultValue: "Search later when you need it",
              })}
            </li>
            <li>
              {t("invoiceHowStep5Title", {
                defaultValue: "Share a view-only link (optional)",
              })}
            </li>
          </ol>
        </details>

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("yourInvoices")}
            </h2>
            <button
              type="button"
              onClick={() => {
                authRequired.requireAuth(() => {
                  setCreateOpen(true);
                });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("addInvoice")}
            </button>
          </div>

          {configured &&
            !authLoading &&
            user &&
            !error &&
            !loading &&
            sorted.length > 0 && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchPlaceholder")}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 pr-10 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                  />
                  {search.trim() ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setPage(0);
                      }}
                      aria-label={t("clearSearch")}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200 dark:focus:ring-brand-900"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={!canPrev}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                  >
                    {t("paginationPrev")}
                  </button>

                  <div className="min-w-[7.5rem] text-center text-xs text-zinc-500 dark:text-zinc-400">
                    {t("paginationPage", {
                      page: currentPage + 1,
                      pages: pageCount,
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(pageCount - 1, p + 1))
                    }
                    disabled={!canNext}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                  >
                    {t("paginationNext")}
                  </button>
                </div>
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
          ) : filtered.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("noMatches")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {pageItems.map((g, idx) => (
                <Fragment key={g.id}>
                  <Link
                    to={`/invoice/${g.id}`}
                    className="group rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {g.title ||
                            g.latestReport?.title ||
                            t("invoiceGroup")}
                        </div>
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          {g.latestReport?.title
                            ? g.latestReport.title
                            : t("noReportsYet")}
                        </div>
                        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                          {t("updatedAt", {
                            value: formatDateTime(g.updatedAt),
                          })}{" "}
                          • {t("reportsCount", { count: g.reportCount })}
                        </div>
                      </div>
                      <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 group-hover:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </div>
                    </div>
                  </Link>
                </Fragment>
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
                      placeholder={t("invoiceTitlePlaceholder")}
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
                        count: files.length + (voice.note ? 1 : 0),
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
                          onClick={pickFiles}
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
                          onChange={onPickedFiles}
                        />
                      </div>

                      {files.length === 0 ? (
                        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {t("invoiceSheetHint")}
                        </div>
                      ) : (
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
                              ) : p.url ? (
                                <img
                                  src={p.url}
                                  alt={p.name}
                                  className="h-16 w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-16 items-center justify-center text-zinc-500 dark:text-zinc-400">
                                  <FileText
                                    className="h-6 w-6"
                                    aria-hidden="true"
                                  />
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={() => removeFile(p.id)}
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
                                onClick={beginRecordChecked}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
                              >
                                <Mic className="h-4 w-4" aria-hidden="true" />
                                {t("replaceRecording")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={beginRecordChecked}
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
                  disabled={!titleDraft.trim() || busyCreate || !canUse}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
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
        </div>
      )}
    </div>
  );
}
