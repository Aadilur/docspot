import { DateTime } from "luxon";

import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import {
  isIsoDate,
  normalizeMedicineType,
  rowToEvent,
  toNumberOrNull,
} from "./helpers";
import { getReminderSettings } from "./settings";
import type { TimelineItem } from "./types";

// Timeline: intake events for a given local date.

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
