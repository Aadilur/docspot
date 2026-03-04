import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import { insertAuditLog } from "./audit";
import {
  clampInt,
  isIsoDate,
  isTimeHms,
  newUuid,
  normalizeRepeatType,
  normalizeTimeHms,
  rowToSchedule,
  toIntArrayOrNull,
} from "./helpers";
import { getMedicine } from "./medicines";
import { generateUpcomingIntakeEventsForUser } from "./workers";
import type { RepeatType, ScheduleRecord } from "./types";

// Medicine schedules: create/update schedules.

export async function patchSchedule(params: {
  userId: string;
  scheduleId: string;
  actorUserId?: string | null;
  patch: {
    times?: string[];
    doseByTime?: Record<string, number> | null;
  };
}): Promise<ScheduleRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const currentRes = await pg.query(
    `
      select s.*
      from medicine_schedules s
      join medicines m on m.id = s.medicine_id
      where s.id = $1::uuid and m.user_id = $2::uuid
      limit 1;
    `,
    [params.scheduleId, params.userId],
  );
  if (currentRes.rows.length === 0) return null;

  const sets: string[] = [];
  const args: any[] = [params.scheduleId, params.userId];
  let i = 3;

  if (params.patch.times !== undefined) {
    if (!Array.isArray(params.patch.times) || params.patch.times.length === 0) {
      throw new Error("times is required");
    }

    const times: string[] = [];
    for (const raw of params.patch.times) {
      if (!isTimeHms(raw))
        throw new Error("times must be in HH:mm or HH:mm:ss");
      times.push(normalizeTimeHms(raw));
    }

    sets.push(`times = $${i}::time[]`);
    args.push(times);
    i++;
  }

  if (params.patch.doseByTime !== undefined) {
    const rawDoseByTime = params.patch.doseByTime;
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

    sets.push(`dose_by_time = $${i}::jsonb`);
    args.push(doseByTime == null ? null : JSON.stringify(doseByTime));
    i++;
  }

  if (sets.length === 0) {
    return rowToSchedule(currentRes.rows[0]);
  }

  const updatedRes = await pg.query(
    `
      update medicine_schedules s
      set ${sets.join(", ")}, updated_at = now()
      from medicines m
      where s.id = $1::uuid
        and s.medicine_id = m.id
        and m.user_id = $2::uuid
      returning s.*;
    `,
    args,
  );
  if (updatedRes.rows.length === 0) return null;

  await insertAuditLog({
    userId: params.userId,
    actorUserId: params.actorUserId,
    action: "schedule.patch",
    entityType: "schedule",
    entityId: params.scheduleId,
    metadata: {
      fields: sets.map((s) => s.split("=")[0]?.trim()).filter(Boolean),
    },
  });

  // Schedule changes should not keep stale future pending events.
  await pg.query(
    `
      delete from medicine_intake_events
      where user_id = $1::uuid
        and schedule_id = $2::uuid
        and status = 'pending'
        and datetime > now();
    `,
    [params.userId, params.scheduleId],
  );

  return rowToSchedule(updatedRes.rows[0]);
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
