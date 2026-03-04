import { DateTime } from "luxon";

import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import {
  clampInt,
  newUuid,
  rowToSchedule,
  toIsoDateString,
  toNumberOrNull,
} from "./helpers";
import { getReminderSettings } from "./settings";
import type { ScheduleRecord } from "./types";

// Worker helpers for pre-generating intake events and maintenance ticks.

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

  const batchLimit = clampInt(Number(params.batchLimit ?? 250), 1, 5000);
  const daysAhead = clampInt(Number(params.daysAhead ?? 7), 1, 31);
  const windowMinutes = clampInt(Number(params.windowMinutes ?? 20), 1, 120);

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
    const localDate = toIsoDateString(u.local_date);
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
