import crypto from "crypto";

import { DateTime } from "luxon";

import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";
import { applyObjectDeletes } from "./storage";

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
  selectedDays: number[] | null; // 0 (Sun) .. 6 (Sat)
  times: string[]; // HH:mm:ss
  doseByTime: Record<string, number> | null; // key: HH:mm
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
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

export type CaregiverLinkStatus = "pending" | "accepted" | "rejected";

export type CaregiverAccessLevel = "view" | "edit" | "full";

export type CaregiverLinkRecord = {
  id: string;
  patientId: string;
  caregiverId: string;
  status: CaregiverLinkStatus;
  accessLevel: CaregiverAccessLevel;
  caregiverAlias: string | null;
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

export type AuditLogRecord = {
  id: string;
  userId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown | null;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string | null;
    email: string | null;
    photoUrl: string | null;
  } | null;
};

function newUuid(): string {
  return crypto.randomUUID();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeHms(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

function normalizeTimeHms(value: string): string {
  const parts = value.split(":");
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
  return `${parts[0]}:${parts[1]}:${parts[2]}`;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toIntArrayOrNull(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days: number[] = [];
  for (const v of value) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return null;
    const d = Math.trunc(n);
    if (d < 0 || d > 6) return null;
    days.push(d);
  }
  // normalize unique sorted
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function normalizeMedicineType(value: unknown): MedicineType {
  const v = typeof value === "string" ? value : "";
  if (
    v === "pill" ||
    v === "syrup" ||
    v === "injection" ||
    v === "inhaler" ||
    v === "other"
  )
    return v;
  return "pill";
}

function normalizeInstructionTag(value: unknown): InstructionTag {
  const v = typeof value === "string" ? value : "";
  if (
    v === "before_meal" ||
    v === "after_meal" ||
    v === "with_food" ||
    v === "empty_stomach" ||
    v === "none"
  )
    return v;
  return "none";
}

function normalizeRepeatType(value: unknown): RepeatType {
  const v = typeof value === "string" ? value : "";
  if (v === "once" || v === "daily" || v === "weekly" || v === "interval")
    return v;
  return "daily";
}

function normalizeStatus(value: unknown): IntakeStatus {
  const v = typeof value === "string" ? value : "";
  if (v === "pending" || v === "taken" || v === "missed" || v === "skipped")
    return v;
  return "pending";
}

function normalizeTimezone(value: unknown): string {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return "UTC";
  const dt = DateTime.utc().setZone(tz);
  if (!dt.isValid) return "UTC";
  return tz;
}

function rowToMedicine(row: any): MedicineRecord {
  const dose = toNumberOrNull(row.dose_per_intake) ?? 1;
  const id = String(row.id);
  const doseUnit = row.dose_unit == null ? null : String(row.dose_unit);
  const photoKey = row.photo_key == null ? null : String(row.photo_key);
  const voiceNoteKey =
    row.voice_note_key == null ? null : String(row.voice_note_key);
  const hasVoice = !!voiceNoteKey;
  return {
    id,
    userId: String(row.user_id),
    name: String(row.name),
    type: normalizeMedicineType(row.type),
    dosePerIntake: dose,
    doseUnit,
    stockTotal: toNumberOrNull(row.stock_total),
    stockRemaining: toNumberOrNull(row.stock_remaining),
    lowStockThreshold: toNumberOrNull(row.low_stock_threshold) ?? 5,
    instructionTag: normalizeInstructionTag(row.instruction_tag),
    note: row.note == null ? null : String(row.note),
    photoUrl: row.photo_url == null ? null : String(row.photo_url),
    photoKey,
    voiceNoteUrl: null,
    voiceNoteKey,
    isActive: !!row.is_active,
    archivedAt: row.archived_at
      ? new Date(row.archived_at).toISOString()
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToSchedule(row: any): ScheduleRecord {
  const timesRaw: unknown = row.times;
  const times = Array.isArray(timesRaw)
    ? timesRaw.map((t) => normalizeTimeHms(String(t)))
    : [];

  const daysRaw: unknown = row.selected_days;
  const selectedDays = Array.isArray(daysRaw)
    ? daysRaw.map((d) => clampInt(Number(d), 0, 6))
    : null;

  const rawDoseByTime: unknown = row.dose_by_time;
  const doseByTime: Record<string, number> | null =
    rawDoseByTime &&
    typeof rawDoseByTime === "object" &&
    !Array.isArray(rawDoseByTime)
      ? (Object.fromEntries(
          Object.entries(rawDoseByTime as any)
            .map(([k, v]) => {
              const key = String(k).slice(0, 5);
              const n = typeof v === "number" ? v : Number(v);
              return [key, n];
            })
            .filter(([, n]) => Number.isFinite(n) && (n as number) > 0),
        ) as Record<string, number>)
      : null;

  return {
    id: String(row.id),
    medicineId: String(row.medicine_id),
    repeatType: normalizeRepeatType(row.repeat_type),
    intervalValue:
      row.interval_value == null ? null : Number(row.interval_value),
    selectedDays,
    times,
    doseByTime:
      doseByTime && Object.keys(doseByTime).length > 0 ? doseByTime : null,
    startDate: String(row.start_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    maxOccurrences:
      row.max_occurrences == null ? null : Number(row.max_occurrences),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToEvent(row: any): IntakeEventRecord {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    medicineId: String(row.medicine_id),
    userId: String(row.user_id),
    datetimeUtc: new Date(row.datetime).toISOString(),
    status: normalizeStatus(row.status),
    takenAtUtc: row.taken_at ? new Date(row.taken_at).toISOString() : null,
    skippedReason:
      row.skipped_reason == null ? null : String(row.skipped_reason),
    createdAt: new Date(row.created_at).toISOString(),
    metadata: row.metadata ?? null,
  };
}

function rowToCaregiverLink(row: any): CaregiverLinkRecord {
  const rawLevel =
    typeof row.access_level === "string" ? row.access_level : "view";
  const accessLevel: CaregiverAccessLevel =
    rawLevel === "edit" || rawLevel === "full" || rawLevel === "view"
      ? rawLevel
      : "view";
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    caregiverId: String(row.caregiver_id),
    status:
      row.status === "accepted" ||
      row.status === "rejected" ||
      row.status === "pending"
        ? row.status
        : "pending",
    accessLevel,
    caregiverAlias:
      row.caregiver_alias == null ? null : String(row.caregiver_alias),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToAuditLog(row: any): AuditLogRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    actorUserId: row.actor_user_id == null ? null : String(row.actor_user_id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    metadata: row.metadata ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    actor:
      row.actor_id == null
        ? null
        : {
            id: String(row.actor_id),
            displayName:
              row.actor_display_name == null
                ? null
                : String(row.actor_display_name),
            email: row.actor_email == null ? null : String(row.actor_email),
            photoUrl:
              row.actor_photo_url == null ? null : String(row.actor_photo_url),
          },
  };
}

export async function getReminderSettings(
  userId: string,
): Promise<ReminderSettings> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      select timezone, reminder_offset_minutes, reminder_grace_minutes
      from users
      where id = $1::uuid
      limit 1;
    `,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error("user not found");
  }

  const row = result.rows[0];
  return {
    timezone: normalizeTimezone(row.timezone),
    reminderOffsetMinutes: clampInt(
      Number(row.reminder_offset_minutes ?? 0),
      0,
      24 * 60,
    ),
    reminderGraceMinutes: clampInt(
      Number(row.reminder_grace_minutes ?? 90),
      5,
      24 * 60,
    ),
  };
}

export async function patchReminderSettings(params: {
  userId: string;
  patch: Partial<ReminderSettings>;
}): Promise<ReminderSettings> {
  await ensureSchema();
  const pg = getPostgresPool();

  const current = await getReminderSettings(params.userId);
  const next: ReminderSettings = {
    timezone:
      params.patch.timezone === undefined
        ? current.timezone
        : normalizeTimezone(params.patch.timezone),
    reminderOffsetMinutes:
      params.patch.reminderOffsetMinutes === undefined
        ? current.reminderOffsetMinutes
        : clampInt(Number(params.patch.reminderOffsetMinutes), 0, 24 * 60),
    reminderGraceMinutes:
      params.patch.reminderGraceMinutes === undefined
        ? current.reminderGraceMinutes
        : clampInt(Number(params.patch.reminderGraceMinutes), 5, 24 * 60),
  };

  await pg.query(
    `
      update users
      set timezone = $2::text,
          reminder_offset_minutes = $3::int,
          reminder_grace_minutes = $4::int,
          updated_at = now()
      where id = $1::uuid;
    `,
    [
      params.userId,
      next.timezone,
      next.reminderOffsetMinutes,
      next.reminderGraceMinutes,
    ],
  );

  // If timezone changed, allow re-generation on the next worker tick.
  if (next.timezone !== current.timezone) {
    await pg.query(
      `
        update reminder_generation_state
        set last_local_date = null, updated_at = now()
        where user_id = $1::uuid;
      `,
      [params.userId],
    );
  }

  return next;
}

export async function createMedicine(params: {
  userId: string;
  name: string;
  type?: MedicineType;
  dosePerIntake?: number;
  doseUnit?: string | null;
  stockTotal?: number | null;
  stockRemaining?: number | null;
  lowStockThreshold?: number;
  instructionTag?: InstructionTag;
  note?: string | null;
  photoUrl?: string | null;
  photoKey?: string | null;
  voiceNoteKey?: string | null;
  voiceNoteFilename?: string | null;
  voiceNoteContentType?: string | null;
  actorUserId?: string | null;
}): Promise<MedicineRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const name = typeof params.name === "string" ? params.name.trim() : "";
  if (!name) throw new Error("name is required");
  if (name.length > 120) throw new Error("name is too long");

  const id = newUuid();
  const type = normalizeMedicineType(params.type);
  const dosePerIntake = Math.max(0.0001, Number(params.dosePerIntake ?? 1));
  const doseUnit =
    params.doseUnit == null
      ? null
      : String(params.doseUnit).trim().slice(0, 40) || null;
  const lowStockThreshold = Math.max(0, Number(params.lowStockThreshold ?? 5));
  const instructionTag = normalizeInstructionTag(params.instructionTag);

  const stockTotal =
    params.stockTotal == null ? null : Number(params.stockTotal);
  const stockRemaining =
    params.stockRemaining == null ? null : Number(params.stockRemaining);

  const note = params.note == null ? null : String(params.note).slice(0, 2000);
  const photoUrl =
    params.photoUrl == null ? null : String(params.photoUrl).slice(0, 500);
  const photoKey =
    params.photoKey == null ? null : String(params.photoKey).slice(0, 800);
  const voiceNoteKey =
    params.voiceNoteKey == null
      ? null
      : String(params.voiceNoteKey).slice(0, 800);
  const voiceNoteFilename =
    params.voiceNoteFilename == null
      ? null
      : String(params.voiceNoteFilename).slice(0, 300);
  const voiceNoteContentType =
    params.voiceNoteContentType == null
      ? null
      : String(params.voiceNoteContentType).slice(0, 120);

  const result = await pg.query(
    `
      insert into medicines (
        id, user_id, name, type, dose_per_intake, dose_unit,
        stock_total, stock_remaining, low_stock_threshold,
        instruction_tag, note, photo_url, photo_key,
        voice_note_key, voice_note_filename, voice_note_content_type,
        is_active, archived_at, created_at, updated_at
      )
      values (
        $1::uuid, $2::uuid, $3::text, $4::text, $5::numeric, $6::text,
        $7::numeric, $8::numeric, $9::numeric,
        $10::text, $11::text, $12::text, $13::text,
        $14::text, $15::text, $16::text,
        true, null, now(), now()
      )
      returning *;
    `,
    [
      id,
      params.userId,
      name,
      type,
      dosePerIntake,
      doseUnit,
      stockTotal,
      stockRemaining ?? stockTotal,
      lowStockThreshold,
      instructionTag,
      note,
      photoUrl,
      photoKey,
      voiceNoteKey,
      voiceNoteFilename,
      voiceNoteContentType,
    ],
  );

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "medicine.create",
    entityType: "medicine",
    entityId: id,
    metadata: { name, type },
  });

  return rowToMedicine(result.rows[0]);
}

export async function listMedicines(params: {
  userId: string;
  limit: number;
  offset: number;
  includeArchived?: boolean;
}): Promise<MedicineRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 50, 1);
  const offset = clampInt(params.offset, 0, 50_000);

  const includeArchived = !!params.includeArchived;

  const result = await pg.query(
    `
      select *
      from medicines
      where user_id = $1::uuid
        and ($2::boolean = true or archived_at is null)
      order by updated_at desc
      limit $3::int offset $4::int;
    `,
    [params.userId, includeArchived, limit, offset],
  );

  return result.rows.map(rowToMedicine);
}

export async function getMedicine(params: {
  userId: string;
  medicineId: string;
}): Promise<MedicineRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      select *
      from medicines
      where id = $1::uuid and user_id = $2::uuid
      limit 1;
    `,
    [params.medicineId, params.userId],
  );

  if (result.rows.length === 0) return null;
  return rowToMedicine(result.rows[0]);
}

export async function archiveMedicine(params: {
  userId: string;
  medicineId: string;
  actorUserId?: string | null;
}): Promise<MedicineRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      update medicines
      set is_active = false,
          archived_at = coalesce(archived_at, now()),
          updated_at = now()
      where id = $1::uuid and user_id = $2::uuid
      returning *;
    `,
    [params.medicineId, params.userId],
  );

  if (result.rows.length === 0) return null;

  await pg.query(
    `
      update medicine_intake_events
      set status = 'skipped',
          skipped_reason = coalesce(skipped_reason, 'archived')
      where user_id = $1::uuid
        and medicine_id = $2::uuid
        and status = 'pending'
        and datetime > now();
    `,
    [params.userId, params.medicineId],
  );

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "medicine.archive",
    entityType: "medicine",
    entityId: params.medicineId,
    metadata: null,
  });

  const med = rowToMedicine(result.rows[0]);

  // Free storage when a medicine is deleted/archived.
  // (The DB row keeps keys, but storage usage should reflect actual active objects.)
  const keysToDelete = [med.photoKey ?? "", med.voiceNoteKey ?? ""].filter(
    Boolean,
  );
  if (keysToDelete.length > 0) {
    try {
      await applyObjectDeletes({ userId: params.userId, keys: keysToDelete });
    } catch {
      // Best-effort: do not fail archive if storage cleanup fails.
    }
  }

  return med;
}

export async function patchMedicine(params: {
  userId: string;
  medicineId: string;
  actorUserId?: string | null;
  patch: {
    name?: string;
    type?: MedicineType;
    dosePerIntake?: number;
    doseUnit?: string | null;
    stockTotal?: number | null;
    stockRemaining?: number | null;
    lowStockThreshold?: number;
    instructionTag?: InstructionTag;
    note?: string | null;
    isActive?: boolean;
  };
}): Promise<MedicineRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const sets: string[] = [];
  const args: any[] = [params.medicineId, params.userId];
  let i = 3;

  if (typeof params.patch.name === "string") {
    const v = params.patch.name.trim();
    if (!v) throw new Error("name is required");
    sets.push(`name = $${i}::text`);
    args.push(v);
    i++;
  }

  if (params.patch.type !== undefined) {
    sets.push(`type = $${i}::text`);
    args.push(normalizeMedicineType(params.patch.type));
    i++;
  }

  if (params.patch.dosePerIntake !== undefined) {
    const n = Number(params.patch.dosePerIntake);
    if (!Number.isFinite(n) || n <= 0) throw new Error("dosePerIntake invalid");
    sets.push(`dose_per_intake = $${i}::numeric`);
    args.push(n);
    i++;
  }

  if (params.patch.doseUnit !== undefined) {
    const raw = params.patch.doseUnit;
    const v = raw == null ? null : String(raw).trim();
    sets.push(`dose_unit = $${i}::text`);
    args.push(v ? v : null);
    i++;
  }

  if (params.patch.stockTotal !== undefined) {
    const raw = params.patch.stockTotal;
    const v = raw == null ? null : Number(raw);
    if (v != null && (!Number.isFinite(v) || v < 0))
      throw new Error("stockTotal invalid");
    sets.push(`stock_total = $${i}::numeric`);
    args.push(v);
    i++;
  }

  if (params.patch.stockRemaining !== undefined) {
    const raw = params.patch.stockRemaining;
    const v = raw == null ? null : Number(raw);
    if (v != null && (!Number.isFinite(v) || v < 0))
      throw new Error("stockRemaining invalid");
    sets.push(`stock_remaining = $${i}::numeric`);
    args.push(v);
    i++;
  }

  if (params.patch.lowStockThreshold !== undefined) {
    const n = Number(params.patch.lowStockThreshold);
    if (!Number.isFinite(n) || n < 0)
      throw new Error("lowStockThreshold invalid");
    sets.push(`low_stock_threshold = $${i}::numeric`);
    args.push(n);
    i++;
  }

  if (params.patch.instructionTag !== undefined) {
    sets.push(`instruction_tag = $${i}::text`);
    args.push(normalizeInstructionTag(params.patch.instructionTag));
    i++;
  }

  if (params.patch.note !== undefined) {
    const raw = params.patch.note;
    const v = raw == null ? null : String(raw);
    sets.push(`note = $${i}::text`);
    args.push(v);
    i++;
  }

  if (params.patch.isActive !== undefined) {
    sets.push(`is_active = $${i}::boolean`);
    args.push(Boolean(params.patch.isActive));
    i++;
  }

  if (sets.length === 0) {
    return await getMedicine({
      userId: params.userId,
      medicineId: params.medicineId,
    });
  }

  const result = await pg.query(
    `
      update medicines
      set ${sets.join(", ")}, updated_at = now()
      where id = $1::uuid and user_id = $2::uuid
      returning *;
    `,
    args,
  );
  if (result.rows.length === 0) return null;

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "medicine.patch",
    entityType: "medicine",
    entityId: params.medicineId,
    metadata: {
      fields: sets.map((s) => s.split("=")[0]?.trim()).filter(Boolean),
    },
  });

  return rowToMedicine(result.rows[0]);
}

export async function createSchedule(params: {
  userId: string;
  actorUserId?: string | null;
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
  await ensureSchema();
  const pg = getPostgresPool();

  const med = await getMedicine({
    userId: params.userId,
    medicineId: params.medicineId,
  });
  if (!med) throw new Error("medicine not found");

  const repeatType = normalizeRepeatType(params.repeatType);
  const intervalValue =
    params.intervalValue == null
      ? null
      : clampInt(Number(params.intervalValue), 1, 365);

  const selectedDays =
    params.selectedDays === undefined
      ? null
      : toIntArrayOrNull(params.selectedDays);
  if (repeatType === "weekly" && (!selectedDays || selectedDays.length === 0)) {
    throw new Error("selectedDays is required for weekly schedules");
  }

  if (!Array.isArray(params.times) || params.times.length === 0) {
    throw new Error("times is required");
  }

  const times: string[] = [];
  for (const raw of params.times) {
    if (!isTimeHms(raw)) throw new Error("times must be in HH:mm or HH:mm:ss");
    times.push(normalizeTimeHms(raw));
  }

  const rawDoseByTime = params.doseByTime;
  const doseByTime: Record<string, number> | null =
    rawDoseByTime &&
    typeof rawDoseByTime === "object" &&
    !Array.isArray(rawDoseByTime)
      ? (Object.fromEntries(
          Object.entries(rawDoseByTime)
            .map(([k, v]) => {
              const key = String(k).slice(0, 5);
              const n = typeof v === "number" ? v : Number(v);
              return [key, n];
            })
            .filter(([, n]) => Number.isFinite(n) && (n as number) > 0),
        ) as Record<string, number>)
      : null;

  if (!isIsoDate(params.startDate))
    throw new Error("startDate must be YYYY-MM-DD");
  const startDate = params.startDate;

  const endDate =
    params.endDate == null
      ? null
      : isIsoDate(params.endDate)
        ? params.endDate
        : null;

  const maxOccurrences =
    params.maxOccurrences == null
      ? null
      : clampInt(Number(params.maxOccurrences), 1, 10000);

  if (repeatType === "interval" && !intervalValue) {
    throw new Error("intervalValue is required for interval schedules");
  }

  const id = newUuid();
  const result = await pg.query(
    `
      insert into medicine_schedules (
        id, medicine_id, repeat_type, interval_value, selected_days,
        times, dose_by_time, start_date, end_date, max_occurrences,
        created_at, updated_at
      )
      values (
        $1::uuid, $2::uuid, $3::text, $4::int, $5::int[],
        $6::time[], $7::jsonb, $8::date, $9::date, $10::int,
        now(), now()
      )
      returning *;
    `,
    [
      id,
      params.medicineId,
      repeatType,
      intervalValue,
      selectedDays,
      times,
      doseByTime == null ? null : JSON.stringify(doseByTime),
      startDate,
      endDate,
      maxOccurrences,
    ],
  );

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "schedule.create",
    entityType: "schedule",
    entityId: id,
    metadata: { medicineId: params.medicineId, repeatType },
  });

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "medicine.schedule_create",
    entityType: "medicine",
    entityId: params.medicineId,
    metadata: { scheduleId: id, repeatType, times },
  });

  // Best-effort: pre-generate upcoming events right away.
  await generateUpcomingIntakeEventsForUser({
    userId: params.userId,
    daysAhead: 7,
  }).catch(() => {
    // ignore
  });

  return rowToSchedule(result.rows[0]);
}

export async function listSchedules(params: {
  userId: string;
  medicineId: string;
}): Promise<ScheduleRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const med = await getMedicine({
    userId: params.userId,
    medicineId: params.medicineId,
  });
  if (!med) return [];

  const result = await pg.query(
    `
      select s.*
      from medicine_schedules s
      where s.medicine_id = $1::uuid
      order by s.updated_at desc;
    `,
    [params.medicineId],
  );

  return result.rows.map(rowToSchedule);
}

export async function getTimelineForLocalDate(params: {
  userId: string;
  localDate: string; // YYYY-MM-DD in user's timezone
}): Promise<TimelineItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (!isIsoDate(params.localDate)) throw new Error("date must be YYYY-MM-DD");

  const settings = await getReminderSettings(params.userId);
  const startLocal = DateTime.fromISO(params.localDate, {
    zone: settings.timezone,
  }).startOf("day");

  if (!startLocal.isValid) throw new Error("invalid date/timezone");

  const endLocal = startLocal.plus({ days: 1 });
  const startUtc = startLocal.toUTC().toISO();
  const endUtc = endLocal.toUTC().toISO();

  const result = await pg.query(
    `
      select
        e.*, 
        m.name as medicine_name,
        m.type as medicine_type,
        m.dose_per_intake as medicine_dose_per_intake,
        m.dose_unit as medicine_dose_unit
      from medicine_intake_events e
      join medicines m on m.id = e.medicine_id
      where e.user_id = $1::uuid
        and e.datetime >= $2::timestamptz
        and e.datetime < $3::timestamptz
      order by e.datetime asc;
    `,
    [params.userId, startUtc, endUtc],
  );

  return result.rows.map((row) => {
    const event = rowToEvent(row);
    return {
      ...event,
      medicine: {
        id: String(row.medicine_id),
        name: String(row.medicine_name),
        type: normalizeMedicineType(row.medicine_type),
        dosePerIntake: toNumberOrNull(row.medicine_dose_per_intake) ?? 1,
        doseUnit:
          row.medicine_dose_unit == null
            ? null
            : String(row.medicine_dose_unit),
      },
    };
  });
}

export async function listMedicineHistory(params: {
  userId: string;
  medicineId: string;
  limit: number;
  offset: number;
}): Promise<IntakeEventRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 50, 1);
  const offset = clampInt(params.offset, 0, 100_000);

  const result = await pg.query(
    `
      select e.*
      from medicine_intake_events e
      where e.user_id = $1::uuid and e.medicine_id = $2::uuid
      order by e.datetime desc
      limit $3::int offset $4::int;
    `,
    [params.userId, params.medicineId, limit, offset],
  );

  return result.rows.map(rowToEvent);
}

async function insertAuditLog(params: {
  userId: string;
  actorUserId?: string | null;
  action: string;
  entityType:
    | "medicine"
    | "schedule"
    | "intake_event"
    | "caregiver_link"
    | string;
  entityId: string;
  metadata: unknown | null;
}): Promise<void> {
  await ensureSchema();
  const pg = getPostgresPool();

  const actorId =
    params.actorUserId === undefined ? params.userId : params.actorUserId;

  await pg.query(
    `
      insert into audit_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::jsonb, now());
    `,
    [
      newUuid(),
      params.userId,
      actorId,
      params.action,
      params.entityType,
      params.entityId,
      params.metadata == null ? null : JSON.stringify(params.metadata),
    ],
  );

  // Enforce per-medicine log cap (keep newest 100).
  if (params.entityType === "medicine") {
    await pg.query(
      `
        delete from audit_logs
        where id in (
          select id
          from audit_logs
          where user_id = $1::uuid
            and entity_type = 'medicine'
            and entity_id = $2::text
          order by created_at desc
          offset 100
        );
      `,
      [params.userId, params.entityId],
    );
  }
}

export async function listMedicineActivityLogs(params: {
  userId: string;
  medicineId: string;
  limit: number;
  offset: number;
}): Promise<{ logs: AuditLogRecord[]; totalCapped: number }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(
    Number.isFinite(params.limit) ? params.limit : 25,
    1,
    50,
  );
  const offset = clampInt(
    Number.isFinite(params.offset) ? params.offset : 0,
    0,
    100,
  );

  const rows = await pg.query(
    `
      select
        l.*, 
        a.id as actor_id,
        a.display_name as actor_display_name,
        a.email as actor_email,
        a.photo_url as actor_photo_url
      from audit_logs l
      left join users a on a.id = l.actor_user_id
      where l.user_id = $1::uuid
        and l.entity_type = 'medicine'
        and l.entity_id = $2::text
      order by l.created_at desc
      limit $3::int offset $4::int;
    `,
    [params.userId, params.medicineId, limit, offset],
  );

  // total is capped at 100 by pruning, but count defensively.
  const countRes = await pg.query(
    `
      select count(*)::int as n
      from audit_logs
      where user_id = $1::uuid and entity_type = 'medicine' and entity_id = $2::text;
    `,
    [params.userId, params.medicineId],
  );

  return {
    logs: (rows.rows ?? []).map(rowToAuditLog),
    totalCapped: clampInt(Number(countRes.rows?.[0]?.n ?? 0), 0, 100),
  };
}

async function tryConsumeIdempotencyKey(params: {
  userId: string;
  key: string;
  requestHash: string;
}): Promise<{ consumed: true } | { consumed: false; response: any }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select response, request_hash
      from idempotency_keys
      where user_id = $1::uuid and key = $2::text
      limit 1;
    `,
    [params.userId, params.key],
  );

  if (res.rows.length > 0) {
    const row = res.rows[0];
    // If the same key is reused with a different payload, fail hard.
    if (row.request_hash && String(row.request_hash) !== params.requestHash) {
      throw new Error("idempotency key conflict");
    }
    return { consumed: false, response: row.response ?? null };
  }

  await pg.query(
    `
      insert into idempotency_keys (user_id, key, request_hash, response, created_at)
      values ($1::uuid, $2::text, $3::text, null, now());
    `,
    [params.userId, params.key, params.requestHash],
  );

  return { consumed: true };
}

async function saveIdempotencyResponse(params: {
  userId: string;
  key: string;
  response: any;
}): Promise<void> {
  await ensureSchema();
  const pg = getPostgresPool();
  await pg.query(
    `
      update idempotency_keys
      set response = $3::jsonb
      where user_id = $1::uuid and key = $2::text;
    `,
    [params.userId, params.key, JSON.stringify(params.response ?? null)],
  );
}

export async function markIntakeEventTaken(params: {
  userId: string;
  intakeEventId: string;
  idempotencyKey?: string | null;
  actorUserId?: string | null;
}): Promise<{
  event: IntakeEventRecord;
  medicine: MedicineRecord;
  warning: string | null;
}> {
  await ensureSchema();
  const pg = getPostgresPool();

  const idemKey =
    params.idempotencyKey && typeof params.idempotencyKey === "string"
      ? params.idempotencyKey.trim().slice(0, 200)
      : "";

  const requestHash = crypto
    .createHash("sha256")
    .update(`taken:${params.intakeEventId}`)
    .digest("hex");

  if (idemKey) {
    const consumed = await tryConsumeIdempotencyKey({
      userId: params.userId,
      key: idemKey,
      requestHash,
    });
    if (!consumed.consumed) {
      return consumed.response;
    }
  }

  const client = await pg.connect();
  try {
    await client.query("begin");

    const eventRes = await client.query(
      `
        select *
        from medicine_intake_events
        where id = $1::uuid and user_id = $2::uuid
        for update;
      `,
      [params.intakeEventId, params.userId],
    );

    if (eventRes.rows.length === 0) {
      throw new Error("intake event not found");
    }

    const eventRow = eventRes.rows[0];

    // Lock medicine row to make stock decrement concurrency-safe.
    const medicineRes = await client.query(
      `
        select *
        from medicines
        where id = $1::uuid and user_id = $2::uuid
        for update;
      `,
      [eventRow.medicine_id, params.userId],
    );

    if (medicineRes.rows.length === 0) {
      throw new Error("medicine not found");
    }

    const medicineRow = medicineRes.rows[0];

    const currentStatus = normalizeStatus(eventRow.status);

    if (currentStatus !== "taken") {
      await client.query(
        `
          update medicine_intake_events
          set status = 'taken',
              taken_at = coalesce(taken_at, now())
          where id = $1::uuid and user_id = $2::uuid;
        `,
        [params.intakeEventId, params.userId],
      );

      // Stock management (best-effort; only when stock_remaining is set).
      const defaultDose = toNumberOrNull(medicineRow.dose_per_intake) ?? 1;
      const meta = eventRow.metadata;
      let dosePerIntake = defaultDose;
      if (meta && typeof meta === "object") {
        const raw = (meta as any).doseAmount;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(n) && n > 0) dosePerIntake = n;
      }
      const stockRemaining = toNumberOrNull(medicineRow.stock_remaining);
      const lowStockThreshold =
        toNumberOrNull(medicineRow.low_stock_threshold) ?? 5;

      let warning: string | null = null;

      if (stockRemaining != null) {
        const nextRemaining = Math.max(0, stockRemaining - dosePerIntake);

        await client.query(
          `
            update medicines
            set stock_remaining = $3::numeric,
                updated_at = now()
            where id = $1::uuid and user_id = $2::uuid;
          `,
          [eventRow.medicine_id, params.userId, nextRemaining],
        );

        if (nextRemaining <= lowStockThreshold) {
          warning = "low_stock";
        }

        if (nextRemaining <= 0) {
          warning = "out_of_stock";
          await client.query(
            `
              update medicines
              set is_active = false,
                  updated_at = now()
              where id = $1::uuid and user_id = $2::uuid;
            `,
            [eventRow.medicine_id, params.userId],
          );

          await client.query(
            `
              update medicine_intake_events
              set status = 'skipped',
                  skipped_reason = coalesce(skipped_reason, 'out_of_stock')
              where user_id = $1::uuid
                and medicine_id = $2::uuid
                and status = 'pending'
                and datetime > now();
            `,
            [params.userId, eventRow.medicine_id],
          );
        }

        await client.query(
          `
            insert into audit_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
            values ($1::uuid, $2::uuid, $3::uuid, 'medicine.stock_update', 'medicine', $4::text, $5::jsonb, now());
          `,
          [
            newUuid(),
            params.userId,
            params.actorUserId === undefined
              ? params.userId
              : params.actorUserId,
            String(eventRow.medicine_id),
            JSON.stringify({
              previous: stockRemaining,
              next: nextRemaining,
              dosePerIntake,
              defaultDose,
            }),
          ],
        );

        // Cap per-medicine logs to newest 100.
        await client.query(
          `
            delete from audit_logs
            where id in (
              select id
              from audit_logs
              where user_id = $1::uuid
                and entity_type = 'medicine'
                and entity_id = $2::text
              order by created_at desc
              offset 100
            );
          `,
          [params.userId, String(eventRow.medicine_id)],
        );
      }

      await client.query(
        `
          insert into audit_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
          values ($1::uuid, $2::uuid, $3::uuid, 'intake_event.taken', 'intake_event', $4::text, $5::jsonb, now());
        `,
        [
          newUuid(),
          params.userId,
          params.actorUserId === undefined ? params.userId : params.actorUserId,
          params.intakeEventId,
          JSON.stringify({ statusFrom: currentStatus }),
        ],
      );

      await client.query(
        `
          insert into audit_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
          values ($1::uuid, $2::uuid, $3::uuid, 'medicine.intake_taken', 'medicine', $4::text, $5::jsonb, now());
        `,
        [
          newUuid(),
          params.userId,
          params.actorUserId === undefined ? params.userId : params.actorUserId,
          String(eventRow.medicine_id),
          JSON.stringify({
            intakeEventId: params.intakeEventId,
            statusFrom: currentStatus,
          }),
        ],
      );

      await client.query(
        `
          delete from audit_logs
          where id in (
            select id
            from audit_logs
            where user_id = $1::uuid
              and entity_type = 'medicine'
              and entity_id = $2::text
            order by created_at desc
            offset 100
          );
        `,
        [params.userId, String(eventRow.medicine_id)],
      );

      const refreshedEventRes = await client.query(
        `
          select *
          from medicine_intake_events
          where id = $1::uuid and user_id = $2::uuid
          limit 1;
        `,
        [params.intakeEventId, params.userId],
      );

      const refreshedMedicineRes = await client.query(
        `
          select *
          from medicines
          where id = $1::uuid and user_id = $2::uuid
          limit 1;
        `,
        [eventRow.medicine_id, params.userId],
      );

      const response = {
        event: rowToEvent(refreshedEventRes.rows[0] ?? eventRow),
        medicine: rowToMedicine(refreshedMedicineRes.rows[0] ?? medicineRow),
        warning,
      };

      await client.query("commit");

      if (idemKey)
        await saveIdempotencyResponse({
          userId: params.userId,
          key: idemKey,
          response,
        });
      return response;
    }

    const response = {
      event: rowToEvent(eventRow),
      medicine: rowToMedicine(medicineRow),
      warning: null,
    };

    await client.query("commit");

    if (idemKey)
      await saveIdempotencyResponse({
        userId: params.userId,
        key: idemKey,
        response,
      });
    return response;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

export type UpcomingIntakeItem = IntakeEventRecord & {
  medicine: Pick<MedicineRecord, "id" | "name" | "type" | "dosePerIntake">;
};

export async function listUpcomingIntakeEvents(params: {
  userId: string;
  nowUtc?: string; // ISO, defaults to now()
  untilUtc: string; // ISO
  limit: number;
}): Promise<UpcomingIntakeItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 200, 2000);
  const nowUtc = params.nowUtc ? String(params.nowUtc) : null;
  const untilUtc = String(params.untilUtc);

  const result = await pg.query(
    `
      select
        e.*, 
        m.name as medicine_name,
        m.type as medicine_type,
        m.dose_per_intake as medicine_dose_per_intake
      from medicine_intake_events e
      join medicines m on m.id = e.medicine_id
      where e.user_id = $1::uuid
        and e.status = 'pending'
        and e.datetime >= coalesce($2::timestamptz, now())
        and e.datetime < $3::timestamptz
      order by e.datetime asc
      limit $4::int;
    `,
    [params.userId, nowUtc, untilUtc, limit],
  );

  return result.rows.map((row) => {
    const event = rowToEvent(row);
    return {
      ...event,
      medicine: {
        id: String(row.medicine_id),
        name: String(row.medicine_name),
        type: String(row.medicine_type) as any,
        dosePerIntake: Number(row.medicine_dose_per_intake),
      },
    };
  });
}

export async function listUpcomingIntakeEventsForMedicine(params: {
  userId: string;
  medicineId: string;
  nowUtc?: string;
  untilUtc: string;
  limit: number;
}): Promise<UpcomingIntakeItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 50, 500);
  const nowUtc = params.nowUtc ? String(params.nowUtc) : null;
  const untilUtc = String(params.untilUtc);

  const result = await pg.query(
    `
      select
        e.*, 
        m.name as medicine_name,
        m.type as medicine_type,
        m.dose_per_intake as medicine_dose_per_intake
      from medicine_intake_events e
      join medicines m on m.id = e.medicine_id
      where e.user_id = $1::uuid
        and e.medicine_id = $2::uuid
        and e.status = 'pending'
        and e.datetime >= coalesce($3::timestamptz, now())
        and e.datetime < $4::timestamptz
      order by e.datetime asc
      limit $5::int;
    `,
    [params.userId, params.medicineId, nowUtc, untilUtc, limit],
  );

  return result.rows.map((row) => {
    const event = rowToEvent(row);
    return {
      ...event,
      medicine: {
        id: String(row.medicine_id),
        name: String(row.medicine_name),
        type: String(row.medicine_type) as any,
        dosePerIntake: Number(row.medicine_dose_per_intake),
      },
    };
  });
}

