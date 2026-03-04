import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import { clampInt, normalizeTimezone } from "./helpers";
import type { ReminderSettings } from "./types";

// User-level reminder settings (timezone + grace/offset minutes).

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
