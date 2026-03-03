import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Check, Users, X } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  acceptCaregiverInvite,
  listCaregiverPatients,
  listCaregiverRequests,
  patchCaregiverAlias,
  rejectCaregiverInvite,
  type CaregiverPatientItem,
  type CaregiverRequestItem,
} from "../shared/api/reminders";
import { useAuthState } from "../shared/firebase/useAuthState";

function displayNameOrEmail(p: {
  displayName: string | null;
  email: string | null;
}): string {
  return p.displayName?.trim() || p.email?.trim() || "Unknown";
}

function patientQuery(patientId: string): string {
  return `?patientId=${encodeURIComponent(patientId)}`;
}

export default function ReminderCaregiverPage() {
  const { t } = useTranslation();
  const { configured, loading: authLoading, user } = useAuthState();

  const canUse = configured && !authLoading && !!user;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [requests, setRequests] = useState<CaregiverRequestItem[]>([]);
  const [patients, setPatients] = useState<CaregiverPatientItem[]>([]);

  const [busyPatientIds, setBusyPatientIds] = useState<Record<string, boolean>>(
    {},
  );

  const [aliasDraftByPatientId, setAliasDraftByPatientId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;

    if (!canUse) {
      setLoading(false);
      setError(null);
      setRequests([]);
      setPatients([]);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const [req, pats] = await Promise.all([
        listCaregiverRequests(),
        listCaregiverPatients(),
      ]);
      if (cancelled) return;
      setRequests(req);
      setPatients(pats);

      setAliasDraftByPatientId((prev) => {
        const next = { ...prev };
        for (const it of pats) {
          const pid = it.patient.id;
          if (typeof next[pid] === "string") continue;
          next[pid] = it.link.caregiverAlias ?? "";
        }
        return next;
      });
    })()
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
  }, [canUse]);

  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      const an = displayNameOrEmail(a.patient);
      const bn = displayNameOrEmail(b.patient);
      return an.localeCompare(bn);
    });
  }, [patients]);

  async function refresh() {
    if (!canUse) return;
    setLoading(true);
    setError(null);
    try {
      const [req, pats] = await Promise.all([
        listCaregiverRequests(),
        listCaregiverPatients(),
      ]);
      setRequests(req);
      setPatients(pats);
      setAliasDraftByPatientId((prev) => {
        const next = { ...prev };
        for (const it of pats) {
          const pid = it.patient.id;
          next[pid] = it.link.caregiverAlias ?? "";
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onAccept(patientId: string) {
    if (!canUse) return;
    setBusyPatientIds((p) => ({ ...p, [patientId]: true }));
    setError(null);
    try {
      await acceptCaregiverInvite(patientId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPatientIds((p) => ({ ...p, [patientId]: false }));
    }
  }

  async function onReject(patientId: string) {
    if (!canUse) return;
    setBusyPatientIds((p) => ({ ...p, [patientId]: true }));
    setError(null);
    try {
      await rejectCaregiverInvite(patientId);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPatientIds((p) => ({ ...p, [patientId]: false }));
    }
  }

  async function onSaveAlias(patientId: string) {
    if (!canUse) return;
    setBusyPatientIds((p) => ({ ...p, [patientId]: true }));
    setError(null);
    try {
      const raw = aliasDraftByPatientId[patientId] ?? "";
      const alias = raw.trim() ? raw.trim() : null;
      await patchCaregiverAlias({ patientId, alias });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyPatientIds((p) => ({ ...p, [patientId]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("Caregiver")}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("Requests and patients")}
            </p>
          </div>

          <Link
            to="/reminder"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            <Users className="h-4 w-4" />
            {t("Back")}
          </Link>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {t("Loading...")}
          </div>
        ) : null}

        <section className="mt-6">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Requests")}
          </div>

          {requests.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {t("No pending requests")}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {requests.map((it) => {
                const patient = it.patient;
                const pid = patient.id;
                const busy = !!busyPatientIds[pid];

                return (
                  <div
                    key={it.link.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                          {patient.photoUrl ? (
                            <img
                              src={patient.photoUrl}
                              alt={displayNameOrEmail(patient)}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">
                            {displayNameOrEmail(patient)}
                          </div>
                          {patient.email ? (
                            <div className="text-xs text-zinc-600 dark:text-zinc-300">
                              {patient.email}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void onReject(pid)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                        >
                          <X className="h-4 w-4" />
                          {t("Reject")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onAccept(pid)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                          {t("Accept")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("Patients")}
          </div>

          {sortedPatients.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {t("No patients yet")}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {sortedPatients.map((it) => {
                const patient = it.patient;
                const pid = patient.id;
                const busy = !!busyPatientIds[pid];
                const draft = aliasDraftByPatientId[pid] ?? "";

                return (
                  <div
                    key={it.link.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="h-11 w-11 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                          {patient.photoUrl ? (
                            <img
                              src={patient.photoUrl}
                              alt={displayNameOrEmail(patient)}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">
                            {displayNameOrEmail(patient)}
                          </div>
                          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                            {t("Access")}: {it.link.accessLevel ?? "view"}
                          </div>
                          {patient.email ? (
                            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                              {patient.email}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <Link
                        to={`/reminder${patientQuery(pid)}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        {t("Open")}
                      </Link>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <input
                        value={draft}
                        onChange={(e) =>
                          setAliasDraftByPatientId((p) => ({
                            ...p,
                            [pid]: e.target.value,
                          }))
                        }
                        placeholder={t("Custom name (optional)")}
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                      />
                      <button
                        type="button"
                        onClick={() => void onSaveAlias(pid)}
                        disabled={busy}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                      >
                        {t("Save")}
                      </button>
                    </div>

                    <div className="mt-3">
                      <Link
                        to={`/reminder/medicines${patientQuery(pid)}`}
                        className="text-sm font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-300"
                      >
                        {t("View medicines")}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