export async function listMedicineIntakeHistory(params: {
  userId: string;
  medicineId: string;
  limit: number;
  offset: number;
  days?: number;
}): Promise<IntakeEventRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 50, 500);
  const offset = clampInt(params.offset, 0, 100_000);
  const days = params.days == null ? null : clampInt(params.days, 30, 365);

  const result = await pg.query(
    `
      select e.*
      from medicine_intake_events e
      where e.user_id = $1::uuid
        and e.medicine_id = $2::uuid
        and ($3::int is null or e.datetime >= (now() - make_interval(days => $3::int)))
      order by e.datetime desc
      limit $4::int offset $5::int;
    `,
    [params.userId, params.medicineId, days, limit, offset],
  );

  return result.rows.map(rowToEvent);
}

export async function markIntakeEventSkipped(params: {
  userId: string;
  intakeEventId: string;
  reason?: string | null;
  actorUserId?: string | null;
}): Promise<IntakeEventRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const reason =
    params.reason == null ? null : String(params.reason).trim().slice(0, 200);

  const result = await pg.query(
    `
      update medicine_intake_events
      set status = 'skipped',
          skipped_reason = coalesce($3::text, skipped_reason, 'skipped')
      where id = $1::uuid and user_id = $2::uuid
      returning *;
    `,
    [params.intakeEventId, params.userId, reason],
  );

  if (result.rows.length === 0) throw new Error("intake event not found");

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "intake_event.skipped",
    entityType: "intake_event",
    entityId: params.intakeEventId,
    metadata: { reason },
  });

  const event = rowToEvent(result.rows[0]);
  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "medicine.intake_skipped",
    entityType: "medicine",
    entityId: event.medicineId,
    metadata: { intakeEventId: params.intakeEventId, reason },
  });

  return event;
}

