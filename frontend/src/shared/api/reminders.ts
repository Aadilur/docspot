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

export type RemovedMedicineRecord = {
  id: string;
  userId: string;
  name: string;
  type: MedicineType;
  dosePerIntake: number;
  doseUnit: string | null;
  removedAt: string;
  createdAt: string;
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

export async function getReminderSettings(
  patientId?: string | null,
): Promise<ReminderSettings> {
  const path = patientId
    ? withPatientId(API_PATHS.caregiverReminderSettings, patientId)
    : API_PATHS.meReminderSettings;
  const res = await apiFetch<{ ok: true; settings: ReminderSettings }>(path);
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
  patientId?: string | null;
}): Promise<MedicineRecord[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));
  if (params?.includeArchived) qs.set("includeArchived", "true");

  const basePath = params?.patientId
    ? withPatientId(API_PATHS.caregiverMedicines, params.patientId)
    : API_PATHS.meMedicines;

  const res = await apiFetch<{ ok: true; medicines: MedicineRecord[] }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs.toString()}` : ""}`,
  );
  return res.medicines;
}

export async function listRemovedMedicines(params?: {
  limit?: number;
  offset?: number;
  patientId?: string | null;
}): Promise<RemovedMedicineRecord[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));

  const basePath = params?.patientId
    ? withPatientId(API_PATHS.caregiverRemovedMedicines, params.patientId)
    : API_PATHS.meRemovedMedicines;

  const res = await apiFetch<{
    ok: true;
    removedMedicines: RemovedMedicineRecord[];
  }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs.toString()}` : ""}`,
  );
  return res.removedMedicines;
}

export async function getMedicineById(
  medicineId: string,
  patientId?: string | null,
): Promise<MedicineRecord> {
  const path = patientId
    ? withPatientId(API_PATHS.caregiverMedicineById(medicineId), patientId)
    : API_PATHS.meMedicineById(medicineId);
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(path);
  return res.medicine;
}

export async function updateMedicine(
  medicineId: string,
  patch: Partial<
    Pick<
      MedicineRecord,
      | "name"
      | "type"
      | "dosePerIntake"
      | "doseUnit"
      | "stockTotal"
      | "stockRemaining"
      | "lowStockThreshold"
      | "instructionTag"
      | "note"
      | "isActive"
    > & {
      voiceNoteKey: string | null;
      voiceNoteFilename: string | null;
      voiceNoteContentType: string | null;
    }
  >,
  patientId?: string | null,
): Promise<MedicineRecord> {
  const path = patientId
    ? withPatientId(API_PATHS.caregiverMedicineById(medicineId), patientId)
    : API_PATHS.meMedicineById(medicineId);
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(path, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
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
  voiceNoteFilename?: string | null;
  voiceNoteContentType?: string | null;
  patientId?: string | null;
}): Promise<MedicineRecord> {
  const path = payload.patientId
    ? withPatientId(API_PATHS.caregiverMedicines, payload.patientId)
    : API_PATHS.meMedicines;
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(path, {
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
      voiceNoteFilename: payload.voiceNoteFilename ?? null,
      voiceNoteContentType: payload.voiceNoteContentType ?? null,
    }),
  });

  return res.medicine;
}

export type CaregiverLinkRecord = {
  id: string;
  patientId: string;
  caregiverId: string;
  status: "pending" | "accepted" | "rejected";
  accessLevel?: "view" | "edit" | "full";
  caregiverAlias?: string | null;
  createdAt: string;
};

export type CaregiverRequestItem = {
  link: CaregiverLinkRecord;
  patient: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  };
};

export type CaregiverPatientItem = {
  link: CaregiverLinkRecord;
  patient: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  };
};

export type MedicineActivityLog = {
  id: string;
  userId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: any;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  } | null;
};

