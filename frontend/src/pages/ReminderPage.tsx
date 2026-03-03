import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { BellRing, Check, Plus, RefreshCw, X } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  getReminderSettings,
  getTodayTimeline,
  listMedicines,
  markIntakeSkipped,
  markIntakeTaken,
  type MedicineRecord,
  type ReminderSettings,
  type TimelineItem,
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

function statusLabel(status: string): string {
  if (status === "taken") return "Taken";
  if (status === "missed") return "Missed";
  if (status === "skipped") return "Skipped";
  return "Pending";
}

function statusClasses(status: string): string {
  if (status === "taken") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "missed") {
    return "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200";
  }
  if (status === "skipped") {
    return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200";
  }
  return "border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-900/50 dark:bg-brand-950/30 dark:text-brand-200";
}

function extractDoseFromMetadata(metadata: unknown): {
  doseAmount: number | null;
  doseUnit: string | null;
} {
  if (!metadata || typeof metadata !== "object") {
    return { doseAmount: null, doseUnit: null };
  }
  const m = metadata as Record<string, unknown>;
  const rawAmount = m.doseAmount;
  const rawUnit = m.doseUnit;
  const doseAmount =
    typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount > 0
      ? rawAmount
      : null;
  const doseUnit =
    typeof rawUnit === "string" && rawUnit.trim() ? rawUnit : null;
  return { doseAmount, doseUnit };
}

function formatDoseText(params: {
  item: TimelineItem;
  fallbackDose: number;
  fallbackUnit: string | null;
}): string {
  const { doseAmount, doseUnit } = extractDoseFromMetadata(
    params.item.metadata,
  );
  const amount = doseAmount ?? params.fallbackDose;
  const unit = doseUnit ?? params.fallbackUnit;
  return `${amount}${unit ? ` ${unit}` : ""}`;
}

type LocationState = { created?: boolean; timeline?: TimelineItem[] };

type EffectiveStatus = "pending" | "taken" | "missed" | "skipped";

type GroupedEvent = {
  groupTimeUtc: string;
  events: Array<TimelineItem & { effectiveStatus: EffectiveStatus }>;
  groupStatus: "pending" | "partial" | "taken" | "missed";
};

function computeEffectiveStatus(params: {
  item: TimelineItem;
  nowMs: number;
  graceMs: number;
}): EffectiveStatus {
  const status = params.item.status;
  if (status === "taken" || status === "skipped" || status === "missed") {
    return status;
  }
  const at = new Date(params.item.datetimeUtc).getTime();
  if (!Number.isFinite(at)) return "pending";
  return params.nowMs > at + params.graceMs ? "missed" : "pending";
}

function groupByTimeProximity(
  items: TimelineItem[],
  params: { nowMs: number; graceMs: number; windowMinutes: number },
): GroupedEvent[] {
  const sorted = [...items].sort((a, b) =>
    String(a.datetimeUtc).localeCompare(String(b.datetimeUtc)),
  );

  const groups: Array<
    Array<TimelineItem & { effectiveStatus: EffectiveStatus }>
  > = [];
  const windowMs = params.windowMinutes * 60_000;

  for (const item of sorted) {
    const enriched = {
      ...item,
      effectiveStatus: computeEffectiveStatus({
        item,
        nowMs: params.nowMs,
        graceMs: params.graceMs,
      }),
    };

    const lastGroup = groups[groups.length - 1];
    if (!lastGroup) {
      groups.push([enriched]);
      continue;
    }

    const groupStart = lastGroup[0];
    const startMs = new Date(groupStart.datetimeUtc).getTime();
    const curMs = new Date(enriched.datetimeUtc).getTime();

    if (
      Number.isFinite(startMs) &&
      Number.isFinite(curMs) &&
      curMs - startMs <= windowMs
    ) {
      lastGroup.push(enriched);
    } else {
      groups.push([enriched]);
    }
  }

  const toGroupStatus = (
    evs: Array<TimelineItem & { effectiveStatus: EffectiveStatus }>,
  ): GroupedEvent["groupStatus"] => {
    const statuses = evs.map((e) => e.effectiveStatus);
    const allCompleted = statuses.every(
      (s) => s === "taken" || s === "skipped",
    );
    if (allCompleted) return "taken";
    const allMissed = statuses.every((s) => s === "missed");
    if (allMissed) return "missed";

    const anyCompletedOrMissed = statuses.some(
      (s) => s === "taken" || s === "skipped" || s === "missed",
    );
    const anyPending = statuses.some((s) => s === "pending");
    if (anyCompletedOrMissed && anyPending) return "partial";
    if (statuses.some((s) => s === "missed")) return "partial";
    return "pending";
  };

  return groups.map((evs) => ({
    groupTimeUtc: evs[0]?.datetimeUtc ?? "",
    events: evs,
    groupStatus: toGroupStatus(evs),
  }));
}