function shouldCreateEventForLocalDate(params: {
  schedule: ScheduleRecord;
  localDate: DateTime; // at startOf('day') in user zone
  daysSinceStart: number;
}): boolean {
  const { schedule, localDate, daysSinceStart } = params;

  if (schedule.repeatType === "once") {
    return localDate.toISODate() === schedule.startDate;
  }

  if (schedule.repeatType === "daily") {
    return true;
  }

  if (schedule.repeatType === "weekly") {
    const selected = schedule.selectedDays ?? [];
    // Luxon: weekday is 1 (Mon) .. 7 (Sun)
    const dow0 = localDate.weekday === 7 ? 0 : localDate.weekday;
    return selected.includes(dow0);
  }

  if (schedule.repeatType === "interval") {
    const interval = schedule.intervalValue ?? 1;
    return daysSinceStart >= 0 && daysSinceStart % interval === 0;
  }

  return false;
}

async function countOccurrencesForSchedule(
  client: any,
  scheduleId: string,
): Promise<number> {
  const res = await client.query(
    `
      select count(1) as c
      from medicine_intake_events
      where schedule_id = $1::uuid;
    `,
    [scheduleId],
  );
  const raw = res.rows?.[0]?.c;
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export async function generateUpcomingIntakeEventsForUser(params: {
  userId: string;
  daysAhead: number;
}): Promise<{ inserted: number }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const daysAhead = clampInt(Number(params.daysAhead ?? 7), 1, 31);
  const settings = await getReminderSettings(params.userId);

  const nowLocal = DateTime.utc().setZone(settings.timezone);
  if (!nowLocal.isValid) throw new Error("invalid timezone");

  const startLocalDay = nowLocal.startOf("day");
  const endLocalDay = startLocalDay.plus({ days: daysAhead });

  // Fetch active medicines + schedules.
  const schedulesRes = await pg.query(
    `
      select
        s.*,
        m.dose_per_intake as medicine_dose_per_intake,
        m.dose_unit as medicine_dose_unit
      from medicine_schedules s
      join medicines m on m.id = s.medicine_id
      where m.user_id = $1::uuid
        and m.is_active = true
        and m.archived_at is null;
    `,
    [params.userId],
  );

  const schedules = schedulesRes.rows.map((row) => ({
    schedule: rowToSchedule(row),
    medicineDosePerIntake: toNumberOrNull(row.medicine_dose_per_intake) ?? 1,
    medicineDoseUnit:
      row.medicine_dose_unit == null ? null : String(row.medicine_dose_unit),
  }));
  if (schedules.length === 0) return { inserted: 0 };

  const events: Array<{
    id: string;
    scheduleId: string;
    medicineId: string;
    userId: string;
    datetimeUtc: string;
    metadata: any | null;
  }> = [];

  // For maxOccurrences, we need current counts once per schedule.
  const client = await pg.connect();
  try {
    await client.query("begin");

    const occurrencesMap = new Map<string, number>();
    for (const packed of schedules) {
      const s = packed.schedule;
      if (s.maxOccurrences != null) {
        const count = await countOccurrencesForSchedule(client, s.id);
        occurrencesMap.set(s.id, count);
      }
    }

    for (const packed of schedules) {
      const s = packed.schedule;

      const startDateLocal = DateTime.fromISO(s.startDate, {
        zone: settings.timezone,
      }).startOf("day");
      if (!startDateLocal.isValid) continue;

      const scheduleEndDateLocal = s.endDate
        ? DateTime.fromISO(s.endDate, { zone: settings.timezone }).endOf("day")
        : null;

      let currentLocalDay = startLocalDay;
      while (currentLocalDay < endLocalDay) {
        if (currentLocalDay < startDateLocal) {
          currentLocalDay = currentLocalDay.plus({ days: 1 });
          continue;
        }
        if (scheduleEndDateLocal && currentLocalDay > scheduleEndDateLocal) {
          break;
        }

        const daysSinceStart = Math.floor(
          currentLocalDay.diff(startDateLocal, "days").days,
        );
        if (
          !shouldCreateEventForLocalDate({
            schedule: s,
            localDate: currentLocalDay,
            daysSinceStart,
          })
        ) {
          currentLocalDay = currentLocalDay.plus({ days: 1 });
          continue;
        }

        for (const time of s.times) {
          const [hh, mm, ss] = time.split(":").map((x) => Number(x));
          const localDt = currentLocalDay.set({
            hour: hh,
            minute: mm,
            second: ss,
            millisecond: 0,
          });
          if (!localDt.isValid) continue;

          // Respect maxOccurrences (best-effort).
          if (s.maxOccurrences != null) {
            const already = occurrencesMap.get(s.id) ?? 0;
            if (already >= s.maxOccurrences) break;
            occurrencesMap.set(s.id, already + 1);
          }

          const utc = localDt.toUTC().toISO();
          if (!utc) continue;

          const timeKey = time.slice(0, 5);
          const override = s.doseByTime?.[timeKey];
          const n = typeof override === "number" ? override : Number(override);
          const doseAmount =
            Number.isFinite(n) && n > 0 ? n : packed.medicineDosePerIntake;
          const metadata: any = { doseAmount };
          if (packed.medicineDoseUnit)
            metadata.doseUnit = packed.medicineDoseUnit;

          events.push({
            id: newUuid(),
            scheduleId: s.id,
            medicineId: s.medicineId,
            userId: params.userId,
            datetimeUtc: utc,
            metadata,
          });
        }

        currentLocalDay = currentLocalDay.plus({ days: 1 });
      }
    }

    if (events.length === 0) {
      await client.query("commit");
      return { inserted: 0 };
    }

    // Bulk insert with ON CONFLICT DO NOTHING (unique schedule_id + datetime).
    const valuesSql: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const e of events) {
      valuesSql.push(
        `($${i++}::uuid, $${i++}::uuid, $${i++}::uuid, $${i++}::uuid, $${i++}::timestamptz, 'pending', $${i++}::jsonb, now())`,
      );
      args.push(
        e.id,
        e.scheduleId,
        e.medicineId,
        e.userId,
        e.datetimeUtc,
        e.metadata == null ? null : JSON.stringify(e.metadata),
      );
    }

    const insertRes = await client.query(
      `
        insert into medicine_intake_events (
          id, schedule_id, medicine_id, user_id, datetime, status, metadata, created_at
        )
        values ${valuesSql.join(",")}
        on conflict (schedule_id, datetime) do nothing;
      `,
      args,
    );

    await client.query("commit");

    // pg doesn't reliably return inserted count for multi-row insert with do nothing.
    const inserted =
      typeof insertRes.rowCount === "number" ? insertRes.rowCount : 0;
    return { inserted };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function runDailyGenerationTick(params: {
  batchLimit?: number;
  daysAhead?: number;
  windowMinutes?: number;
}): Promise<{ processedUsers: number; insertedEvents: number }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const batchLimit = clampInt(Number(params.batchLimit ?? 250), 250, 1);
  const daysAhead = clampInt(Number(params.daysAhead ?? 7), 7, 1);
  const windowMinutes = clampInt(Number(params.windowMinutes ?? 20), 20, 1);

  // Select only users currently within their local midnight window AND not generated today.
  // This avoids scanning the whole users table every tick.
  const usersRes = await pg.query(
    `
      with candidate as (
        select
          u.id,
          u.timezone,
          (now() at time zone u.timezone) as local_now,
          (date_trunc('day', now() at time zone u.timezone)) as local_midnight,
          ((now() at time zone u.timezone)::date) as local_date,
          s.last_local_date
        from users u
        left join reminder_generation_state s on s.user_id = u.id
      )
      select id, timezone, local_date
      from candidate
      where extract(epoch from (local_now - local_midnight)) / 60.0 >= 0
        and extract(epoch from (local_now - local_midnight)) / 60.0 <= $1::int
        and (last_local_date is null or last_local_date <> local_date)
      order by id asc
      limit $2::int;
    `,
    [windowMinutes, batchLimit],
  );

  let processedUsers = 0;
  let insertedEvents = 0;

  for (const u of usersRes.rows) {
    const userId = String(u.id);
    const localDate = u.local_date == null ? null : String(u.local_date);
    if (!localDate) continue;

    const generated = await generateUpcomingIntakeEventsForUser({
      userId,
      daysAhead,
    });
    insertedEvents += generated.inserted;

    await pg.query(
      `
        insert into reminder_generation_state (user_id, last_local_date, updated_at)
        values ($1::uuid, $2::date, now())
        on conflict (user_id)
        do update set last_local_date = excluded.last_local_date, updated_at = now();
      `,
      [userId, localDate],
    );

    processedUsers += 1;
  }

  return { processedUsers, insertedEvents };
}

