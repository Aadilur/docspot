import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import { Check, ChevronRight, Clock, Plus, X } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import {
  createMedicine,
  createSchedule,
  getTodayTimeline,
  inviteCaregiver,
  type InstructionTag,
  type MedicineType,
  type RepeatType,
  type TimelineItem,
} from "../shared/api/reminders";
import { confirmDriveUpload, presignDriveUpload } from "../shared/api/storage";
import { useVoiceNoteRecorder } from "../shared/audio/useVoiceNoteRecorder";
import { compressImageFile } from "../shared/images/compress";
import { useAuthState } from "../shared/firebase/useAuthState";

function isoDateToday(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function toDisplayType(t: MedicineType): string {
  if (t === "pill") return "Pill";
  if (t === "syrup") return "Syrup";
  if (t === "injection") return "Injection";
  if (t === "inhaler") return "Inhaler";
  return "Other";
}

function uniqSortedTimes(times: string[]): string[] {
  const uniq = Array.from(
    new Set(
      times
        .map((t) => t.trim())
        .filter(Boolean)
        .filter((t) => /^\d{2}:\d{2}$/.test(t)),
    ),
  );
  return uniq.sort((a, b) => a.localeCompare(b));
}

function useSwipeBack(onBack: () => void, enabled: boolean) {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart: (e: TouchEvent) => {
      if (!enabled) return;
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd: (e: TouchEvent) => {
      if (!enabled) return;
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = Date.now() - start.t;

      if (dt > 700) return;
      if (Math.abs(dy) > 60) return;
      if (dx < 90) return;

      onBack();
    },
  };
}

type Frequency = "once" | "daily" | "weekly" | "interval";

function doseUnitOptionsForType(type: MedicineType): string[] {
  if (type === "pill") return ["piece", "tablet", "capsule", "pill", "other"];
  if (type === "syrup")
    return ["ml", "spoon", "teaspoon", "tablespoon", "drop", "other"];
  if (type === "injection") return ["ml", "unit", "other"];
  if (type === "inhaler") return ["puff", "dose", "other"];
  return ["piece", "ml", "other"];
}

const TIME_PRESETS: Array<{ label: string; time: string }> = [
  { label: "Morning", time: "08:00" },
  { label: "Noon", time: "12:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

const WEEK_DAYS: Array<{ i: number; label: string }> = [
  { i: 1, label: "Mon" },
  { i: 2, label: "Tue" },
  { i: 3, label: "Wed" },
  { i: 4, label: "Thu" },
  { i: 5, label: "Fri" },
  { i: 6, label: "Sat" },
  { i: 0, label: "Sun" },
];

export default function ReminderAddWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { configured, loading: authLoading, user } = useAuthState();

  const canUse = configured && !authLoading && !!user;

  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOverlayOpen, setSavedOverlayOpen] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [type, setType] = useState<MedicineType>("pill");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Step 2
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [onceDate, setOnceDate] = useState<string>(isoDateToday());
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [doseByTime, setDoseByTime] = useState<Record<string, number>>({
    "08:00": 1,
  });
  const [doseUnitPreset, setDoseUnitPreset] = useState<string>("piece");
  const [doseUnitOther, setDoseUnitOther] = useState<string>("");
  const [customTime, setCustomTime] = useState<string>("");
  const [intervalDays, setIntervalDays] = useState<number>(2);
  const [weeklyDays, setWeeklyDays] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true,
  });

  const [durationType, setDurationType] = useState<
    "ongoing" | "for_days" | "until_date"
  >("ongoing");
  const [forDays, setForDays] = useState<number>(30);
  const [untilDate, setUntilDate] = useState<string>(isoDateToday());

  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [instructionTag, setInstructionTag] = useState<InstructionTag>("none");
  const [stockRemaining, setStockRemaining] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const voice = useVoiceNoteRecorder({ t });
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceNoteKey, setVoiceNoteKey] = useState<string | null>(null);

  const [caregiverContact, setCaregiverContact] = useState("");
  const [caregiverBusy, setCaregiverBusy] = useState(false);
  const [caregiverMessage, setCaregiverMessage] = useState<string | null>(null);

  const swipe = useSwipeBack(() => {
    if (step > 1) setStep((s) => (s - 1) as any);
    else navigate("/reminder");
  }, true);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const doseUnitOptions = useMemo(() => {
    return doseUnitOptionsForType(type);
  }, [type]);

  const effectiveDoseUnit = useMemo(() => {
    const v =
      doseUnitPreset === "other" ? doseUnitOther.trim() : doseUnitPreset;
    return v ? v : null;
  }, [doseUnitOther, doseUnitPreset]);

  useEffect(() => {
    const opts = doseUnitOptionsForType(type);
    const next = opts[0] ?? "piece";
    setDoseUnitPreset((prev) => {
      if (opts.includes(prev)) return prev;
      return next;
    });
  }, [type]);

  useEffect(() => {
    setDoseByTime((prev) => {
      const next: Record<string, number> = {};
      for (const tm of times) {
        const existing = prev[tm];
        next[tm] = Number.isFinite(existing) && existing > 0 ? existing : 1;
      }
      return next;
    });
  }, [times]);

  const progress = useMemo(() => {
    return [1, 2].map((i) => ({
      i,
      active: i === step,
      done: i < step,
    }));
  }, [step]);

  const selectedWeeklyDays = useMemo(() => {
    return Object.entries(weeklyDays)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => Number.isFinite(n));
  }, [weeklyDays]);

  const scheduleStartDate = useMemo(() => {
    return frequency === "once" ? onceDate : isoDateToday();
  }, [frequency, onceDate]);

  const scheduleEndDate = useMemo(() => {
    if (frequency === "once") return onceDate;
    if (durationType === "ongoing") return null;
    if (durationType === "until_date") return untilDate;
    const days = Math.max(1, Math.floor(forDays || 1));
    return addDays(scheduleStartDate, days - 1);
  }, [
    durationType,
    forDays,
    frequency,
    onceDate,
    scheduleStartDate,
    untilDate,
  ]);

  const scheduleValidationError = useMemo(() => {
    if (frequency === "once") {
      if (!onceDate) return "Pick a date";
      if (times.length !== 1) return "Pick one time";
      return null;
    }

    if (frequency === "weekly" && selectedWeeklyDays.length === 0) {
      return "Select at least one day";
    }

    if (frequency === "interval" && (!intervalDays || intervalDays < 1)) {
      return "Interval must be at least 1 day";
    }

    if (times.length === 0) return "Add at least one time";
    if (scheduleEndDate && scheduleEndDate < scheduleStartDate) {
      return "End date must be after start date";
    }
    return null;
  }, [
    frequency,
    intervalDays,
    onceDate,
    scheduleEndDate,
    scheduleStartDate,
    selectedWeeklyDays.length,
    times.length,
  ]);

  const doseValidationError = useMemo(() => {
    if (times.length === 0) return null;
    for (const tm of times) {
      const d = doseByTime[tm];
      if (!Number.isFinite(d) || d <= 0) return "Enter a dose for each time";
    }
    if (doseUnitPreset === "other" && !doseUnitOther.trim()) {
      return "Enter a unit";
    }
    return null;
  }, [doseByTime, doseUnitOther, doseUnitPreset, times]);

  const stockEstimateText = useMemo(() => {
    const stock = Number(stockRemaining);
    if (!Number.isFinite(stock) || stock <= 0) return null;
    if (frequency !== "daily" && frequency !== "interval") return null;
    const perDay = times.reduce(
      (sum, tm) => sum + Number(doseByTime[tm] || 0),
      0,
    );
    if (!Number.isFinite(perDay) || perDay <= 0) return null;
    const days = Math.floor(stock / perDay);
    if (days <= 0) return t("Less than a day remaining");
    return t("Estimated: {{days}} days remaining", { days });
  }, [doseByTime, frequency, stockRemaining, t, times]);

  async function uploadBlobToDrive(params: {
    blob: Blob;
    filename: string;
    contentType: string;
  }): Promise<string> {
    const presign = await presignDriveUpload({
      filename: params.filename,
      contentType: params.contentType,
      sizeBytes: params.blob.size,
    });

    const putRes = await fetch(presign.url, {
      method: "PUT",
      headers: { "Content-Type": params.contentType },
      body: params.blob,
    });
    if (!putRes.ok) {
      throw new Error(`Upload failed (${putRes.status})`);
    }

    await confirmDriveUpload({ key: presign.key });
    return presign.key;
  }

  async function onPickPhoto(file: File) {
    setError(null);
    setCaregiverMessage(null);
    setPhotoUploading(true);
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 640,
        maxHeight: 640,
        keepIfSmallerThanBytes: 200_000,
      });
      const key = await uploadBlobToDrive({
        blob: compressed.file,
        filename: compressed.filename,
        contentType: compressed.contentType,
      });
      setPhotoKey(key);

      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(URL.createObjectURL(compressed.file));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoUploading(false);
    }
  }

  function addPresetTime(next: string) {
    if (frequency === "once") {
      setTimes([next]);
      return;
    }
    setTimes((prev) => uniqSortedTimes([...prev, next]));
  }

  function removeTime(next: string) {
    setTimes((prev) => prev.filter((t) => t !== next));
  }

  function nextFromStep1() {
    if (!name.trim()) return;
    setStep(2);
  }

  async function onInviteCaregiver() {
    if (!canUse) return;
    const contact = caregiverContact.trim();
    if (!contact) return;

    setCaregiverBusy(true);
    setCaregiverMessage(null);
    setError(null);
    try {
      await inviteCaregiver({ caregiverContact: contact });
      setCaregiverMessage(t("Invitation sent"));
      setCaregiverContact("");
    } catch (e) {
      setCaregiverMessage(
        e instanceof Error ? e.message : t("Failed to invite caregiver"),
      );
    } finally {
      setCaregiverBusy(false);
    }
  }

  async function onSave() {
    if (!canUse) return;
    if (!name.trim()) return;
    if (scheduleValidationError) return;
    if (doseValidationError) return;

    setBusy(true);
    setError(null);

    try {
      let finalVoiceKey = voiceNoteKey;
      if (voice.note?.blob && !finalVoiceKey) {
        setVoiceUploading(true);
        const contentType = voice.note.blob.type || "audio/wav";
        const filename = contentType.includes("webm")
          ? "voice-note.webm"
          : contentType.includes("mpeg")
            ? "voice-note.mp3"
            : "voice-note.wav";

        finalVoiceKey = await uploadBlobToDrive({
          blob: voice.note.blob,
          filename,
          contentType,
        });
        setVoiceNoteKey(finalVoiceKey);
        setVoiceUploading(false);
      }

      const timesDoseByTime: Record<string, number> = {};
      for (const tm of times) {
        timesDoseByTime[tm] = Number(doseByTime[tm] || 0);
      }
      const dosePerIntake =
        typeof times[0] === "string" &&
        Number.isFinite(timesDoseByTime[times[0]])
          ? Math.max(0.1, timesDoseByTime[times[0]])
          : 1;

      const medicine = await createMedicine({
        name: name.trim(),
        type,
        dosePerIntake,
        doseUnit: effectiveDoseUnit,
        stockRemaining: stockRemaining.trim() ? Number(stockRemaining) : null,
        instructionTag,
        note: note.trim() ? note.trim() : null,
        photoKey,
        voiceNoteKey: finalVoiceKey,
      });

      const repeatType: RepeatType = frequency;

      await createSchedule({
        medicineId: medicine.id,
        repeatType,
        intervalValue: frequency === "interval" ? intervalDays : null,
        selectedDays: frequency === "weekly" ? selectedWeeklyDays : null,
        times,
        doseByTime: timesDoseByTime,
        startDate: scheduleStartDate,
        endDate: scheduleEndDate,
        maxOccurrences: null,
      });

      let timeline: TimelineItem[] = [];
      try {
        timeline = await getTodayTimeline();
      } catch {
        timeline = [];
      }

      setSavedOverlayOpen(true);
      await new Promise((r) => window.setTimeout(r, 700));

      navigate("/reminder", {
        replace: true,
        state: { created: true, timeline },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVoiceUploading(false);
      setBusy(false);
    }
  }

  const stepTitle = useMemo(() => {
    if (step === 1) return t("Medicine info");
    return t("Schedule & details");
  }, [step, t]);

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      {...swipe}
    >
      {savedOverlayOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-white/90 px-4 backdrop-blur dark:bg-zinc-950/90">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-950/40">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <Check className="h-7 w-7" />
            </div>
            <div className="mt-3 text-base font-semibold text-emerald-900 dark:text-emerald-100">
              {t("Saved")}
            </div>
            <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
              {t("Taking you back to Today")}
            </div>
          </div>
        </div>
      ) : null}

      <Header />

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 md:pb-10">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/reminder"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
              >
                {t("Back")}
              </Link>
              <h1 className="text-xl font-semibold tracking-tight">
                {t("Add medicine")}
              </h1>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {stepTitle}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {progress.map((p) => (
              <div
                key={p.i}
                className={
                  "h-2 w-8 rounded-full " +
                  (p.done
                    ? "bg-brand-600"
                    : p.active
                      ? "bg-brand-400"
                      : "bg-zinc-200 dark:bg-zinc-800")
                }
                aria-label={`Step ${p.i}`}
              />
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {/* Step content */}
        <section className="mt-6">
          {step === 1 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <label className="text-sm font-semibold">{t("Name")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("e.g., Metformin")}
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                />
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {t("Photo (optional)")}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("Helps you recognize it quickly")}
                    </div>
                  </div>
                  <div className="h-14 w-14 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    {photoPreviewUrl ? (
                      <img
                        src={photoPreviewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900">
                    <Plus className="h-4 w-4" />
                    {photoUploading ? t("Uploading...") : t("Add photo")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onPickPhoto(f);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {photoPreviewUrl ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                      onClick={() => {
                        if (photoPreviewUrl)
                          URL.revokeObjectURL(photoPreviewUrl);
                        setPhotoPreviewUrl(null);
                        setPhotoKey(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                      {t("Remove")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-semibold">{t("Type")}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(
                    [
                      "pill",
                      "syrup",
                      "injection",
                      "inhaler",
                      "other",
                    ] as MedicineType[]
                  ).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setType(v)}
                      className={
                        "rounded-2xl border px-3 py-3 text-sm font-semibold " +
                        (type === v
                          ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-100"
                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900")
                      }
                    >
                      {t(toDisplayType(v))}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-semibold">{t("Dose unit")}</div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("Pick the unit you use (you can also type your own).")}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-sm font-semibold">{t("Unit")}</div>
                    <select
                      value={doseUnitPreset}
                      onChange={(e) => setDoseUnitPreset(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      {doseUnitOptions.map((u) => (
                        <option key={u} value={u}>
                          {u === "other" ? t("Other") : u}
                        </option>
                      ))}
                    </select>
                  </label>

                  {doseUnitPreset === "other" ? (
                    <label className="block">
                      <div className="text-sm font-semibold">
                        {t("Custom unit")}
                      </div>
                      <input
                        value={doseUnitOther}
                        onChange={(e) => setDoseUnitOther(e.target.value)}
                        placeholder={t("e.g., piece, ml, spoon")}
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </label>
                  ) : null}
                </div>

                {doseValidationError ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    {t(doseValidationError)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-semibold">{t("Frequency")}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(
                    [
                      { v: "once", l: "Once" },
                      { v: "daily", l: "Daily" },
                      { v: "weekly", l: "Weekly" },
                      { v: "interval", l: "Every X days" },
                    ] as Array<{ v: Frequency; l: string }>
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => {
                        setFrequency(o.v);
                        if (o.v === "once") setTimes((p) => [p[0] ?? "08:00"]);
                      }}
                      className={
                        "rounded-2xl border px-3 py-3 text-sm font-semibold " +
                        (frequency === o.v
                          ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-100"
                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900")
                      }
                    >
                      {t(o.l)}
                    </button>
                  ))}
                </div>

                {frequency === "once" ? (
                  <div className="mt-4">
                    <label className="text-sm font-semibold">{t("Date")}</label>
                    <input
                      type="date"
                      value={onceDate}
                      onChange={(e) => setOnceDate(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                    />
                  </div>
                ) : null}

                {frequency === "weekly" ? (
                  <div className="mt-4">
                    <div className="text-sm font-semibold">{t("Days")}</div>
                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {WEEK_DAYS.map((d) => {
                        const on = Boolean(weeklyDays[d.i]);
                        return (
                          <button
                            key={d.i}
                            type="button"
                            onClick={() =>
                              setWeeklyDays((p) => ({
                                ...p,
                                [d.i]: !Boolean(p[d.i]),
                              }))
                            }
                            className={
                              "rounded-xl border px-2 py-2 text-xs font-semibold " +
                              (on
                                ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-100"
                                : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900")
                            }
                          >
                            {t(d.label)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {frequency === "interval" ? (
                  <div className="mt-4">
                    <label className="text-sm font-semibold">
                      {t("Every")}
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={intervalDays}
                        onChange={(e) =>
                          setIntervalDays(Math.max(1, Number(e.target.value)))
                        }
                        className="w-24 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                      />
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">
                        {t("days")}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t("Times")}</div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {frequency === "once"
                        ? t("Pick one time")
                        : t("Add one or more times")}
                    </div>
                  </div>
                  <Clock className="h-5 w-5 text-zinc-400" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {TIME_PRESETS.map((p) => (
                    <button
                      key={p.time}
                      type="button"
                      onClick={() => addPresetTime(p.time)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                    >
                      {t(p.label)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!customTime) return;
                      addPresetTime(customTime);
                      setCustomTime("");
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    {t("Add")}
                  </button>
                </div>

                {times.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {times.map((tm) => (
                      <button
                        key={tm}
                        type="button"
                        onClick={() => removeTime(tm)}
                        className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900 hover:bg-brand-100 dark:border-brand-900/50 dark:bg-brand-950/30 dark:text-brand-100"
                        aria-label={`Remove ${tm}`}
                      >
                        {tm}
                        <X className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                ) : null}

                {times.length ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-sm font-semibold">
                      {t("Dose by time")}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("Example: 1 in the morning, 2 in the evening")}
                    </div>

                    {times.map((tm) => (
                      <div
                        key={tm}
                        className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="w-16 text-sm font-semibold">{tm}</div>
                        <input
                          type="number"
                          min={0.1}
                          step={0.5}
                          value={
                            Number.isFinite(doseByTime[tm])
                              ? doseByTime[tm]
                              : ""
                          }
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setDoseByTime((p) => ({
                              ...p,
                              [tm]: Number.isFinite(n) ? n : 0,
                            }));
                          }}
                          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <div className="text-sm text-zinc-600 dark:text-zinc-300">
                          {effectiveDoseUnit ?? ""}
                        </div>
                      </div>
                    ))}

                    {doseValidationError ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                        {t(doseValidationError)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {scheduleValidationError ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                    {t(scheduleValidationError)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-sm font-semibold">{t("Duration")}</div>

                {frequency === "once" ? (
                  <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    {t("Once reminders run only on the selected date.")}
                  </div>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          { v: "ongoing", l: "Ongoing" },
                          { v: "for_days", l: "For X days" },
                          { v: "until_date", l: "Until date" },
                        ] as Array<{ v: typeof durationType; l: string }>
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setDurationType(o.v)}
                          className={
                            "rounded-2xl border px-3 py-3 text-sm font-semibold " +
                            (durationType === o.v
                              ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-100"
                              : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900")
                          }
                        >
                          {t(o.l)}
                        </button>
                      ))}
                    </div>

                    {durationType === "for_days" ? (
                      <div className="mt-4">
                        <label className="text-sm font-semibold">
                          {t("Number of days")}
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={forDays}
                          onChange={(e) =>
                            setForDays(Math.max(1, Number(e.target.value)))
                          }
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>
                    ) : null}

                    {durationType === "until_date" ? (
                      <div className="mt-4">
                        <label className="text-sm font-semibold">
                          {t("End date")}
                        </label>
                        <input
                          type="date"
                          value={untilDate}
                          onChange={(e) => setUntilDate(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>
                    ) : null}

                    {scheduleEndDate && scheduleEndDate < scheduleStartDate ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                        {t("End date must be after start date")}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {t("Additional")}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("Optional")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((p) => !p)}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                  >
                    {advancedOpen ? t("Hide") : t("Show")}
                    <ChevronRight
                      className={
                        "h-4 w-4 transition-transform " +
                        (advancedOpen ? "rotate-90" : "")
                      }
                    />
                  </button>
                </div>

                {advancedOpen ? (
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="text-sm font-semibold">
                        {t("Instructions")}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(
                          [
                            { v: "before_meal", l: "Before meal" },
                            { v: "after_meal", l: "After meal" },
                            { v: "with_food", l: "With food" },
                            { v: "empty_stomach", l: "Empty stomach" },
                          ] as Array<{ v: InstructionTag; l: string }>
                        ).map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() =>
                              setInstructionTag((p) =>
                                p === o.v ? "none" : o.v,
                              )
                            }
                            className={
                              "rounded-full border px-3 py-2 text-sm font-semibold " +
                              (instructionTag === o.v
                                ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-100"
                                : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900")
                            }
                          >
                            {t(o.l)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold">
                        {t("Stock (optional)")}
                      </div>
                      <input
                        value={stockRemaining}
                        onChange={(e) => setStockRemaining(e.target.value)}
                        type="number"
                        min={0}
                        step={1}
                        placeholder={t("e.g., 30")}
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                      />
                      {stockEstimateText ? (
                        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {stockEstimateText}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-sm font-semibold">{t("Note")}</div>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                        placeholder={t("Optional note")}
                        className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                      />
                    </div>

                    <div>
                      <div className="text-sm font-semibold">
                        {t("Voice note")}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {!voice.recording ? (
                          <button
                            type="button"
                            onClick={() => void voice.beginRecord()}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
                            disabled={voiceUploading}
                          >
                            {t("Record")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => voice.endRecord()}
                            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
                          >
                            {t("Stop")} ({voice.recordSecondsLeft})
                          </button>
                        )}

                        {voice.note ? (
                          <button
                            type="button"
                            onClick={() => {
                              voice.clearNote();
                              setVoiceNoteKey(null);
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
                          >
                            <X className="h-4 w-4" />
                            {t("Remove")}
                          </button>
                        ) : null}
                      </div>

                      {voice.audioUrl ? (
                        <audio
                          className="mt-3 w-full"
                          controls
                          src={voice.audioUrl}
                        />
                      ) : null}

                      {voiceUploading ? (
                        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {t("Uploading voice note...")}
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <div className="text-sm font-semibold">
                        {t("Caregiver (optional)")}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          value={caregiverContact}
                          onChange={(e) => setCaregiverContact(e.target.value)}
                          placeholder={t("Email or phone")}
                          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-3 text-base outline-none focus:border-brand-500 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <button
                          type="button"
                          onClick={() => void onInviteCaregiver()}
                          disabled={!caregiverContact.trim() || caregiverBusy}
                          className="rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {caregiverBusy ? t("Sending...") : t("Invite")}
                        </button>
                      </div>
                      {caregiverMessage ? (
                        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                          {caregiverMessage}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:static md:z-auto md:mt-6 md:border-0 md:bg-transparent md:px-4 md:py-0 md:backdrop-blur-0">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 md:rounded-2xl md:border md:border-zinc-200 md:bg-white md:px-4 md:py-3 md:shadow-sm dark:md:border-zinc-800 dark:md:bg-zinc-950">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900"
            onClick={() => {
              if (step > 1) setStep((s) => (s - 1) as any);
              else navigate("/reminder");
            }}
            disabled={busy}
          >
            {t("Back")}
          </button>

          <div className="flex-1" />

          {step < 2 ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              onClick={() => {
                if (step === 1) nextFromStep1();
              }}
              disabled={
                busy ||
                !canUse ||
                (step === 1 && (!name.trim() || photoUploading)) ||
                photoUploading
              }
            >
              {t("Next")}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={() => void onSave()}
              disabled={
                busy ||
                !canUse ||
                Boolean(scheduleValidationError) ||
                Boolean(doseValidationError) ||
                (frequency !== "once" &&
                  durationType === "until_date" &&
                  (!untilDate || untilDate < scheduleStartDate)) ||
                voiceUploading
              }
            >
              <Check className="h-4 w-4" />
              {busy ? t("Saving...") : t("Save")}
            </button>
          )}
        </div>
      </div>

      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
}
