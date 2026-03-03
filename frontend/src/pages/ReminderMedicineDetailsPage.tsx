import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Check,
  Pill,
  TrendingUp,
  X,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  getMedicineById,
  getMedicineUpcoming,
  getReminderSettings,
  getTodayTimeline,
  listMedicineHistory,
  listSchedules,
  type IntakeEventRecord,
  type MedicineRecord,
  type ReminderSettings,
  type ScheduleRecord,
  type UpcomingIntakeItem,
} from "../shared/api/reminders";
import { useAuthState } from "../shared/firebase/useAuthState";

function formatLocalTime(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return isoUtc;
  }
}

function formatLocalDate(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return d.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return isoUtc;
  }
}

function prettyInstruction(tag: string | null | undefined): string | null {
  if (!tag || tag === "none") return null;
  return tag.replace(/_/g, " ");
}

function statusPill(status: string): { label: string; cls: string } {
  if (status === "taken") {
    return {
      label: "Taken",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }
  if (status === "missed") {
    return {
      label: "Missed",
      cls: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
    };
  }
  if (status === "skipped") {
    return {
      label: "Skipped",
      cls: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200",
    };
  }
  return {
    label: "Pending",
    cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
  };
}

function computeMissedStatus(params: {
  event: IntakeEventRecord;
  nowMs: number;
  graceMs: number;
}): IntakeEventRecord["status"] | "missed" {
  if (params.event.status !== "pending") return params.event.status;
  const at = new Date(params.event.datetimeUtc).getTime();
  if (!Number.isFinite(at)) return params.event.status;
  return params.nowMs > at + params.graceMs ? "missed" : "pending";
}

function scheduleSummary(schedules: ScheduleRecord[]): string {
  if (schedules.length === 0) return "";
  const s = schedules[0];
  const times = (s.times ?? []).map((t) => t.slice(0, 5)).join(", ");
  if (s.repeatType === "daily") return `Daily at ${times}`;
  if (s.repeatType === "once") return `Once at ${times}`;
  if (s.repeatType === "weekly") return `Weekly at ${times}`;
  if (s.repeatType === "interval")
    return `Every ${s.intervalValue ?? "?"} days at ${times}`;
  return `${s.repeatType} at ${times}`;
}

export default function ReminderMedicineDetailsPage() {
  const { t } = useTranslation();
  const { configured, loading: authLoading, user } = useAuthState();
  const { id } = useParams();

  const canUse = configured && !authLoading && !!user;
  const medicineId = id ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [medicine, setMedicine] = useState<MedicineRecord | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [todayTimeline, setTodayTimeline] = useState<UpcomingIntakeItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingIntakeItem[]>([]);
  const [history7, setHistory7] = useState<IntakeEventRecord[]>([]);
  const [history30, setHistory30] = useState<IntakeEventRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!canUse || !medicineId) {
      setLoading(false);
      setError(null);
      setMedicine(null);
      setSchedules([]);
      setTodayTimeline([]);
      setUpcoming([]);
      setHistory7([]);
      setHistory30([]);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const [s, med, sch, today, up, h7, h30] = await Promise.all([
        getReminderSettings(),
        getMedicineById(medicineId),
        listSchedules(medicineId),
        getTodayTimeline(),
        getMedicineUpcoming({ medicineId, daysAhead: 7, limit: 50 }),
        listMedicineHistory({ medicineId, limit: 200, offset: 0, days: 7 }),
        listMedicineHistory({ medicineId, limit: 500, offset: 0, days: 30 }),
      ]);

      if (cancelled) return;
      setSettings(s);
      setMedicine(med);
      setSchedules(sch);
      setTodayTimeline(today as any);
      setUpcoming(up);
      setHistory7(h7);
      setHistory30(h30);
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
  }, [canUse, medicineId]);

  const derived = useMemo(() => {
    const nowMs = Date.now();
    const graceMs = (settings?.reminderGraceMinutes ?? 60) * 60_000;

    const nextDose = upcoming[0] ?? null;
    const upcoming3 = upcoming.slice(0, 3);

    const todays = (todayTimeline as any as UpcomingIntakeItem[]).filter(
      (e) => e.medicineId === medicineId,
    );

    const todayTotal = todays.length;
    const todayTaken = todays.filter((e) => e.status === "taken").length;
    const todayMissed = todays.filter(
      (e) => computeMissedStatus({ event: e, nowMs, graceMs }) === "missed",
    ).length;

    const denom7 = history7.filter(
      (e) =>
        e.status === "taken" || e.status === "missed" || e.status === "skipped",
    );
    const taken7 = denom7.filter((e) => e.status === "taken").length;
    const adherence7 = denom7.length
      ? Math.round((taken7 / denom7.length) * 100)
      : 0;

    const denom30 = history30.filter(
      (e) =>
        e.status === "taken" || e.status === "missed" || e.status === "skipped",
    );
    const taken30 = denom30.filter((e) => e.status === "taken").length;
    const missed30 = denom30.filter((e) => e.status === "missed").length;
    const takenPct30 = denom30.length
      ? Math.round((taken30 / denom30.length) * 100)
      : 0;
    const missedPct30 = denom30.length
      ? Math.round((missed30 / denom30.length) * 100)
      : 0;

    return {
      nextDose,
      upcoming3,
      todayTotal,
      todayTaken,
      todayMissed,
      adherence7,
      total30: denom30.length,
      takenPct30,
      missedPct30,
    };
  }, [upcoming, todayTimeline, history7, history30, settings, medicineId]);

  const inventory = useMemo(() => {
    if (!medicine) return null;

    const remaining = medicine.stockRemaining;
    const total = medicine.stockTotal;
    const low = medicine.lowStockThreshold ?? 5;

    if (typeof remaining !== "number") return { mode: "unset" as const };

    const pct =
      typeof total === "number" && total > 0
        ? Math.min(100, Math.round((remaining / total) * 100))
        : null;

    if (remaining <= 0)
      return { mode: "out" as const, pct, remaining, total, low };
    if (remaining <= low)
      return { mode: "low" as const, pct, remaining, total, low };
    return { mode: "ok" as const, pct, remaining, total, low };
  }, [medicine]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/reminder/medicines"
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("Medicines")}
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight">
                {medicine?.name ?? t("Medicine")}
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {medicine
                ? `${t("Dose")}: ${medicine.dosePerIntake}`
                : t("Loading...")}
              {medicine?.doseUnit ? ` ${medicine.doseUnit}` : ""}
              {prettyInstruction(medicine?.instructionTag)
                ? ` · ${prettyInstruction(medicine?.instructionTag)}`
                : ""}
            </p>
          </div>

          <Link
            to="/reminder/add"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Pill className="h-4 w-4" />
            {t("Add")}
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
        ) : !medicine ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-base font-semibold">{t("Not found")}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("This medicine is not available.")}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                  <span className="text-base font-bold">
                    {(medicine.name || "M").slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">
                        {medicine.name}
                      </div>
                      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        {t("Type")}: {medicine.type}
                      </div>
                    </div>
                    <span
                      className={
                        "rounded-full border px-2.5 py-1 text-xs font-semibold " +
                        (medicine.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200")
                      }
                    >
                      {medicine.isActive ? t("Active") : t("Paused")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarClock className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("Schedule")}
                </div>
                <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {scheduleSummary(schedules) || t("No schedule")}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("Next dose")}
                </div>
                {derived.nextDose ? (
                  <div className="mt-2">
                    <div className="text-lg font-semibold">
                      {formatLocalTime(derived.nextDose.datetimeUtc)}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {formatLocalDate(derived.nextDose.datetimeUtc)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("No upcoming doses")}
                  </div>
                )}

                {derived.upcoming3.length > 0 ? (
                  <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {derived.upcoming3.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>{formatLocalDate(e.datetimeUtc)}</span>
                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {formatLocalTime(e.datetimeUtc)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{t("Inventory")}</div>
                {inventory?.mode === "low" ? (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    {t("Refill soon")}
                  </span>
                ) : inventory?.mode === "out" ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {t("Out of stock")}
                  </span>
                ) : null}
              </div>

              {inventory?.mode === "unset" ? (
                <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("Stock not set")}
                </div>
              ) : (
                <div className="mt-3">
                  {typeof inventory?.pct === "number" ? (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className={
                          "h-2 rounded-full " +
                          (inventory.mode === "out"
                            ? "bg-red-600"
                            : inventory.mode === "low"
                              ? "bg-amber-600"
                              : "bg-emerald-600")
                        }
                        style={{ width: `${inventory.pct}%` }}
                      />
                    </div>
                  ) : null}

                  <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("Remaining")}: {inventory?.remaining}
                    {typeof inventory?.total === "number"
                      ? ` ${t("of")} ${inventory.total}`
                      : ""}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{t("Today")}</div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("Taken")}: {derived.todayTaken}/{derived.todayTotal}
                    {derived.todayMissed > 0
                      ? ` · ${derived.todayMissed} ${t("missed")}`
                      : ""}
                  </div>
                </div>

                {derived.todayMissed > 0 ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                    {t("Missed today")}
                  </span>
                ) : derived.todayTotal > 0 ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {t("On track")}
                  </span>
                ) : (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200">
                    {t("No doses today")}
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                {t("Adherence")}
              </div>
              <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {t("7-day adherence")}: {derived.adherence7}%
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-brand-600"
                  style={{ width: `${derived.adherence7}%` }}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {t("Last 30 days")}
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {derived.total30} {t("doses")}
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {t("Taken")}
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {derived.takenPct30}%
                  </div>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {t("Missed")}
                  </div>
                  <div className="mt-1 text-base font-semibold">
                    {derived.missedPct30}%
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="text-sm font-semibold">{t("History")}</div>
              <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                {history30.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("No history yet")}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {history30.map((e) => {
                      const pill = statusPill(e.status);
                      return (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-3 p-4"
                        >
                          <div>
                            <div className="text-sm font-semibold">
                              {formatLocalDate(e.datetimeUtc)} ·{" "}
                              {formatLocalTime(e.datetimeUtc)}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                              {e.status === "taken" ? (
                                <span className="inline-flex items-center gap-2">
                                  <Check className="h-4 w-4" /> {t("Taken")}
                                </span>
                              ) : e.status === "skipped" ? (
                                <span className="inline-flex items-center gap-2">
                                  <X className="h-4 w-4" /> {t("Skipped")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-2">
                                  <X className="h-4 w-4" /> {t("Missed")}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={
                              "rounded-full border px-2.5 py-1 text-xs font-semibold " +
                              pill.cls
                            }
                          >
                            {t(pill.label)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!canUse ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {t("Please sign in to view this medicine.")}
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