export async function runMissedDoseTick(params?: {
  batchLimit?: number;
}): Promise<{ markedMissed: number }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const batchLimit = clampInt(Number(params?.batchLimit ?? 500), 1, 50_000);

  // Mark missed doses using each user's configured grace period.
  // Limit is applied to avoid huge updates in a single tick.
  const updated = await pg.query(
    `
      with candidates as (
        select e.id as id, e.user_id as user_id, u.reminder_grace_minutes as grace
        from medicine_intake_events e
        join users u on u.id = e.user_id
        where e.status = 'pending'
          and e.datetime < (now() - make_interval(mins => u.reminder_grace_minutes))
        order by e.datetime asc
        limit $1::int
      ),
      updated as (
        update medicine_intake_events e
        set status = 'missed'
        from candidates c
        where e.id = c.id
        returning e.id as intake_event_id, e.user_id as user_id, c.grace as grace
      )
      select * from updated;
    `,
    [batchLimit],
  );

  const rows = updated.rows ?? [];
  if (rows.length === 0) return { markedMissed: 0 };

  // Bulk audit insert.
  const values: string[] = [];
  const args: any[] = [];
  let i = 1;
  for (const r of rows) {
    values.push(
      `($${i++}::uuid, $${i++}::uuid, 'intake_event.missed', 'intake_event', $${i++}::text, $${i++}::jsonb, now())`,
    );
    args.push(
      newUuid(),
      String(r.user_id),
      String(r.intake_event_id),
      JSON.stringify({ graceMinutes: Number(r.grace ?? 90) }),
    );
  }

  await pg.query(
    `
      insert into audit_logs (id, user_id, action, entity_type, entity_id, metadata, created_at)
      values ${values.join(",")};
    `,
    args,
  );

  return { markedMissed: rows.length };
}

