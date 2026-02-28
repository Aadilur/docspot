import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { ExternalLink, ShieldAlert } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  getSharedInvoiceGroup,
  type InvoiceAttachment,
  type InvoiceGroup,
  type InvoiceReport,
} from "../shared/api/invoices";

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type ReportWithAttachments = InvoiceReport & {
  attachments: InvoiceAttachment[];
};

export default function SharedInvoiceGroupPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<InvoiceGroup | null>(null);
  const [reports, setReports] = useState<ReportWithAttachments[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const at = new Date(a.createdAt).getTime();
      const bt = new Date(b.createdAt).getTime();
      return bt - at;
    });
  }, [reports]);

  useEffect(() => {
    if (!token) return;

    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await getSharedInvoiceGroup(token);
        if (!mountedRef.current) return;
        setGroup(res.group);
        setReports(res.reports);
        setExpiresAt(res.expiresAt);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-6">
        <section className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <ShieldAlert
                className="h-5 w-5 text-zinc-600 dark:text-zinc-300"
                aria-hidden="true"
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("sharedView")}
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {expiresAt
                  ? t("linkExpiresAt", { value: formatDateTime(expiresAt) })
                  : t("shareHint")}
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
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
              <div className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {t("invoiceDetails")}
              </div>
              <div className="mt-2 truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {group.title || sortedReports[0]?.title || t("invoiceDetails")}
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {t("reportsCount", { count: sortedReports.length })}
              </div>
            </section>

            <section className="mt-5 grid gap-4">
              {sortedReports.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
                >
                  <div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {r.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {t("updatedAt", { value: formatDateTime(r.updatedAt) })}
                  </div>

                  <div className="mt-3 grid gap-1 text-sm text-zinc-700 dark:text-zinc-200">
                    <div>
                      <span className="font-semibold">{t("issueDate")}:</span>{" "}
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
    </div>
  );
}
