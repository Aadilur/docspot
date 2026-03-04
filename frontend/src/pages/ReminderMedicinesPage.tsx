import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { ArrowLeft, ArrowRight, BellRing, Pill } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  getReminderSettings,
  getTodayTimeline,
  getUpcomingIntakeEvents,
  listMedicines,
  type MedicineRecord,
  type ReminderSettings,
  type TimelineItem,
  type UpcomingIntakeItem,
} from "../shared/api/reminders";
import { useAuthState } from "../shared/firebase/useAuthState";

function formatLocalTime(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoUtc;
  }
}

function formatLocalDayTime(isoUtc: string): string {
  try {
    const d = new Date(isoUtc);
    const day = d.toLocaleDateString([], { weekday: "long" });
    const time = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${time}`;
  } catch {
    return isoUtc;
  }
}

function isSameLocalDay(aIsoUtc: string, bIsoUtc: string): boolean {
  try {
    const a = new Date(aIsoUtc);
    const b = new Date(bIsoUtc);
    return a.toDateString() === b.toDateString();
  } catch {
    return false;
  }
}

function prettyInstruction(tag: string | null | undefined): string | null {
  if (!tag || tag === "none") return null;
  return tag.replace(/_/g, " ");
}

type StatusKind = "missed" | "due" | "upcoming" | "none";

type MedicineCardModel = {
  medicine: MedicineRecord;
  statusKind: StatusKind;
  statusText: string;
  statusBadgeClass: string;
  sortKey: number;
  sortTimeUtc: string | null;
  inventoryText: string;
  inventoryTone: "normal" | "warn" | "bad";
  disabled: boolean;
};

export default function ReminderMedicinesPage() {
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

  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [today, setToday] = useState<TimelineItem[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingIntakeItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    if (!canUse) {
      setLoading(false);
      setError(null);
      setSettings(null);
      setMedicines([]);
      setToday([]);
      setUpcoming([]);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const [s, meds, todayItems, up] = await Promise.all([
        getReminderSettings(patientId),
        listMedicines({
          limit: 100,
          offset: 0,
          includeArchived: false,
          patientId,
        }),
        getTodayTimeline({ patientId }),
        getUpcomingIntakeEvents({ daysAhead: 7, limit: 1000, patientId }),
      ]);

      if (cancelled) return;
      setSettings(s);
      setMedicines(meds);
      setToday(todayItems);
      setUpcoming(up);
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
  }, [canUse, patientId]);

  const models = useMemo((): MedicineCardModel[] => {
    const now = Date.now();
    const graceMs = (settings?.reminderGraceMinutes ?? 60) * 60_000;
    const dueWindowMs = 30 * 60_000;

    const todayByMedicine = new Map<string, TimelineItem[]>();
    for (const e of today) {
      const mid = e.medicineId;
      const arr = todayByMedicine.get(mid) ?? [];
      arr.push(e);
      todayByMedicine.set(mid, arr);
    }

    const nextByMedicine = new Map<string, UpcomingIntakeItem>();
    for (const e of upcoming) {
      const mid = e.medicineId;
      if (!nextByMedicine.has(mid)) nextByMedicine.set(mid, e);
    }

    const nowIso = new Date().toISOString();

    return medicines
      .map((m) => {
        const todayEvents = todayByMedicine.get(m.id) ?? [];

        const missed = todayEvents
          .filter((e) => {
            if (e.status !== "pending") return false;
            const at = new Date(e.datetimeUtc).getTime();
            return Number.isFinite(at) && now > at + graceMs;
          })
          .sort((a, b) => a.datetimeUtc.localeCompare(b.datetimeUtc));

        const due = todayEvents.some((e) => {
          if (e.status !== "pending") return false;
          const at = new Date(e.datetimeUtc).getTime();
          return Number.isFinite(at) && Math.abs(now - at) <= dueWindowMs;
        });

        const next = nextByMedicine.get(m.id) ?? null;

        let statusKind: StatusKind = "none";
        let statusText = t("No dose today");
        let statusBadgeClass =
          "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-200";
        let sortKey = 4;
        let sortTimeUtc: string | null = null;

        if (missed.length > 0) {
          statusKind = "missed";
          statusText =
            `${t("Missed at")}` + " " + formatLocalTime(missed[0].datetimeUtc);
          statusBadgeClass =
            "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200";
          sortKey = 1;
          sortTimeUtc = missed[0].datetimeUtc;
        } else if (due) {
          statusKind = "due";
          statusText = t("Due now");
          statusBadgeClass =
            "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
          sortKey = 2;
          sortTimeUtc = nowIso;
        } else if (next) {
          statusKind = "upcoming";
          sortKey = 3;
          sortTimeUtc = next.datetimeUtc;
          if (isSameLocalDay(next.datetimeUtc, nowIso)) {
            statusText = `${t("Next at")} ${formatLocalTime(next.datetimeUtc)}`;
          } else {
            statusText = `${t("Next on")} ${formatLocalDayTime(next.datetimeUtc)}`;
          }
        }

        const stockRemaining = m.stockRemaining;
        const stockTotal = m.stockTotal;
        const low = m.lowStockThreshold ?? 5;

        let inventoryText = t("Stock not set");
        let inventoryTone: "normal" | "warn" | "bad" = "normal";

        if (typeof stockRemaining === "number") {
          if (stockRemaining <= 0) {
            inventoryText = t("Out of stock");
            inventoryTone = "bad";
          } else if (stockRemaining <= low) {
            inventoryText = `${t("Low stock")} · ${stockRemaining} ${t("left")}`;
            inventoryTone = "warn";
          } else {
            inventoryText = `${stockRemaining} ${t("left")}`;
          }

          if (typeof stockTotal === "number") {
            inventoryText = `${inventoryText} · ${t("of")} ${stockTotal}`;
          }
        }

        const disabled =
          !m.isActive ||
          (typeof stockRemaining === "number" && stockRemaining <= 0);

        return {
          medicine: m,
          statusKind,
          statusText,
          statusBadgeClass,
          sortKey,
          sortTimeUtc,
          inventoryText,
          inventoryTone,
          disabled,
        };
      })
      .sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
        if (a.sortTimeUtc && b.sortTimeUtc) {
          const c = a.sortTimeUtc.localeCompare(b.sortTimeUtc);
          if (c !== 0) return c;
        }
        return a.medicine.name.localeCompare(b.medicine.name);
      });
  }, [medicines, upcoming, today, settings, t]);

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
                {t("Medicines")}
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {t("Missed and upcoming doses at a glance")}
            </p>
          </div>

          <Link
            to={`/reminder/add${patientQuery}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
          >
            <BellRing className="h-4 w-4" />
            {t("Add")}
          </Link>
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
          ) : models.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-base font-semibold">
                {t("No medicines yet")}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                {t("Create your first medicine and schedule.")}
              </p>
              <Link
                to={`/reminder/add${patientQuery}`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Pill className="h-4 w-4" />
                {t("Add medicine")}
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {models.map((m) => {
                const instruction = prettyInstruction(
                  m.medicine.instructionTag,
                );
                const inventoryToneClass =
                  m.inventoryTone === "bad"
                    ? "text-red-700 dark:text-red-200"
                    : m.inventoryTone === "warn"
                      ? "text-amber-800 dark:text-amber-200"
                      : "text-zinc-600 dark:text-zinc-300";

                return (
                  <Link
                    key={m.medicine.id}
                    to={`/reminder/medicines/${m.medicine.id}${patientQuery}`}
                    className={
                      "group block rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 " +
                      (m.disabled ? "opacity-70" : "")
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
                        <span className="text-sm font-bold">
                          {(m.medicine.name || "M").slice(0, 1).toUpperCase()}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {m.medicine.name}
                            </div>
                            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                              {t("Dose")}: {m.medicine.dosePerIntake}
                              {m.medicine.doseUnit
                                ? ` ${m.medicine.doseUnit}`
                                : ""}
                              {instruction ? ` · ${instruction}` : ""}
                            </div>
                          </div>

                          <span
                            className={
                              "flex-none rounded-full border px-2.5 py-1 text-xs font-semibold " +
                              m.statusBadgeClass
                            }
                          >
                            {m.statusText}
                          </span>
                        </div>

                        <div className={`mt-2 text-sm ${inventoryToneClass}`}>
                          {m.inventoryText}
                        </div>

                        <div className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
                          {t("Open", "Open")}
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {!canUse ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            {t("Please sign in to view your medicines.")}
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