export async function inviteCaregiver(params: {
  patientId: string;
  caregiverId: string;
  accessLevel?: CaregiverAccessLevel | null;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (params.patientId === params.caregiverId) {
    throw new Error("cannot link to self");
  }

  const id = newUuid();
  const levelRaw = params.accessLevel ?? "view";
  const accessLevel: CaregiverAccessLevel =
    levelRaw === "edit" || levelRaw === "full" || levelRaw === "view"
      ? levelRaw
      : "view";
  const result = await pg.query(
    `
      insert into caregiver_links (id, patient_id, caregiver_id, status, created_at)
      values ($1::uuid, $2::uuid, $3::uuid, 'pending', now())
      on conflict (patient_id, caregiver_id)
      do update set status = 'pending', access_level = $4::text
      returning *;
    `,
    [id, params.patientId, params.caregiverId, accessLevel],
  );

  // Ensure access level is set for both new and existing rows.
  await pg.query(
    `
      update caregiver_links
      set access_level = $3::text
      where patient_id = $1::uuid and caregiver_id = $2::uuid;
    `,
    [params.patientId, params.caregiverId, accessLevel],
  );

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.patientId,
    action: "caregiver.invite",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId, accessLevel },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function rejectCaregiverInvite(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      update caregiver_links
      set status = 'rejected'
      where patient_id = $1::uuid and caregiver_id = $2::uuid
      returning *;
    `,
    [params.patientId, params.caregiverId],
  );
  if (result.rows.length === 0) throw new Error("invite not found");

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.caregiverId,
    action: "caregiver.reject",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function acceptCaregiverInvite(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      update caregiver_links
      set status = 'accepted'
      where patient_id = $1::uuid and caregiver_id = $2::uuid
      returning *;
    `,
    [params.patientId, params.caregiverId],
  );

  if (result.rows.length === 0) throw new Error("invite not found");

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.caregiverId,
    action: "caregiver.accept",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function listCaregiverRequests(params: {
  caregiverId: string;
}): Promise<CaregiverRequestItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        cl.*, 
        u.id as patient_user_id,
        u.display_name as patient_display_name,
        u.email as patient_email,
        u.photo_url as patient_photo_url
      from caregiver_links cl
      join users u on u.id = cl.patient_id
      where cl.caregiver_id = $1::uuid
        and cl.status = 'pending'
      order by cl.created_at desc
      limit 200;
    `,
    [params.caregiverId],
  );

  return (res.rows ?? []).map((r: any) => ({
    link: rowToCaregiverLink(r),
    patient: {
      id: String(r.patient_user_id),
      displayName:
        r.patient_display_name == null ? null : String(r.patient_display_name),
      email: r.patient_email == null ? null : String(r.patient_email),
      photoUrl:
        r.patient_photo_url == null ? null : String(r.patient_photo_url),
    },
  }));
}

export async function listCaregiverPatients(params: {
  caregiverId: string;
}): Promise<CaregiverPatientItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        cl.*, 
        u.id as patient_user_id,
        u.display_name as patient_display_name,
        u.email as patient_email,
        u.photo_url as patient_photo_url
      from caregiver_links cl
      join users u on u.id = cl.patient_id
      where cl.caregiver_id = $1::uuid
        and cl.status = 'accepted'
      order by cl.created_at desc
      limit 200;
    `,
    [params.caregiverId],
  );

  return (res.rows ?? []).map((r: any) => ({
    link: rowToCaregiverLink(r),
    patient: {
      id: String(r.patient_user_id),
      displayName:
        r.patient_display_name == null ? null : String(r.patient_display_name),
      email: r.patient_email == null ? null : String(r.patient_email),
      photoUrl:
        r.patient_photo_url == null ? null : String(r.patient_photo_url),
    },
  }));
}

