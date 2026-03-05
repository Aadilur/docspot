import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { useAuthRequiredModal } from "../shared/auth";
import { presignDriveUpload, confirmDriveUpload } from "../shared/api/storage";
import { listCareerJobs, type CareerJob } from "../shared/api/careers";
import {
  applyToCareerJob,
  getMyCareerApplicationForJob,
  listCareerApplicationMessages,
  sendCareerApplicationMessage,
  type CareerApplication,
  type CareerApplicationMessage,
} from "../shared/api/careerApplications";

function toBadgeValues(job: CareerJob): string[] {
  const values: string[] = [];
  if (job.department) values.push(job.department);
  if (job.location) values.push(job.location);
  if (job.employmentType) values.push(job.employmentType);
  if (job.experienceLevel) values.push(job.experienceLevel);
  return values;
}

export default function CareersPage() {
  const { t, i18n } = useTranslation();
  const authRequired = useAuthRequiredModal();

  const [jobs, setJobs] = useState<CareerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeApplyJob, setActiveApplyJob] = useState<{
    id: string;
    slug: string;
  } | null>(null);
  const [myApplication, setMyApplication] = useState<CareerApplication | null>(
    null,
  );
  const [messages, setMessages] = useState<CareerApplicationMessage[]>([]);
  const [applyCvFile, setApplyCvFile] = useState<File | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [chatDraft, setChatDraft] = useState("");

  const [applyBusy, setApplyBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const [applyPanelError, setApplyPanelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listCareerJobs({ locale: i18n.language });
        if (cancelled) return;
        setJobs(res);
      } catch (e) {
        if (cancelled) return;
        setJobs([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [i18n.language]);

  const hasJobs = jobs.length > 0;

  const values = useMemo(
    () => [
      {
        title: t("careersValue1Title"),
        body: t("careersValue1Body"),
      },
      {
        title: t("careersValue2Title"),
        body: t("careersValue2Body"),
      },
      {
        title: t("careersValue3Title"),
        body: t("careersValue3Body"),
      },
    ],
    [t],
  );

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("careersPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("careersPageSubtitle")}
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {values.map((v) => (
            <div
              key={v.title}
              className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
            >
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {v.title}
              </h2>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {v.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("careersOpeningsTitle")}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {t("careersOpeningsSubtitle")}
              </p>
            </div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {loading
                ? t("loading")
                : hasJobs
                  ? t("careersCount", { count: jobs.length })
                  : ""}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          )}

          {!loading && !error && !hasJobs && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <div className="font-semibold">{t("careersNoOpeningsTitle")}</div>
              <div className="mt-1 text-zinc-600 dark:text-zinc-300">
                {t("careersNoOpeningsBody")}
              </div>
              <div className="mt-3">
                <a
                  href="mailto:support@docspot.app"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                >
                  support@docspot.app
                </a>
              </div>
            </div>
          )}

          {hasJobs && (
            <div className="mt-4 grid gap-3">
              {jobs.map((job) => {
                const badges = toBadgeValues(job);

                return (
                  <details
                    key={job.id}
                    className="group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm transition-colors dark:border-zinc-800/70 dark:bg-zinc-950"
                  >
                    <summary className="cursor-pointer list-none px-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900 [&::-webkit-details-marker]:hidden">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                            {job.title ?? job.slug}
                          </div>
                          {job.summary && (
                            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                              {job.summary}
                            </div>
                          )}

                          {badges.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {badges.map((b) => (
                                <span
                                  key={b}
                                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="shrink-0 pt-1 text-xs font-semibold text-brand-700 dark:text-brand-300">
                          {t("careersViewDetails")}
                        </div>
                      </div>
                    </summary>

                    <div className="border-t border-zinc-200/70 px-5 py-4 dark:border-zinc-800/70">
                      {job.description && (
                        <div>
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                            {t("careersDescription")}
                          </h3>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                            {job.description}
                          </div>
                        </div>
                      )}

                      {job.responsibilities && (
                        <div className="mt-5">
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                            {t("careersResponsibilities")}
                          </h3>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                            {job.responsibilities}
                          </div>
                        </div>
                      )}

                      {job.requirements && (
                        <div className="mt-5">
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                            {t("careersRequirements")}
                          </h3>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                            {job.requirements}
                          </div>
                        </div>
                      )}

                      {job.benefits && (
                        <div className="mt-5">
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                            {t("careersBenefits")}
                          </h3>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                            {job.benefits}
                          </div>
                        </div>
                      )}

                      <div className="mt-6 rounded-2xl border border-brand-500/20 bg-brand-600/5 p-4 dark:border-brand-400/20 dark:bg-brand-400/10">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {t("careersApplyTitle")}
                        </div>
                        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          {t("careersApplyBody")}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              authRequired.requireAuth(async () => {
                                setApplyPanelError(null);
                                setApplyBusy(false);
                                setChatBusy(false);
                                setApplyCvFile(null);
                                setApplyMessage("");
                                setChatDraft("");
                                setMessages([]);
                                setMyApplication(null);
                                setActiveApplyJob({
                                  id: job.id,
                                  slug: job.slug,
                                });

                                try {
                                  const existing =
                                    await getMyCareerApplicationForJob({
                                      slug: job.slug,
                                    });

                                  if (existing) {
                                    const msgs =
                                      await listCareerApplicationMessages({
                                        applicationId: existing.id,
                                      });
                                    setMessages(msgs);
                                  } else {
                                    setMessages([]);
                                  }

                                  setMyApplication(existing);
                                } catch (e) {
                                  setApplyPanelError(
                                    e instanceof Error ? e.message : String(e),
                                  );
                                }
                              });
                            }}
                            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                          >
                            {t("careersApplyInAppButton")}
                          </button>

                          {job.applyUrl && (
                            <a
                              href={job.applyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                            >
                              {t("careersApplyButton")}
                            </a>
                          )}

                          {job.applyEmail && (
                            <a
                              href={`mailto:${job.applyEmail}`}
                              className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                            >
                              {job.applyEmail}
                            </a>
                          )}

                          {!job.applyUrl && !job.applyEmail && (
                            <a
                              href="mailto:support@docspot.app"
                              className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                            >
                              support@docspot.app
                            </a>
                          )}
                        </div>

                        {activeApplyJob?.id === job.id && (
                          <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-4 dark:border-zinc-800/70 dark:bg-zinc-950">
                            <div className="flex items-start justify-between gap-3">
                              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {myApplication
                                  ? t("careersAppliedTitle")
                                  : t("careersApplyInAppTitle")}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveApplyJob(null);
                                  setApplyPanelError(null);
                                  setApplyCvFile(null);
                                  setApplyMessage("");
                                  setChatDraft("");
                                  setMessages([]);
                                  setMyApplication(null);
                                }}
                                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                              >
                                {t("close")}
                              </button>
                            </div>

                            {applyPanelError && (
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                                {applyPanelError}
                              </div>
                            )}

                            {!myApplication && (
                              <div className="mt-4 grid gap-3">
                                <label className="grid gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                  {t("careersCvLabel")}
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      setApplyCvFile(file);
                                    }}
                                    className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-900 dark:file:text-zinc-50 dark:hover:file:bg-zinc-800"
                                  />
                                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                    {t("careersCvHint", { maxMb: 10 })}
                                  </span>
                                </label>

                                <label className="grid gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                  {t("careersMessageLabel")}
                                  <textarea
                                    value={applyMessage}
                                    onChange={(e) =>
                                      setApplyMessage(e.target.value)
                                    }
                                    rows={4}
                                    className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                                    placeholder={t("careersMessagePlaceholder")}
                                  />
                                </label>

                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={applyBusy}
                                    onClick={async () => {
                                      if (!activeApplyJob) return;

                                      const file = applyCvFile;
                                      if (!file) {
                                        setApplyPanelError(
                                          t("careersCvRequired"),
                                        );
                                        return;
                                      }
                                      if (file.size > 10 * 1024 * 1024) {
                                        setApplyPanelError(
                                          t("fileTooLargeError", { maxMb: 10 }),
                                        );
                                        return;
                                      }

                                      const msg = applyMessage.trim();
                                      if (!msg) {
                                        setApplyPanelError(
                                          t("careersMessageRequired"),
                                        );
                                        return;
                                      }

                                      setApplyBusy(true);
                                      setApplyPanelError(null);

                                      try {
                                        const contentType =
                                          file.type ||
                                          "application/octet-stream";
                                        const filename = file.name || "cv";

                                        const presign =
                                          await presignDriveUpload({
                                            filename,
                                            contentType,
                                            sizeBytes: file.size,
                                          });

                                        const putRes = await fetch(
                                          presign.url,
                                          {
                                            method: "PUT",
                                            headers: {
                                              "Content-Type": contentType,
                                            },
                                            body: file,
                                          },
                                        );
                                        if (!putRes.ok) {
                                          throw new Error(
                                            `Upload failed (${putRes.status})`,
                                          );
                                        }

                                        await confirmDriveUpload({
                                          key: presign.key,
                                        });

                                        const created = await applyToCareerJob({
                                          slug: activeApplyJob.slug,
                                          cvKey: presign.key,
                                          cvFilename: filename,
                                          cvContentType: contentType,
                                          message: msg,
                                        });

                                        const msgs =
                                          await listCareerApplicationMessages({
                                            applicationId: created.id,
                                          });
                                        setMessages(msgs);
                                        setMyApplication(created);
                                        setApplyCvFile(null);
                                        setApplyMessage("");
                                      } catch (e) {
                                        setApplyPanelError(
                                          e instanceof Error
                                            ? e.message
                                            : String(e),
                                        );
                                      } finally {
                                        setApplyBusy(false);
                                      }
                                    }}
                                    className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                                  >
                                    {applyBusy
                                      ? t("loading")
                                      : t("careersApplySubmit")}
                                  </button>
                                </div>
                              </div>
                            )}

                            {myApplication && (
                              <div className="mt-4">
                                {(() => {
                                  const rawLimit = Number(
                                    myApplication.userMessageLimit,
                                  );
                                  const limit = Number.isFinite(rawLimit)
                                    ? Math.max(0, Math.trunc(rawLimit))
                                    : 5;
                                  const sent = messages.filter(
                                    (m) => m.senderRole === "user",
                                  ).length;
                                  const canSend = sent < limit;

                                  return (
                                    <>
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                                          {t("careersChatTitle")}
                                        </div>
                                        <button
                                          type="button"
                                          disabled={
                                            chatBusy ||
                                            chatRefreshing ||
                                            !myApplication
                                          }
                                          onClick={async () => {
                                            if (!myApplication) return;

                                            setChatRefreshing(true);
                                            setApplyPanelError(null);
                                            try {
                                              const msgs =
                                                await listCareerApplicationMessages(
                                                  {
                                                    applicationId:
                                                      myApplication.id,
                                                  },
                                                );
                                              setMessages(msgs);
                                            } catch (e) {
                                              setApplyPanelError(
                                                e instanceof Error
                                                  ? e.message
                                                  : String(e),
                                              );
                                            } finally {
                                              setChatRefreshing(false);
                                            }
                                          }}
                                          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 disabled:opacity-60 dark:text-zinc-300 dark:hover:text-zinc-100"
                                        >
                                          {chatRefreshing
                                            ? t("loading")
                                            : "Refresh"}
                                        </button>
                                      </div>
                                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        {t("careersChatLimit", {
                                          count: limit,
                                        })}
                                      </div>

                                      <div className="mt-2 max-h-60 overflow-auto rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                                        {messages.length === 0 ? (
                                          <div className="text-zinc-500 dark:text-zinc-400">
                                            {t("careersChatEmpty")}
                                          </div>
                                        ) : (
                                          <div className="grid gap-2">
                                            {messages.map((m) => {
                                              const mine =
                                                m.senderRole === "user";
                                              return (
                                                <div
                                                  key={m.id}
                                                  className={
                                                    mine
                                                      ? "text-right"
                                                      : "text-left"
                                                  }
                                                >
                                                  <span
                                                    className={
                                                      mine
                                                        ? "inline-block max-w-[85%] rounded-2xl bg-brand-600 px-3 py-2 text-white"
                                                        : "inline-block max-w-[85%] rounded-2xl bg-zinc-100 px-3 py-2 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                                                    }
                                                  >
                                                    {m.message}
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <div className="mt-3 flex gap-2">
                                        <input
                                          value={chatDraft}
                                          onChange={(e) =>
                                            setChatDraft(e.target.value)
                                          }
                                          placeholder={t(
                                            "careersChatPlaceholder",
                                          )}
                                          disabled={chatBusy || !canSend}
                                          className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-brand-700 dark:focus:ring-brand-900"
                                        />
                                        <button
                                          type="button"
                                          disabled={chatBusy || !canSend}
                                          onClick={async () => {
                                            if (!myApplication) return;
                                            const trimmed = chatDraft.trim();
                                            if (!trimmed) return;

                                            if (!canSend) return;

                                            setChatBusy(true);
                                            setApplyPanelError(null);
                                            try {
                                              const created =
                                                await sendCareerApplicationMessage(
                                                  {
                                                    applicationId:
                                                      myApplication.id,
                                                    message: trimmed,
                                                  },
                                                );
                                              setMessages((prev) => [
                                                ...prev,
                                                created,
                                              ]);
                                              setChatDraft("");
                                            } catch (e) {
                                              setApplyPanelError(
                                                e instanceof Error
                                                  ? e.message
                                                  : String(e),
                                              );
                                            } finally {
                                              setChatBusy(false);
                                            }
                                          }}
                                          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
                                        >
                                          {chatBusy
                                            ? t("loading")
                                            : t("careersChatSend")}
                                        </button>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />

      {authRequired.modal}
    </div>
  );
}
