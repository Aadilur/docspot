import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";
import { applyObjectDeletes } from "../storage";

import { insertAuditLog } from "./audit";
import {
  clampInt,
  newUuid,
  normalizeInstructionTag,
  normalizeMedicineType,
  rowToMedicine,
  rowToRemovedMedicine,
} from "./helpers";
import type {
  InstructionTag,
  MedicineRecord,
  MedicineType,
  RemovedMedicineRecord,
} from "./types";

// Medicines: CRUD + archive (hard delete + removed summary).

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

  const limit = clampInt(params.limit, 1, 100);
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

export async function listRemovedMedicines(params: {
  userId: string;
  limit: number;
  offset: number;
}): Promise<RemovedMedicineRecord[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = clampInt(params.limit, 1, 100);
  const offset = clampInt(params.offset, 0, 50_000);

  const result = await pg.query(
    `
      select *
      from removed_medicines
      where user_id = $1::uuid
      order by removed_at desc
      limit $2::int offset $3::int;
    `,
    [params.userId, limit, offset],
  );

  return result.rows.map(rowToRemovedMedicine);
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

  const removedAt = new Date().toISOString();

  const client = await pg.connect();
  try {
    await client.query("begin");

    const beforeRes = await client.query(
      `
        select *
        from medicines
        where id = $1::uuid and user_id = $2::uuid
        limit 1;
      `,
      [params.medicineId, params.userId],
    );

    if (beforeRes.rows.length === 0) {
      await client.query("rollback");
      return null;
    }

    const before = rowToMedicine(beforeRes.rows[0]);

    await client.query(
      `
        insert into removed_medicines (
          id,
          user_id,
          name,
          type,
          dose_per_intake,
          dose_unit,
          removed_at
        )
        values (
          $1::uuid,
          $2::uuid,
          $3::text,
          $4::text,
          $5::numeric,
          $6::text,
          $7::timestamptz
        )
        on conflict (id) do update
        set name = excluded.name,
            type = excluded.type,
            dose_per_intake = excluded.dose_per_intake,
            dose_unit = excluded.dose_unit,
            removed_at = excluded.removed_at;
      `,
      [
        params.medicineId,
        params.userId,
        before.name,
        before.type,
        before.dosePerIntake,
        before.doseUnit,
        removedAt,
      ],
    );

    // Purge all related schedules + events (cascades) by deleting the medicine row.
    await client.query(
      `
        delete from medicines
        where id = $1::uuid and user_id = $2::uuid;
      `,
      [params.medicineId, params.userId],
    );

    await client.query("commit");

    await insertAuditLog({
      userId: params.userId,
      actorUserId: params.actorUserId,
      action: "medicine.archive",
      entityType: "medicine",
      entityId: params.medicineId,
      metadata: { removedAt },
    });

    // Free storage when a medicine is deleted/archived.
    // (The DB row is deleted, but storage usage should reflect actual active objects.)
    const keysToDelete = [
      before.photoKey ?? "",
      before.voiceNoteKey ?? "",
    ].filter(Boolean);
    if (keysToDelete.length > 0) {
      try {
        await applyObjectDeletes({ userId: params.userId, keys: keysToDelete });
      } catch {
        // Best-effort: do not fail archive if storage cleanup fails.
      }
    }

    return {
      ...before,
      isActive: false,
      archivedAt: removedAt,
      updatedAt: removedAt,
    };
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
    photoKey?: string | null;
    voiceNoteKey?: string | null;
    voiceNoteFilename?: string | null;
    voiceNoteContentType?: string | null;
    isActive?: boolean;
  };
}): Promise<MedicineRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const beforeRes = await pg.query(
    `
      select *
      from medicines
      where id = $1::uuid and user_id = $2::uuid
      limit 1;
    `,
    [params.medicineId, params.userId],
  );
  if (beforeRes.rows.length === 0) return null;
  const before = rowToMedicine(beforeRes.rows[0]);

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

  if (params.patch.photoKey !== undefined) {
    const raw = params.patch.photoKey;
    const v = raw == null ? null : String(raw).trim();
    sets.push(`photo_key = $${i}::text`);
    args.push(v ? v : null);
    i++;
  }

  if (params.patch.voiceNoteKey !== undefined) {
    const raw = params.patch.voiceNoteKey;
    const v = raw == null ? null : String(raw).trim();
    sets.push(`voice_note_key = $${i}::text`);
    args.push(v ? v : null);
    i++;

    // Keep voice note metadata consistent with the key.
    if (!v) {
      sets.push(`voice_note_filename = $${i}::text`);
      args.push(null);
      i++;
      sets.push(`voice_note_content_type = $${i}::text`);
      args.push(null);
      i++;
    } else {
      const rawFilename = params.patch.voiceNoteFilename;
      const filename =
        rawFilename == null
          ? null
          : String(rawFilename).trim().slice(0, 300) || null;
      const rawCt = params.patch.voiceNoteContentType;
      const contentType =
        rawCt == null ? null : String(rawCt).trim().slice(0, 120) || null;

      sets.push(`voice_note_filename = $${i}::text`);
      args.push(filename);
      i++;
      sets.push(`voice_note_content_type = $${i}::text`);
      args.push(contentType);
      i++;
    }
  }

  if (params.patch.isActive !== undefined) {
    sets.push(`is_active = $${i}::boolean`);
    args.push(Boolean(params.patch.isActive));
    i++;
  }

  if (sets.length === 0) {
    return before;
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

  const after = rowToMedicine(result.rows[0]);

  // Best-effort: free storage for replaced media.
  const keysToDelete: string[] = [];
  if (before.photoKey && before.photoKey !== after.photoKey) {
    keysToDelete.push(before.photoKey);
  }
  if (before.voiceNoteKey && before.voiceNoteKey !== after.voiceNoteKey) {
    keysToDelete.push(before.voiceNoteKey);
  }
  if (keysToDelete.length > 0) {
    try {
      await applyObjectDeletes({ userId: params.userId, keys: keysToDelete });
    } catch {
      // ignore
    }
  }

  return after;
}
