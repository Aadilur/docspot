import { API_PATHS } from "./endpoints";
import { apiFetch } from "./http";

export type MedicineType = "pill" | "syrup" | "injection" | "inhaler" | "other";

export type InstructionTag =
  | "before_meal"
  | "after_meal"
  | "with_food"
  | "empty_stomach"
  | "none";

export type RepeatType = "once" | "daily" | "weekly" | "interval";

export type IntakeStatus = "pending" | "taken" | "missed" | "skipped";

export type ReminderSettings = {
  timezone: string;
  reminderOffsetMinutes: number;
  reminderGraceMinutes: number;
};

export type MedicineRecord = {
  id: string;
  userId: string;
  name: string;
  type: MedicineType;
  dosePerIntake: number;
  doseUnit: string | null;
  stockTotal: number | null;
  stockRemaining: number | null;
  lowStockThreshold: number;
  instructionTag: InstructionTag;
  note: string | null;
  photoUrl: string | null;
  photoKey?: string | null;
  voiceNoteUrl?: string | null;
  voiceNoteKey?: string | null;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleRecord = {
  id: string;
  medicineId: string;
  repeatType: RepeatType;
  intervalValue: number | null;
  selectedDays: number[] | null;
  times: string[];
  doseByTime: Record<string, number> | null;
  startDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
  createdAt: string;
  updatedAt: string;
};

export type IntakeEventRecord = {
  id: string;
  scheduleId: string;
  medicineId: string;
  userId: string;
  datetimeUtc: string;
  status: IntakeStatus;
  takenAtUtc: string | null;
  skippedReason: string | null;
  createdAt: string;
  metadata: unknown | null;
};

export type TimelineItem = IntakeEventRecord & {
  medicine: Pick<
    MedicineRecord,
    "id" | "name" | "type" | "dosePerIntake" | "doseUnit"
  >;
};

export type UpcomingIntakeItem = TimelineItem;

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const res = await apiFetch<{ ok: true; settings: ReminderSettings }>(
    API_PATHS.meReminderSettings,
  );
  return res.settings;
}

export async function patchReminderSettings(patch: Partial<ReminderSettings>) {
  const res = await apiFetch<{ ok: true; settings: ReminderSettings }>(
    API_PATHS.meReminderSettings,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return res.settings;
}

export async function listMedicines(params?: {
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}): Promise<MedicineRecord[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));
  if (params?.includeArchived) qs.set("includeArchived", "true");

  const res = await apiFetch<{ ok: true; medicines: MedicineRecord[] }>(
    `${API_PATHS.meMedicines}${qs.toString() ? `?${qs.toString()}` : ""}`,
  );
  return res.medicines;
}

export async function getMedicineById(
  medicineId: string,
): Promise<MedicineRecord> {
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(
    API_PATHS.meMedicineById(medicineId),
  );
  return res.medicine;
}

export async function createMedicine(payload: {
  name: string;
  type: MedicineType;
  dosePerIntake: number;
  doseUnit?: string | null;
  stockTotal?: number | null;
  stockRemaining?: number | null;
  lowStockThreshold?: number | null;
  instructionTag?: InstructionTag;
  note?: string | null;
  photoKey?: string | null;
  voiceNoteKey?: string | null;
}): Promise<MedicineRecord> {
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(
    API_PATHS.meMedicines,
    {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        type: payload.type,
        dosePerIntake: payload.dosePerIntake,
        doseUnit: payload.doseUnit ?? null,
        stockTotal: payload.stockTotal ?? null,
        stockRemaining: payload.stockRemaining ?? null,
        lowStockThreshold: payload.lowStockThreshold ?? undefined,
        instructionTag: payload.instructionTag ?? "none",
        note: payload.note ?? null,
        photoKey: payload.photoKey ?? null,
        voiceNoteKey: payload.voiceNoteKey ?? null,
      }),
    },
  );

  return res.medicine;
}

export type CaregiverLinkRecord = {
  id: string;
  patientId: string;
  caregiverId: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
};

export async function inviteCaregiver(params: {
  caregiverId?: string;
  caregiverContact?: string;
}): Promise<CaregiverLinkRecord> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord }>(
    API_PATHS.meCaregiverInvite,
    {
      method: "POST",
      body: JSON.stringify({
        caregiverId: params.caregiverId ?? null,
        caregiverContact: params.caregiverContact ?? null,
        contact: params.caregiverContact ?? null,
      }),
    },
  );
  return res.link;
}

