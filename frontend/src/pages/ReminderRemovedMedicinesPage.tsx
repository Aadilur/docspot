import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { ArrowLeft, X } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  listRemovedMedicines,
  type RemovedMedicineRecord,
} from "../shared/api/reminders";
import { useAuthState } from "../shared/firebase/useAuthState";

function formatLocalDateTime(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return d.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoUtc;
  }
}

export default function ReminderRemovedMedicinesPage() {
  const { t } = useTranslation();
  const { configured, loading: authLoading, user } = useAuthState();
  const location = useLocation();

  const patientId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("patientId");
    return raw && raw.trim() ? raw.trim() : null;
  }, [location.search]);

  const patientQuery = useMemo(() => {
    return patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
  }, [patientId]);

  const canUse = configured && !authLoading && !!user;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<RemovedMedicineRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!canUse) {
      setLoading(false);
      setError(null);
      setRemoved([]);
      return;
    }

    setLoading(true);
    setError(null);

    listRemovedMedicines({ limit: 50, offset: 0, patientId })
      .then((items) => {
        if (cancelled) return;
        setRemoved(items);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canUse, patientId]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to={`/reminder${patientQuery}`}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("Today")}
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("Removed")}
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("Removed medicines (summary)")}
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <section className="mt-6">
          {loading ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {t("Loading...")}
            </div>
          ) : removed.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold">
                {t("No removed medicines")}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {t("Removed medicines will appear here.")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {removed.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
                      <X className="h-5 w-5" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {m.name}
                          </div>
                          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                            {t("Dose")}: {m.dosePerIntake}
                            {m.doseUnit ? ` ${m.doseUnit}` : ""} · {m.type}
                          </div>
                        </div>

                        <span className="flex-none rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {formatLocalDateTime(m.removedAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {!canUse ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {t("Please sign in to view removed medicines.")}
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
