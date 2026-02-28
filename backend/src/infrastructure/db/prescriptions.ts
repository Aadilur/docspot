import crypto from "crypto";

import { ensureSchema } from "./schema";
import { getPostgresPool } from "./postgres";

function isNonEmptyText(value: unknown, maxLen: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLen
  );
}

export type PrescriptionGroup = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionReport = {
  id: string;
  groupId: string;
  userId: string;
  title: string;
  issueDate: string | null; // YYYY-MM-DD
  nextAppointment: string | null; // YYYY-MM-DD
  doctor: string | null;
  textNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionAttachment = {
  id: string;
  reportId: string;
  userId: string;
  key: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number;
  kind: "file" | "audio";
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionGroupDetails = {
  group: PrescriptionGroup;
  reports: Array<
    PrescriptionReport & { attachments: PrescriptionAttachment[] }
  >;
};

function toIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  // very small validation (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function toNullableShortText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, maxLen);
}

export function newUuid(): string {
  // Node 18+ supports randomUUID
  return crypto.randomUUID();
}

function rowToGroup(row: any): PrescriptionGroup {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: row.title == null ? null : String(row.title),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToReport(row: any): PrescriptionReport {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    userId: String(row.user_id),
    title: String(row.title),
    issueDate: row.issue_date == null ? null : String(row.issue_date),
    nextAppointment:
      row.next_appointment == null ? null : String(row.next_appointment),
    doctor: row.doctor == null ? null : String(row.doctor),
    textNote: row.text_note == null ? null : String(row.text_note),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToAttachment(row: any): PrescriptionAttachment {
  const kind = row.kind === "audio" ? "audio" : "file";
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    userId: String(row.user_id),
    key: String(row.key),
    filename: row.filename == null ? null : String(row.filename),
    contentType: row.content_type == null ? null : String(row.content_type),
    sizeBytes:
      typeof row.size_bytes === "number"
        ? Math.max(0, row.size_bytes)
        : Math.max(0, Number(row.size_bytes ?? 0) || 0),
    kind,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function createGroupWithFirstReport(params: {
  userId: string;
  report: {
    title: string;
    issueDate?: string | null;
    nextAppointment?: string | null;
    doctor?: string | null;
    textNote?: string | null;
  };
  groupTitle?: string | null;
}): Promise<{ group: PrescriptionGroup; report: PrescriptionReport }> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (!isNonEmptyText(params.report.title, 180)) {
    throw new Error("title is required");
  }

  const groupId = newUuid();
  const reportId = newUuid();

  const groupTitle =
    params.groupTitle != null
      ? toNullableShortText(params.groupTitle, 180)
      : params.report.title.trim();

  const issueDate = toIsoDateOrNull(params.report.issueDate);
  const nextAppointment = toIsoDateOrNull(params.report.nextAppointment);
  const doctor = toNullableShortText(params.report.doctor, 120);
  const textNote = toNullableShortText(params.report.textNote, 5000);

  await pg.query("begin");
  try {
    const gRes = await pg.query(
      `insert into prescription_groups (id, user_id, title, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::text, now(), now())
       returning *`,
      [groupId, params.userId, groupTitle],
    );

    const rRes = await pg.query(
      `insert into prescription_reports (id, group_id, user_id, title, issue_date, next_appointment, doctor, text_note, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::date, $6::date, $7::text, $8::text, now(), now())
       returning *`,
      [
        reportId,
        groupId,
        params.userId,
        params.report.title.trim(),
        issueDate,
        nextAppointment,
        doctor,
        textNote,
      ],
    );

    await pg.query("commit");

    return {
      group: rowToGroup(gRes.rows[0]),
      report: rowToReport(rRes.rows[0]),
    };
  } catch (e) {
    await pg.query("rollback");
    throw e;
  }
}

export async function listGroups(params: {
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<
  Array<
    PrescriptionGroup & {
      reportCount: number;
      latestReport: { id: string; title: string; updatedAt: string } | null;
    }
  >
> {
  await ensureSchema();
  const pg = getPostgresPool();

  const limit = Math.max(1, Math.min(100, Math.trunc(params.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(params.offset ?? 0));

  const res = await pg.query(
    `select
       g.*,
       coalesce(rc.cnt, 0) as report_count,
       lr.id as latest_report_id,
       lr.title as latest_report_title,
       lr.updated_at as latest_report_updated_at
     from prescription_groups g
     left join (
       select group_id, count(*)::int as cnt
       from prescription_reports
       where user_id = $1::uuid
       group by group_id
     ) rc on rc.group_id = g.id
     left join lateral (
       select id, title, updated_at
       from prescription_reports
       where user_id = $1::uuid and group_id = g.id
       order by created_at desc
       limit 1
     ) lr on true
     where g.user_id = $1::uuid
     order by coalesce(lr.updated_at, g.updated_at) desc
     limit $2::int offset $3::int`,
    [params.userId, limit, offset],
  );

  return res.rows.map((row: any) => {
    const group = rowToGroup(row);
    const reportCount = Number(row.report_count ?? 0) || 0;
    const latestReport = row.latest_report_id
      ? {
          id: String(row.latest_report_id),
          title: String(row.latest_report_title ?? ""),
          updatedAt: new Date(row.latest_report_updated_at).toISOString(),
        }
      : null;

    return { ...group, reportCount, latestReport };
  });
}

export async function getGroupDetails(params: {
  userId: string;
  groupId: string;
}): Promise<PrescriptionGroupDetails | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const gRes = await pg.query(
    `select * from prescription_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) return null;

  const reportsRes = await pg.query(
    `select * from prescription_reports
     where group_id = $1::uuid and user_id = $2::uuid
     order by created_at desc`,
    [params.groupId, params.userId],
  );

  const reportIds = reportsRes.rows.map((r: any) => String(r.id));
  const attRes = reportIds.length
    ? await pg.query(
        `select * from prescription_attachments
         where user_id = $1::uuid and report_id = any($2::uuid[])
         order by created_at desc`,
        [params.userId, reportIds],
      )
    : { rows: [] };

  const attsByReport = new Map<string, PrescriptionAttachment[]>();
  for (const row of attRes.rows) {
    const att = rowToAttachment(row);
    const list = attsByReport.get(att.reportId) ?? [];
    list.push(att);
    attsByReport.set(att.reportId, list);
  }

  const reports = reportsRes.rows.map((r: any) => {
    const report = rowToReport(r);
    const attachments = attsByReport.get(report.id) ?? [];
    return { ...report, attachments };
  });

  return {
    group: rowToGroup(gRes.rows[0]),
    reports,
  };
}

export async function patchGroup(params: {
  userId: string;
  groupId: string;
  title: string | null;
}): Promise<PrescriptionGroup | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const title =
    params.title == null ? null : toNullableShortText(params.title, 180);

  const res = await pg.query(
    `update prescription_groups
     set title = $3::text, updated_at = now()
     where id = $1::uuid and user_id = $2::uuid
     returning *`,
    [params.groupId, params.userId, title],
  );
  if (res.rows.length === 0) return null;
  return rowToGroup(res.rows[0]);
}

export async function createReport(params: {
  userId: string;
  groupId: string;
  title: string;
  issueDate?: string | null;
  nextAppointment?: string | null;
  doctor?: string | null;
  textNote?: string | null;
}): Promise<PrescriptionReport> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (!isNonEmptyText(params.title, 180)) {
    throw new Error("title is required");
  }

  // Ensure group ownership.
  const gRes = await pg.query(
    `select id from prescription_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) throw new Error("Group not found");

  const id = newUuid();
  const issueDate = toIsoDateOrNull(params.issueDate);
  const nextAppointment = toIsoDateOrNull(params.nextAppointment);
  const doctor = toNullableShortText(params.doctor, 120);
  const textNote = toNullableShortText(params.textNote, 5000);

  const res = await pg.query(
    `insert into prescription_reports (id, group_id, user_id, title, issue_date, next_appointment, doctor, text_note, created_at, updated_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::date, $6::date, $7::text, $8::text, now(), now())
     returning *`,
    [
      id,
      params.groupId,
      params.userId,
      params.title.trim(),
      issueDate,
      nextAppointment,
      doctor,
      textNote,
    ],
  );

  // Touch group updated_at.
  await pg.query(
    `update prescription_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return rowToReport(res.rows[0]);
}

export async function patchReport(params: {
  userId: string;
  groupId: string;
  reportId: string;
  patch: Partial<{
    title: string;
    issueDate: string | null;
    nextAppointment: string | null;
    doctor: string | null;
    textNote: string | null;
  }>;
}): Promise<PrescriptionReport | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const updates: string[] = [];
  const values: any[] = [params.reportId, params.groupId, params.userId];
  let i = values.length;

  const title =
    params.patch.title != null
      ? isNonEmptyText(params.patch.title, 180)
        ? params.patch.title.trim()
        : null
      : undefined;
  if (title !== undefined) {
    if (title == null) throw new Error("title is required");
    values.push(title);
    i += 1;
    updates.push(`title = $${i}::text`);
  }

  if (params.patch.issueDate !== undefined) {
    values.push(toIsoDateOrNull(params.patch.issueDate));
    i += 1;
    updates.push(`issue_date = $${i}::date`);
  }
  if (params.patch.nextAppointment !== undefined) {
    values.push(toIsoDateOrNull(params.patch.nextAppointment));
    i += 1;
    updates.push(`next_appointment = $${i}::date`);
  }
  if (params.patch.doctor !== undefined) {
    values.push(toNullableShortText(params.patch.doctor, 120));
    i += 1;
    updates.push(`doctor = $${i}::text`);
  }
  if (params.patch.textNote !== undefined) {
    values.push(toNullableShortText(params.patch.textNote, 5000));
    i += 1;
    updates.push(`text_note = $${i}::text`);
  }

  if (updates.length === 0) return null;

  const sql = `update prescription_reports
               set ${updates.join(", ")}, updated_at = now()
               where id = $1::uuid and group_id = $2::uuid and user_id = $3::uuid
               returning *`;

  const res = await pg.query(sql, values);
  if (res.rows.length === 0) return null;

  await pg.query(
    `update prescription_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return rowToReport(res.rows[0]);
}

export async function addAttachment(params: {
  userId: string;
  groupId: string;
  reportId: string;
  key: string;
  filename: string | null;
  contentType: string | null;
  kind: "file" | "audio";
}): Promise<PrescriptionAttachment> {
  await ensureSchema();
  const pg = getPostgresPool();

  // Validate report ownership.
  const rRes = await pg.query(
    `select id from prescription_reports where id = $1::uuid and group_id = $2::uuid and user_id = $3::uuid`,
    [params.reportId, params.groupId, params.userId],
  );
  if (rRes.rows.length === 0) throw new Error("Report not found");

  // Only allow attaching confirmed storage objects.
  const oRes = await pg.query(
    `select key, size_bytes from storage_objects where user_id = $1::uuid and key = $2::text and deleted_at is null`,
    [params.userId, params.key],
  );
  if (oRes.rows.length === 0) throw new Error("File not confirmed");
  const sizeBytes = Math.max(0, Number(oRes.rows[0].size_bytes ?? 0) || 0);

  const id = newUuid();
  const filename =
    params.filename == null ? null : toNullableShortText(params.filename, 260);
  const contentType =
    params.contentType == null
      ? null
      : toNullableShortText(params.contentType, 120);

  const res = await pg.query(
    `insert into prescription_attachments (id, report_id, user_id, key, filename, content_type, size_bytes, kind, created_at, updated_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::bigint, $8::text, now(), now())
     on conflict (report_id, key)
     do update set updated_at = now()
     returning *`,
    [
      id,
      params.reportId,
      params.userId,
      params.key,
      filename,
      contentType,
      sizeBytes,
      params.kind,
    ],
  );

  await pg.query(
    `update prescription_reports set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.reportId, params.userId],
  );
  await pg.query(
    `update prescription_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return rowToAttachment(res.rows[0]);
}

export async function getGroupAttachmentKeys(params: {
  userId: string;
  groupId: string;
}): Promise<string[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const keysRes = await pg.query(
    `select a.key as key
     from prescription_attachments a
     join prescription_reports r on r.id = a.report_id
     join prescription_groups g on g.id = r.group_id
     where g.id = $1::uuid and g.user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  const keys = keysRes.rows.map((r: any) => String(r.key)).filter(Boolean);

  return keys;
}

export async function deleteGroupRow(params: {
  userId: string;
  groupId: string;
}): Promise<boolean> {
  await ensureSchema();
  const pg = getPostgresPool();

  const delRes = await pg.query(
    `delete from prescription_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return (delRes.rowCount ?? 0) > 0;
}

export async function createShareLink(params: {
  userId: string;
  groupId: string;
  ttlSeconds: number;
  dailyLimit: number;
}): Promise<{ token: string; expiresAt: string }> {
  await ensureSchema();
  const pg = getPostgresPool();

  const ttl = Math.max(
    30,
    Math.min(60 * 60 * 24, Math.trunc(params.ttlSeconds)),
  );

  // Ensure group ownership.
  const gRes = await pg.query(
    `select id from prescription_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) throw new Error("Group not found");

  // Rolling 24h limit (hardcoded, easy to change).
  const countRes = await pg.query(
    `select count(*)::int as cnt
     from prescription_share_links
     where created_by_user_id = $1::uuid and created_at >= (now() - interval '24 hours')`,
    [params.userId],
  );
  const cnt = Number(countRes.rows?.[0]?.cnt ?? 0) || 0;
  if (cnt >= params.dailyLimit) {
    throw new Error("SHARE_LIMIT_EXCEEDED");
  }

  const token = crypto.randomBytes(18).toString("base64url");

  const res = await pg.query(
    `insert into prescription_share_links (token, group_id, created_by_user_id, expires_at, created_at)
     values ($1::text, $2::uuid, $3::uuid, (now() + ($4::int || ' seconds')::interval), now())
     returning expires_at`,
    [token, params.groupId, params.userId, ttl],
  );

  return { token, expiresAt: new Date(res.rows[0].expires_at).toISOString() };
}

export async function getSharedGroupByToken(params: {
  token: string;
}): Promise<{
  group: PrescriptionGroup;
  reports: Array<
    PrescriptionReport & { attachments: PrescriptionAttachment[] }
  >;
  expiresAt: string;
} | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const sRes = await pg.query(
    `select token, group_id, expires_at from prescription_share_links
     where token = $1::text and expires_at > now()`,
    [params.token],
  );
  if (sRes.rows.length === 0) return null;

  const groupId = String(sRes.rows[0].group_id);
  const expiresAt = new Date(sRes.rows[0].expires_at).toISOString();

  // We intentionally do not expose user_id.
  const gRes = await pg.query(
    `select * from prescription_groups where id = $1::uuid`,
    [groupId],
  );
  if (gRes.rows.length === 0) return null;

  const reportsRes = await pg.query(
    `select * from prescription_reports where group_id = $1::uuid order by created_at desc`,
    [groupId],
  );

  const reportIds = reportsRes.rows.map((r: any) => String(r.id));
  const attRes = reportIds.length
    ? await pg.query(
        `select * from prescription_attachments where report_id = any($1::uuid[]) order by created_at desc`,
        [reportIds],
      )
    : { rows: [] };

  const attsByReport = new Map<string, PrescriptionAttachment[]>();
  for (const row of attRes.rows) {
    const att = rowToAttachment(row);
    const list = attsByReport.get(att.reportId) ?? [];
    list.push(att);
    attsByReport.set(att.reportId, list);
  }

  const reports = reportsRes.rows.map((r: any) => {
    const report = rowToReport(r);
    const attachments = attsByReport.get(report.id) ?? [];
    return { ...report, attachments };
  });

  return { group: rowToGroup(gRes.rows[0]), reports, expiresAt };
}