export async function archiveMedicine(
  medicineId: string,
): Promise<MedicineRecord> {
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(
    API_PATHS.meMedicineArchive(medicineId),
    { method: "PATCH", body: JSON.stringify({}) },
  );
  return res.medicine;
}

export async function listSchedules(
  medicineId: string,
): Promise<ScheduleRecord[]> {
  const res = await apiFetch<{ ok: true; schedules: ScheduleRecord[] }>(
    API_PATHS.meMedicineSchedules(medicineId),
  );
  return res.schedules;
}

export async function createSchedule(params: {
  medicineId: string;
  repeatType: RepeatType;
  intervalValue?: number | null;
  selectedDays?: number[] | null;
  times: string[];
  doseByTime?: Record<string, number> | null;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
}): Promise<ScheduleRecord> {
  const res = await apiFetch<{ ok: true; schedule: ScheduleRecord }>(
    API_PATHS.meMedicineSchedules(params.medicineId),
    {
      method: "POST",
      body: JSON.stringify({
        repeatType: params.repeatType,
        intervalValue: params.intervalValue ?? null,
        selectedDays: params.selectedDays ?? null,
        times: params.times,
        doseByTime: params.doseByTime ?? null,
        startDate: params.startDate,
        endDate: params.endDate ?? null,
        maxOccurrences: params.maxOccurrences ?? null,
      }),
    },
  );

  return res.schedule;
}

export async function getTodayTimeline(params?: {
  date?: string;
}): Promise<TimelineItem[]> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);

  const res = await apiFetch<{ ok: true; items: TimelineItem[] }>(
    `${API_PATHS.meRemindersTimelineToday}${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.items;
}

export async function getUpcomingIntakeEvents(params?: {
  daysAhead?: number;
  limit?: number;
}): Promise<UpcomingIntakeItem[]> {
  const qs = new URLSearchParams();
  if (typeof params?.daysAhead === "number")
    qs.set("daysAhead", String(params.daysAhead));
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));

  const res = await apiFetch<{ ok: true; items: UpcomingIntakeItem[] }>(
    `${API_PATHS.meRemindersUpcoming}${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.items;
}

export async function getMedicineUpcoming(params: {
  medicineId: string;
  daysAhead?: number;
  limit?: number;
}): Promise<UpcomingIntakeItem[]> {
  const qs = new URLSearchParams();
  if (typeof params.daysAhead === "number")
    qs.set("daysAhead", String(params.daysAhead));
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));

  const res = await apiFetch<{ ok: true; items: UpcomingIntakeItem[] }>(
    `${API_PATHS.meMedicineUpcoming(params.medicineId)}${
      qs.toString() ? `?${qs}` : ""
    }`,
  );
  return res.items;
}

export async function listMedicineHistory(params: {
  medicineId: string;
  limit?: number;
  offset?: number;
  days?: number;
}): Promise<IntakeEventRecord[]> {
  const qs = new URLSearchParams();
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params.offset === "number")
    qs.set("offset", String(params.offset));
  if (typeof params.days === "number") qs.set("days", String(params.days));

  const res = await apiFetch<{ ok: true; events: IntakeEventRecord[] }>(
    `${API_PATHS.meMedicineHistory(params.medicineId)}${
      qs.toString() ? `?${qs}` : ""
    }`,
  );
  return res.events;
}

export async function markIntakeTaken(intakeEventId: string): Promise<{
  event: IntakeEventRecord;
  medicine: MedicineRecord;
}> {
  const res = await apiFetch<{
    ok: true;
    event: IntakeEventRecord;
    medicine: MedicineRecord;
  }>(API_PATHS.meRemindersIntakeTaken(intakeEventId), {
    method: "PATCH",
    headers: { "Idempotency-Key": newIdempotencyKey() },
    body: JSON.stringify({}),
  });

  return { event: res.event, medicine: res.medicine };
}

export async function markIntakeSkipped(params: {
  intakeEventId: string;
  reason?: string | null;
}): Promise<IntakeEventRecord> {
  const res = await apiFetch<{ ok: true; event: IntakeEventRecord }>(
    API_PATHS.meRemindersIntakeSkipped(params.intakeEventId),
    {
      method: "PATCH",
      body: JSON.stringify({ reason: params.reason ?? null }),
    },
  );

  return res.event;
}