export async function patchCaregiverAlias(params: {
  caregiverId: string;
  patientId: string;
  alias: string | null;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const a = params.alias == null ? null : String(params.alias).trim();
  const alias = a ? a.slice(0, 80) : null;

  const res = await pg.query(
    `
      update caregiver_links
      set caregiver_alias = $3::text
      where caregiver_id = $1::uuid
        and patient_id = $2::uuid
        and status = 'accepted'
      returning *;
    `,
    [params.caregiverId, params.patientId, alias],
  );
  if (res.rows.length === 0) throw new Error("link not found");
  return rowToCaregiverLink(res.rows[0]);
}

export async function getCaregiverLink(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();
  const res = await pg.query(
    `
      select *
      from caregiver_links
      where caregiver_id = $1::uuid and patient_id = $2::uuid
      limit 1;
    `,
    [params.caregiverId, params.patientId],
  );
  if (res.rows.length === 0) return null;
  return rowToCaregiverLink(res.rows[0]);
}

export async function requireCaregiverAccessLevel(params: {
  caregiverId: string;
  patientId: string;
  minLevel: CaregiverAccessLevel;
}): Promise<CaregiverAccessLevel> {
  await ensureSchema();
  const pg = getPostgresPool();
  const res = await pg.query(
    `
      select access_level
      from caregiver_links
      where patient_id = $1::uuid
        and caregiver_id = $2::uuid
        and status = 'accepted'
      limit 1;
    `,
    [params.patientId, params.caregiverId],
  );
  if (res.rows.length === 0) throw new Error("forbidden");

  const raw = String(res.rows[0].access_level ?? "view");
  const level: CaregiverAccessLevel =
    raw === "edit" || raw === "full" || raw === "view" ? raw : "view";

  const order: Record<CaregiverAccessLevel, number> = {
    view: 1,
    edit: 2,
    full: 3,
  };
  if (order[level] < order[params.minLevel]) throw new Error("forbidden");
  return level;
}

export async function requireCaregiverAccess(params: {
  caregiverId: string;
  patientId: string;
}): Promise<void> {
  await requireCaregiverAccessLevel({
    caregiverId: params.caregiverId,
    patientId: params.patientId,
    minLevel: "view",
  });
}
