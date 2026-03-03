import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

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
  archiveMedicine,
  listMedicineActivityLogs,
  listMedicineHistory,
  listSchedules,
  markIntakeSkipped,
  markIntakeTaken,
  updateMedicine,
  type IntakeEventRecord,
  type MedicineActivityLog,
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

function formatActionLabel(action: string): string {
  const cleaned = String(action || "")
    .replace(/[._]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Activity";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatLocalDateTime(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    const date = d.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  } catch {
    return isoUtc;
  }
}

export default function ReminderMedicineDetailsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { configured, loading: authLoading, user } = useAuthState();
  const { id } = useParams();

  const patientId = useMemo(() => {
    const raw = new URLSearchParams(location.search).get("patientId");
    return raw && raw.trim() ? raw.trim() : null;
  }, [location.search]);

  const patientQuery = useMemo(() => {
    return patientId ? `?patientId=${encodeURIComponent(patientId)}` : "";
  }, [patientId]);

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

  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<MedicineActivityLog[]>([]);
  const [logsTotalCapped, setLogsTotalCapped] = useState<number>(0);
  const [logsOffset, setLogsOffset] = useState<number>(0);
  const logsLimit = 25;

  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const [intakeBusyById, setIntakeBusyById] = useState<Record<string, boolean>>(
    {},
  );

  async function refreshCore() {
    if (!canUse || !medicineId) return;
    const [med, up, today] = await Promise.all([
      getMedicineById(medicineId, patientId),
      getMedicineUpcoming({ medicineId, daysAhead: 7, limit: 50, patientId }),
      getTodayTimeline({ patientId }),
    ]);
    setMedicine(med);
    setUpcoming(up);
    setTodayTimeline(today as any);
  }

  const [draftName, setDraftName] = useState("");
  const [draftDosePerIntake, setDraftDosePerIntake] = useState<string>("");
  const [draftDoseUnit, setDraftDoseUnit] = useState<string>("");
  const [draftInstructionTag, setDraftInstructionTag] =
    useState<MedicineRecord["instructionTag"]>("none");
  const [draftNote, setDraftNote] = useState<string>("");
  const [draftStockRemaining, setDraftStockRemaining] = useState<string>("");
  const [draftLowStockThreshold, setDraftLowStockThreshold] =
    useState<string>("");

  useEffect(() => {
    if (!medicine || editOpen) return;
    setDraftName(medicine.name ?? "");
    setDraftDosePerIntake(String(medicine.dosePerIntake ?? ""));
    setDraftDoseUnit(medicine.doseUnit ?? "");
    setDraftInstructionTag(medicine.instructionTag ?? "none");
    setDraftNote(medicine.note ?? "");
    setDraftStockRemaining(
      medicine.stockRemaining == null ? "" : String(medicine.stockRemaining),
    );
    setDraftLowStockThreshold(
      medicine.lowStockThreshold == null
        ? ""
        : String(medicine.lowStockThreshold),
    );
  }, [editOpen, medicine]);

  async function onDelete() {
    if (!canUse || !medicineId) return;
    const ok = window.confirm(
      t("Delete this medicine? This will remove upcoming reminders."),
    );
    if (!ok) return;
    setEditBusy(true);
    try {
      await archiveMedicine(medicineId, patientId);
      navigate(`/reminder/medicines${patientQuery}`, {
        replace: true,
        state: { deleted: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!canUse || !medicineId) return;
    const name = draftName.trim();
    if (!name) return;

    const dosePerIntake = Number(draftDosePerIntake);
    if (!Number.isFinite(dosePerIntake) || dosePerIntake <= 0) return;

    const low = draftLowStockThreshold.trim()
      ? Number(draftLowStockThreshold)
      : undefined;
    if (low !== undefined && (!Number.isFinite(low) || low < 0)) return;

    const stockRemaining = draftStockRemaining.trim()
      ? Number(draftStockRemaining)
      : null;
    if (
      stockRemaining != null &&
      (!Number.isFinite(stockRemaining) || stockRemaining < 0)
    )
      return;

    setEditBusy(true);
    setError(null);
    try {
      const updated = await updateMedicine(
        medicineId,
        {
          name,
          dosePerIntake,
          doseUnit: draftDoseUnit.trim() ? draftDoseUnit.trim() : null,
          instructionTag: draftInstructionTag,
          note: draftNote.trim() ? draftNote.trim() : null,
          stockRemaining,
          lowStockThreshold: low,
        },
        patientId,
      );
      setMedicine(updated);
      setEditOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  }

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
        getReminderSettings(patientId),
        getMedicineById(medicineId, patientId),
        listSchedules(medicineId, patientId),
        getTodayTimeline({ patientId }),
        getMedicineUpcoming({
          medicineId,
          daysAhead: 7,
          limit: 50,
          patientId,
        }),
        listMedicineHistory({
          medicineId,
          limit: 200,
          offset: 0,
          days: 7,
          patientId,
        }),
        listMedicineHistory({
          medicineId,
          limit: 500,
          offset: 0,
          days: 30,
          patientId,
        }),
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
  }, [canUse, medicineId, patientId]);

  async function onMarkTaken(id: string) {
    if (!canUse) return;
    setIntakeBusyById((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await markIntakeTaken(id, patientId);
      await refreshCore();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIntakeBusyById((p) => ({ ...p, [id]: false }));
    }
  }

  async function onMarkSkipped(id: string) {
    if (!canUse) return;
    setIntakeBusyById((p) => ({ ...p, [id]: true }));
    setError(null);
    try {
      await markIntakeSkipped({ intakeEventId: id, reason: "", patientId });
      await refreshCore();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIntakeBusyById((p) => ({ ...p, [id]: false }));
    }
  }

  useEffect(() => {
    if (!logsOpen) return;
    if (!canUse || !medicineId) return;

    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);

    (async () => {
      const res = await listMedicineActivityLogs({
        medicineId,
        patientId,
        limit: logsLimit,
        offset: logsOffset,
      });
      if (cancelled) return;
      setLogs(res.logs);
      setLogsTotalCapped(res.totalCapped);
    })()
      .catch((e) => {
        if (cancelled) return;
        setLogsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLogsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canUse, logsLimit, logsOffset, logsOpen, medicineId, patientId]);

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
                to={`/reminder/medicines${patientQuery}`}
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
            to={`/reminder/medicines${patientQuery}`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            <Pill className="h-4 w-4" />
            {t("Medicines")}
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!medicine) return;
                  setDraftName(medicine.name ?? "");
                  setDraftDosePerIntake(String(medicine.dosePerIntake ?? ""));
                  setDraftDoseUnit(medicine.doseUnit ?? "");
                  setDraftInstructionTag(medicine.instructionTag ?? "none");
                  setDraftNote(medicine.note ?? "");
                  setDraftStockRemaining(
                    medicine.stockRemaining == null
                      ? ""
                      : String(medicine.stockRemaining),
                  );
                  setDraftLowStockThreshold(
                    medicine.lowStockThreshold == null
                      ? ""
                      : String(medicine.lowStockThreshold),
                  );
                  setEditOpen(true);
                }}
                disabled={editBusy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                {t("Edit")}
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={editBusy}
                className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t("Delete")}
              </button>
            </div>

            {editOpen ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">
                      {t("Edit medicine")}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("Update name, dose, unit, stock, and notes.")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {t("Close")}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <div className="text-sm font-semibold">{t("Name")}</div>
                    <input
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-semibold">
                      {t("Default dose")}
                    </div>
                    <input
                      value={draftDosePerIntake}
                      onChange={(e) => setDraftDosePerIntake(e.target.value)}
                      type="number"
                      min={0.1}
                      step={0.5}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-semibold">{t("Unit")}</div>
                    <input
                      value={draftDoseUnit}
                      onChange={(e) => setDraftDoseUnit(e.target.value)}
                      placeholder={t("e.g., piece, ml")}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-semibold">
                      {t("Stock remaining")}
                    </div>
                    <input
                      value={draftStockRemaining}
                      onChange={(e) => setDraftStockRemaining(e.target.value)}
                      type="number"
                      min={0}
                      step={1}
                      placeholder={t("Optional")}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="block">
                    <div className="text-sm font-semibold">
                      {t("Low stock threshold")}
                    </div>
                    <input
                      value={draftLowStockThreshold}
                      onChange={(e) =>
                        setDraftLowStockThreshold(e.target.value)
                      }
                      type="number"
                      min={0}
                      step={1}
                      placeholder={t("Optional")}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <div className="text-sm font-semibold">
                      {t("Instructions")}
                    </div>
                    <select
                      value={draftInstructionTag}
                      onChange={(e) =>
                        setDraftInstructionTag(e.target.value as any)
                      }
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <option value="none">{t("None")}</option>
                      <option value="before_meal">{t("Before meal")}</option>
                      <option value="after_meal">{t("After meal")}</option>
                      <option value="with_food">{t("With food")}</option>
                      <option value="empty_stomach">
                        {t("Empty stomach")}
                      </option>
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <div className="text-sm font-semibold">{t("Note")}</div>
                    <textarea
                      value={draftNote}
                      onChange={(e) => setDraftNote(e.target.value)}
                      rows={3}
                      placeholder={t("Optional")}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </label>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void onSaveEdit()}
                    disabled={editBusy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {editBusy ? t("Saving...") : t("Save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    disabled={editBusy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <X className="h-4 w-4" />
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            ) : null}

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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onMarkTaken(derived.nextDose!.id)}
                        disabled={!!intakeBusyById[derived.nextDose.id]}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        {t("Taken")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onMarkSkipped(derived.nextDose!.id)}
                        disabled={!!intakeBusyById[derived.nextDose.id]}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        {t("Skip")}
                      </button>
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

            <details
              className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              open={logsOpen}
              onToggle={(e) => {
                const next = (e.currentTarget as HTMLDetailsElement).open;
                setLogsOpen(next);
                if (next) setLogsOffset(0);
              }}
            >
              <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("Activity")}
                <span className="ml-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  ({Math.min(100, logsTotalCapped || 0)})
                </span>
              </summary>

              {logsError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                  {logsError}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-zinc-600 dark:text-zinc-300">
                  {logsTotalCapped > 0
                    ? `${logsOffset + 1}-${Math.min(logsOffset + logsLimit, logsTotalCapped)} ${t("of")} ${logsTotalCapped}`
                    : t("No activity yet")}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setLogsOffset((o) => Math.max(0, o - logsLimit))
                    }
                    disabled={logsLoading || logsOffset <= 0}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {t("Prev")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLogsOffset((o) =>
                        o + logsLimit >= logsTotalCapped ? o : o + logsLimit,
                      )
                    }
                    disabled={
                      logsLoading ||
                      logsTotalCapped === 0 ||
                      logsOffset + logsLimit >= logsTotalCapped
                    }
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {t("Next")}
                  </button>
                </div>
              </div>

              <div className="mt-3 max-h-[320px] overflow-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                {logsLoading ? (
                  <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("Loading...")}
                  </div>
                ) : logs.length === 0 ? (
                  <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("No activity yet")}
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {logs.map((l) => {
                      const actorLabel =
                        l.actor?.displayName?.trim() ||
                        l.actor?.email?.trim() ||
                        (l.actorUserId ? t("User") : t("System"));
                      return (
                        <div
                          key={l.id}
                          className="flex items-start justify-between gap-3 p-4"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {formatActionLabel(l.action)}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                              {actorLabel}
                            </div>
                          </div>
                          <div className="flex-none text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {formatLocalDateTime(l.createdAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>

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
