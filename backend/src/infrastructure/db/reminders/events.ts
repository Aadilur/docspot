import crypto from "crypto";

import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import { insertAuditLog } from "./audit";
import {
  clampInt,
  newUuid,
  normalizeStatus,
  rowToAuditLog,
  rowToEvent,
  rowToMedicine,
  toNumberOrNull,
} from "./helpers";
import type {
  AuditLogRecord,
  IntakeEventRecord,
  MedicineRecord,
  UpcomingIntakeItem,
} from "./types";

// Events: history, upcoming, and marking intake events.

export async function listMedicineHistory(params: {
  userId: string;
  medicineId: string;
  limit: number;
  offset: number;
}): Promise<IntakeEventRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 1, 500);
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
    // If response isn't saved yet (previous attempt failed), allow a retry.
    if (row.response != null) {
      return { consumed: false, response: row.response };
    }
    return { consumed: true };
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
        select *, (datetime > now()) as is_future
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

    const currentStatus = normalizeStatus(eventRow.status);

    // Disallow marking a future dose as taken (but allow idempotent replays).
    if (eventRow.is_future && currentStatus !== "taken") {
      throw new Error("cannot mark a future dose as taken");
    }

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

  const limit = clampInt(params.limit, 1, 500);
  const offset = clampInt(params.offset, 0, 100_000);
  const days = params.days == null ? null : clampInt(params.days, 1, 365);

  const result = await pg.query(
    `
      select e.*
      from medicine_intake_events e
      where e.user_id = $1::uuid
        and e.medicine_id = $2::uuid
        and e.datetime < now()
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

  const preflight = await pg.query(
    `
      select status, (datetime > now()) as is_future
      from medicine_intake_events
      where id = $1::uuid and user_id = $2::uuid
      limit 1;
    `,
    [params.intakeEventId, params.userId],
  );
  if (preflight.rows.length === 0) throw new Error("intake event not found");
  if (preflight.rows[0]?.is_future) {
    throw new Error("cannot skip a future dose");
  }

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