function groupStatusBadge(
  t: (s: string) => string,
  status: GroupedEvent["groupStatus"],
): { label: string; cls: string } {
  if (status === "taken")
    return { label: t("Taken"), cls: statusClasses("taken") };
  if (status === "missed")
    return { label: t("Missed"), cls: statusClasses("missed") };
  if (status === "partial")
    return {
      label: t("Partial"),
      cls: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
    };
  return { label: t("Pending"), cls: statusClasses("pending") };
}

function pickDueGroup(
  groups: GroupedEvent[],
  nowMs: number,
): GroupedEvent | null {
  const dueWindowMs = 30 * 60_000;
  let best: { g: GroupedEvent; score: number } | null = null;

  for (const g of groups) {
    const tms = new Date(g.groupTimeUtc).getTime();
    if (!Number.isFinite(tms)) continue;
    if (Math.abs(nowMs - tms) > dueWindowMs) continue;
    if (!g.events.some((e) => e.effectiveStatus === "pending")) continue;

    const score = Math.abs(nowMs - tms);
    if (!best || score < best.score) best = { g, score };
  }

  return best?.g ?? null;
}

function excludeGroup(
  groups: GroupedEvent[],
  exclude: GroupedEvent | null,
): GroupedEvent[] {
  if (!exclude) return groups;
  const excludeIds = new Set(exclude.events.map((e) => e.id));
  return groups.filter((g) => g.events.some((e) => !excludeIds.has(e.id)));
}

