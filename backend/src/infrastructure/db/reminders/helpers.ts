import crypto from "crypto";

import { DateTime } from "luxon";

import type {
  AuditLogRecord,
  CaregiverAccessLevel,
  CaregiverLinkRecord,
  IntakeEventRecord,
  IntakeStatus,
  InstructionTag,
  MedicineRecord,
  MedicineType,
  RepeatType,
  RemovedMedicineRecord,
  ScheduleRecord,
} from "./types";

// Small shared helpers + row mappers for the reminders DB layer.
// Keep this file dependency-light so other modules can import it freely.

export function newUuid(): string {
  return crypto.randomUUID();
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

type IsoDateString = `${number}-${number}-${number}`;

export function isIsoDate(value: unknown): value is IsoDateString {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toIsoDateString(value: unknown): string | null {
  if (value == null) return null;

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (isIsoDate(s)) return s;

    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return null;
}

export function isTimeHms(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

export function normalizeTimeHms(value: string): string {
  const parts = value.split(":");
  if (parts.length === 2) return `${parts[0]}:${parts[1]}:00`;
  return `${parts[0]}:${parts[1]}:${parts[2]}`;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toIntArrayOrNull(value: unknown): number[] | null {
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

export function normalizeMedicineType(value: unknown): MedicineType {
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

export function normalizeInstructionTag(value: unknown): InstructionTag {
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

export function normalizeRepeatType(value: unknown): RepeatType {
  const v = typeof value === "string" ? value : "";
  if (v === "once" || v === "daily" || v === "weekly" || v === "interval")
    return v;
  return "daily";
}

export function normalizeStatus(value: unknown): IntakeStatus {
  const v = typeof value === "string" ? value : "";
  if (v === "pending" || v === "taken" || v === "missed" || v === "skipped")
    return v;
  return "pending";
}

export function normalizeTimezone(value: unknown): string {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return "UTC";
  const dt = DateTime.utc().setZone(tz);
  if (!dt.isValid) return "UTC";
  return tz;
}

export function rowToMedicine(row: any): MedicineRecord {
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

export function rowToRemovedMedicine(row: any): RemovedMedicineRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    type: normalizeMedicineType(row.type),
    dosePerIntake: toNumberOrNull(row.dose_per_intake) ?? 1,
    doseUnit: row.dose_unit == null ? null : String(row.dose_unit),
    removedAt: new Date(row.removed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function rowToSchedule(row: any): ScheduleRecord {
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

  const startDate = toIsoDateString(row.start_date) ?? "";
  const endDate = toIsoDateString(row.end_date);

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
    startDate,
    endDate,
    maxOccurrences:
      row.max_occurrences == null ? null : Number(row.max_occurrences),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function rowToEvent(row: any): IntakeEventRecord {
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

export function rowToCaregiverLink(row: any): CaregiverLinkRecord {
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

export function rowToAuditLog(row: any): AuditLogRecord {
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