function withPatientId(path: string, patientId?: string | null): string {
  const p = typeof patientId === "string" ? patientId.trim() : "";
  if (!p) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}patientId=${encodeURIComponent(p)}`;
}

export async function inviteCaregiver(params: {
  caregiverId?: string;
  caregiverContact?: string;
  accessLevel?: "view" | "edit" | "full";
}): Promise<CaregiverLinkRecord> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord }>(
    API_PATHS.meCaregiverInvite,
    {
      method: "POST",
      body: JSON.stringify({
        caregiverId: params.caregiverId ?? null,
        caregiverContact: params.caregiverContact ?? null,
        contact: params.caregiverContact ?? null,
        accessLevel: params.accessLevel ?? "view",
      }),
    },
  );
  return res.link;
}

export async function listCaregiverRequests(): Promise<CaregiverRequestItem[]> {
  const res = await apiFetch<{ ok: true; items: CaregiverRequestItem[] }>(
    API_PATHS.meCaregiverRequests,
  );
  return res.items;
}

export async function listCaregiverPatients(): Promise<CaregiverPatientItem[]> {
  const res = await apiFetch<{ ok: true; items: CaregiverPatientItem[] }>(
    API_PATHS.meCaregiverPatients,
  );
  return res.items;
}

export async function acceptCaregiverInvite(
  patientId: string,
): Promise<CaregiverLinkRecord> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord }>(
    API_PATHS.meCaregiverAccept,
    { method: "POST", body: JSON.stringify({ patientId }) },
  );
  return res.link;
}

export async function rejectCaregiverInvite(
  patientId: string,
): Promise<CaregiverLinkRecord> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord }>(
    API_PATHS.meCaregiverReject,
    { method: "POST", body: JSON.stringify({ patientId }) },
  );
  return res.link;
}

export async function patchCaregiverAlias(params: {
  patientId: string;
  alias: string | null;
}): Promise<CaregiverLinkRecord> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord }>(
    API_PATHS.meCaregiverPatientPatch(params.patientId),
    { method: "PATCH", body: JSON.stringify({ alias: params.alias }) },
  );
  return res.link;
}

export async function getCaregiverLink(
  patientId: string,
): Promise<CaregiverLinkRecord | null> {
  const res = await apiFetch<{ ok: true; link: CaregiverLinkRecord | null }>(
    `${API_PATHS.meCaregiverLink}?patientId=${encodeURIComponent(patientId)}`,
  );
  return res.link;
}

export async function listMedicineActivityLogs(params: {
  medicineId: string;
  patientId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ logs: MedicineActivityLog[]; totalCapped: number }> {
  const base = params.patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineLogs(params.medicineId),
        params.patientId,
      )
    : API_PATHS.meMedicineLogs(params.medicineId);
  const url = `${base}${base.includes("?") ? "&" : "?"}limit=${encodeURIComponent(
    String(params.limit ?? 25),
  )}&offset=${encodeURIComponent(String(params.offset ?? 0))}`;

  const res = await apiFetch<{
    ok: true;
    logs: MedicineActivityLog[];
    totalCapped: number;
  }>(url);
  return { logs: res.logs, totalCapped: res.totalCapped };
}

export async function archiveMedicine(
  medicineId: string,
  patientId?: string | null,
): Promise<MedicineRecord> {
  const path = patientId
    ? withPatientId(API_PATHS.caregiverMedicineArchive(medicineId), patientId)
    : API_PATHS.meMedicineArchive(medicineId);
  const res = await apiFetch<{ ok: true; medicine: MedicineRecord }>(path, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  return res.medicine;
}

export async function listSchedules(
  medicineId: string,
  patientId?: string | null,
): Promise<ScheduleRecord[]> {
  const path = patientId
    ? withPatientId(API_PATHS.caregiverMedicineSchedules(medicineId), patientId)
    : API_PATHS.meMedicineSchedules(medicineId);
  const res = await apiFetch<{ ok: true; schedules: ScheduleRecord[] }>(path);
  return res.schedules;
}

export async function patchSchedule(params: {
  medicineId: string;
  scheduleId: string;
  patientId?: string | null;
  times?: string[];
  doseByTime?: Record<string, number> | null;
}): Promise<ScheduleRecord> {
  const path = params.patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineScheduleById(
          params.medicineId,
          params.scheduleId,
        ),
        params.patientId,
      )
    : API_PATHS.meMedicineScheduleById(params.medicineId, params.scheduleId);

  const body: any = {};
  if (params.times !== undefined) body.times = params.times;
  if (params.doseByTime !== undefined) body.doseByTime = params.doseByTime;

  const res = await apiFetch<{ ok: true; schedule: ScheduleRecord }>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return res.schedule;
}

export async function getMedicineVoiceNoteUrl(
  medicineId: string,
  patientId?: string | null,
): Promise<string> {
  const path = patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineVoiceNoteUrl(medicineId),
        patientId,
      )
    : API_PATHS.meMedicineVoiceNoteUrl(medicineId);
  const res = await apiFetch<{ ok: true; url: string }>(path);
  return res.url;
}

export async function createSchedule(params: {
  medicineId: string;
  patientId?: string | null;
  repeatType: RepeatType;
  intervalValue?: number | null;
  selectedDays?: number[] | null;
  times: string[];
  doseByTime?: Record<string, number> | null;
  startDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
}): Promise<ScheduleRecord> {
  const path = params.patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineSchedules(params.medicineId),
        params.patientId,
      )
    : API_PATHS.meMedicineSchedules(params.medicineId);
  const res = await apiFetch<{ ok: true; schedule: ScheduleRecord }>(path, {
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
  });

  return res.schedule;
}

export async function getTodayTimeline(params?: {
  date?: string;
  patientId?: string | null;
}): Promise<TimelineItem[]> {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);

  const basePath = params?.patientId
    ? withPatientId(API_PATHS.caregiverTimelineToday, params.patientId)
    : API_PATHS.meRemindersTimelineToday;

  const res = await apiFetch<{ ok: true; items: TimelineItem[] }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs}` : ""}`,
  );
  return res.items;
}

export async function getUpcomingIntakeEvents(params?: {
  daysAhead?: number;
  limit?: number;
  patientId?: string | null;
}): Promise<UpcomingIntakeItem[]> {
  const qs = new URLSearchParams();
  if (typeof params?.daysAhead === "number")
    qs.set("daysAhead", String(params.daysAhead));
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));

  const basePath = params?.patientId
    ? withPatientId(API_PATHS.caregiverRemindersUpcoming, params.patientId)
    : API_PATHS.meRemindersUpcoming;

  const res = await apiFetch<{ ok: true; items: UpcomingIntakeItem[] }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs}` : ""}`,
  );
  return res.items;
}

export async function getMedicineUpcoming(params: {
  medicineId: string;
  daysAhead?: number;
  limit?: number;
  patientId?: string | null;
}): Promise<UpcomingIntakeItem[]> {
  const qs = new URLSearchParams();
  if (typeof params.daysAhead === "number")
    qs.set("daysAhead", String(params.daysAhead));
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));

  const basePath = params.patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineUpcoming(params.medicineId),
        params.patientId,
      )
    : API_PATHS.meMedicineUpcoming(params.medicineId);
  const res = await apiFetch<{ ok: true; items: UpcomingIntakeItem[] }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs}` : ""}`,
  );
  return res.items;
}

export async function listMedicineHistory(params: {
  medicineId: string;
  limit?: number;
  offset?: number;
  days?: number;
  patientId?: string | null;
}): Promise<IntakeEventRecord[]> {
  const qs = new URLSearchParams();
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params.offset === "number")
    qs.set("offset", String(params.offset));
  if (typeof params.days === "number") qs.set("days", String(params.days));

  const basePath = params.patientId
    ? withPatientId(
        API_PATHS.caregiverMedicineHistory(params.medicineId),
        params.patientId,
      )
    : API_PATHS.meMedicineHistory(params.medicineId);

  const res = await apiFetch<{ ok: true; events: IntakeEventRecord[] }>(
    `${basePath}${qs.toString() ? `${basePath.includes("?") ? "&" : "?"}${qs}` : ""}`,
  );
  return res.events;
}

export async function markIntakeTaken(
  intakeEventId: string,
  patientId?: string | null,
): Promise<{
  event: IntakeEventRecord;
  medicine: MedicineRecord;
}> {
  const path = patientId
    ? withPatientId(
        API_PATHS.caregiverRemindersIntakeTaken(intakeEventId),
        patientId,
      )
    : API_PATHS.meRemindersIntakeTaken(intakeEventId);
  const res = await apiFetch<{
    ok: true;
    event: IntakeEventRecord;
    medicine: MedicineRecord;
  }>(path, {
    method: "PATCH",
    headers: { "Idempotency-Key": newIdempotencyKey() },
    body: JSON.stringify({}),
  });

  return { event: res.event, medicine: res.medicine };
}

export async function markIntakeSkipped(params: {
  intakeEventId: string;
  reason?: string | null;
  patientId?: string | null;
}): Promise<IntakeEventRecord> {
  const path = params.patientId
    ? withPatientId(
        API_PATHS.caregiverRemindersIntakeSkipped(params.intakeEventId),
        params.patientId,
      )
    : API_PATHS.meRemindersIntakeSkipped(params.intakeEventId);
  const res = await apiFetch<{ ok: true; event: IntakeEventRecord }>(path, {
    method: "PATCH",
    body: JSON.stringify({ reason: params.reason ?? null }),
  });

  return res.event;
}