export default function ReminderPage() {
  const { t } = useTranslation();
  const { configured, loading: authLoading, user } = useAuthState();
  const location = useLocation();

  const canUse = configured && !authLoading && !!user;
  const initial = (location.state as LocationState | null) ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>(
    initial?.timeline ?? [],
  );

  const [busyByEventId, setBusyByEventId] = useState<Record<string, boolean>>(
    {},
  );
  const [createdVisible, setCreatedVisible] = useState<boolean>(
    Boolean(initial?.created),
  );

  const medicinesById = useMemo(() => {
    const m = new Map<string, MedicineRecord>();
    for (const med of medicines) m.set(med.id, med);
    return m;
  }, [medicines]);

  async function refreshAll() {
    if (!canUse) return;
    setLoading(true);
    setError(null);

    try {
      const [s, items, meds] = await Promise.all([
        getReminderSettings(),
        getTodayTimeline(),
        listMedicines({ limit: 200, offset: 0, includeArchived: false }),
      ]);
      setSettings(s);
      setTimeline(items);
      setMedicines(meds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canUse) {
      setLoading(false);
      setTimeline([]);
      setMedicines([]);
      setSettings(null);
      return;
    }
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse]);

  useEffect(() => {
    if (!createdVisible) return;
    const tmr = window.setTimeout(() => setCreatedVisible(false), 2200);
    return () => window.clearTimeout(tmr);
  }, [createdVisible]);

  async function onTaken(id: string) {
    if (!canUse) return;
    setBusyByEventId((p) => ({ ...p, [id]: true }));
    try {
      await markIntakeTaken(id);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyByEventId((p) => ({ ...p, [id]: false }));
    }
  }

  async function onSkipped(id: string) {
    if (!canUse) return;
    setBusyByEventId((p) => ({ ...p, [id]: true }));
    try {
      await markIntakeSkipped({ intakeEventId: id, reason: "" });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyByEventId((p) => ({ ...p, [id]: false }));
    }
  }

  const grouped = useMemo(() => {
    const nowMs = Date.now();
    const graceMs = (settings?.reminderGraceMinutes ?? 60) * 60_000;
    return groupByTimeProximity(timeline, {
      nowMs,
      graceMs,
      windowMinutes: 10,
    });
  }, [timeline, settings]);

  const timelineSections = useMemo(() => {
    const nowMs = Date.now();
    const due = pickDueGroup(grouped, nowMs);

    const missedAll = grouped.filter((g) =>
      g.events.some((e) => e.effectiveStatus === "missed"),
    );
    const upcomingAll = grouped.filter((g) => {
      const tms = new Date(g.groupTimeUtc).getTime();
      if (!Number.isFinite(tms)) return false;
      if (tms <= nowMs) return false;
      return g.events.some((e) => e.effectiveStatus === "pending");
    });
    const completedAll = grouped.filter((g) =>
      g.events.every(
        (e) => e.effectiveStatus === "taken" || e.effectiveStatus === "skipped",
      ),
    );

    return {
      due,
      missed: excludeGroup(missedAll, due),
      upcoming: excludeGroup(upcomingAll, due),
      completed: excludeGroup(completedAll, due),
    };
  }, [grouped]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("Medicine Reminders")}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("Today")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              disabled={!canUse || loading}
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
              {t("Refresh")}
            </button>
            <Link
              to="/reminder/medicines"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              <BellRing className="h-4 w-4" />
              {t("Medicines")}
            </Link>
            <Link
              to="/reminder/add"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              {t("Add")}
            </Link>
          </div>
        </div>

        {createdVisible ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
            <Check className="h-4 w-4" />
            {t("Reminder saved")}
          </div>
        ) : null}

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
          ) : grouped.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold">
                {t("No reminders today")}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {t("Add a medicine and schedule to start getting reminders.")}
              </p>
              <Link
                to="/reminder/add"
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                {t("Add medicine")}
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {timelineSections.due ? (
                <div>
                  <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("Due now")}
                  </div>
                  <TimelineGroupCard
                    group={timelineSections.due}
                    medicinesById={medicinesById}
                    busyByEventId={busyByEventId}
                    onTaken={onTaken}
                    onSkipped={onSkipped}
                  />
                </div>
              ) : null}

              {timelineSections.missed.length > 0 ? (
                <div>
                  <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("Missed today")}
                  </div>
                  <div className="space-y-3">
                    {timelineSections.missed.map((g) => (
                      <TimelineGroupCard
                        key={
                          g.groupTimeUtc + g.events.map((e) => e.id).join("-")
                        }
                        group={g}
                        medicinesById={medicinesById}
                        busyByEventId={busyByEventId}
                        onTaken={onTaken}
                        onSkipped={onSkipped}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {timelineSections.upcoming.length > 0 ? (
                <div>
                  <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("Upcoming")}
                  </div>
                  <div className="space-y-3">
                    {timelineSections.upcoming.map((g) => (
                      <TimelineGroupCard
                        key={
                          g.groupTimeUtc + g.events.map((e) => e.id).join("-")
                        }
                        group={g}
                        medicinesById={medicinesById}
                        busyByEventId={busyByEventId}
                        onTaken={onTaken}
                        onSkipped={onSkipped}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {timelineSections.completed.length > 0 ? (
                <details className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                  <summary className="cursor-pointer select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t("Completed")}
                    <span className="ml-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      ({timelineSections.completed.length})
                    </span>
                  </summary>
                  <div className="mt-3 space-y-3">
                    {timelineSections.completed.map((g) => (
                      <TimelineGroupCard
                        key={
                          g.groupTimeUtc + g.events.map((e) => e.id).join("-")
                        }
                        group={g}
                        medicinesById={medicinesById}
                        busyByEventId={busyByEventId}
                        onTaken={onTaken}
                        onSkipped={onSkipped}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function TimelineGroupCard(props: {
  group: GroupedEvent;
  medicinesById: Map<string, MedicineRecord>;
  busyByEventId: Record<string, boolean>;
  onTaken: (id: string) => Promise<void>;
  onSkipped: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const badge = groupStatusBadge(t, props.group.groupStatus);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {formatLocalTime(props.group.groupTimeUtc)}
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {props.group.events.length} {t("medicines")}
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {props.group.events.map((item) => {
          const busy = Boolean(props.busyByEventId[item.id]);
          const actionable =
            item.effectiveStatus === "pending" ||
            item.effectiveStatus === "missed";

          const med = props.medicinesById.get(item.medicineId);
          const stockRemaining = med?.stockRemaining;
          const low = med?.lowStockThreshold ?? 5;
          const stockText =
            typeof stockRemaining === "number"
              ? stockRemaining <= 0
                ? t("Out of stock")
                : stockRemaining <= low
                  ? t("Low stock")
                  : `${stockRemaining} ${t("left")}`
              : null;

          return (
            <div
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    to={`/reminder/medicines/${item.medicineId}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {item.medicine.name}
                  </Link>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {t("Dose")}:{" "}
                    {formatDoseText({
                      item,
                      fallbackDose: item.medicine.dosePerIntake,
                      fallbackUnit: item.medicine.doseUnit ?? null,
                    })}
                    {stockText ? ` · ${stockText}` : ""}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(
                    item.effectiveStatus,
                  )}`}
                >
                  {t(statusLabel(item.effectiveStatus))}
                </span>
              </div>

              {actionable ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void props.onTaken(item.id)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {t("Taken")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void props.onSkipped(item.id)}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <X className="h-4 w-4" />
                    {t("Skip")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
