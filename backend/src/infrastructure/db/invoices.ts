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

export type InvoiceGroup = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceReport = {
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

export type InvoiceAttachment = {
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

export type InvoiceGroupDetails = {
  group: InvoiceGroup;
  reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
};

function toIsoDateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
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
  return crypto.randomUUID();
}

function rowToGroup(row: any): InvoiceGroup {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: row.title == null ? null : String(row.title),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToReport(row: any): InvoiceReport {
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

function rowToAttachment(row: any): InvoiceAttachment {
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
  groupTitle: unknown;
  report: {
    title: unknown;
    issueDate: unknown;
    nextAppointment: unknown;
    doctor: unknown;
    textNote: unknown;
  };
}): Promise<{ group: InvoiceGroup; report: InvoiceReport }> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (!isNonEmptyText(params.report.title, 220)) {
    throw new Error("title is required");
  }

  const groupId = newUuid();
  const reportId = newUuid();

  const groupTitle =
    params.groupTitle === null
      ? null
      : typeof params.groupTitle === "string"
        ? toNullableShortText(params.groupTitle, 220)
        : null;

  const issueDate = toIsoDateOrNull(params.report.issueDate);
  const nextAppointment = toIsoDateOrNull(params.report.nextAppointment);
  const doctor = toNullableShortText(params.report.doctor, 180);
  const textNote = toNullableShortText(params.report.textNote, 5000);

  await pg.query("begin");
  try {
    const gRes = await pg.query(
      `insert into invoice_groups (id, user_id, title, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::text, now(), now())
       returning *`,
      [groupId, params.userId, groupTitle],
    );

    const rRes = await pg.query(
      `insert into invoice_reports (id, group_id, user_id, title, issue_date, next_appointment, doctor, text_note, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::date, $6::date, $7::text, $8::text, now(), now())
       returning *`,
      [
        reportId,
        groupId,
        params.userId,
        String(params.report.title).trim(),
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
  limit: number;
  offset: number;
}): Promise<
  Array<
    InvoiceGroup & {
      reportCount: number;
      latestReport: { id: string; title: string; updatedAt: string } | null;
    }
  >
> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `select g.*,
            (select count(*)::int from invoice_reports r where r.group_id = g.id) as report_count,
            (select jsonb_build_object('id', r2.id, 'title', r2.title, 'updatedAt', r2.updated_at)
             from invoice_reports r2 where r2.group_id = g.id order by r2.created_at desc limit 1) as latest_report
     from invoice_groups g
     where g.user_id = $1::uuid
     order by g.updated_at desc
     limit $2::int offset $3::int`,
    [params.userId, params.limit, params.offset],
  );

  return res.rows.map((row: any) => {
    const group = rowToGroup(row);
    const reportCount = Number(row.report_count ?? 0) || 0;
    const latest = row.latest_report as any;
    const latestReport = latest
      ? {
          id: String(latest.id),
          title: String(latest.title),
          updatedAt: new Date(latest.updatedAt).toISOString(),
        }
      : null;
    return { ...group, reportCount, latestReport };
  });
}

export async function getGroupDetails(params: {
  userId: string;
  groupId: string;
}): Promise<InvoiceGroupDetails | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const gRes = await pg.query(
    `select * from invoice_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) return null;

  const reportsRes = await pg.query(
    `select * from invoice_reports
     where group_id = $1::uuid and user_id = $2::uuid
     order by created_at desc`,
    [params.groupId, params.userId],
  );

  const reportIds = reportsRes.rows.map((r: any) => String(r.id));
  const attRes = reportIds.length
    ? await pg.query(
        `select * from invoice_attachments where report_id = any($1::uuid[]) order by created_at desc`,
        [reportIds],
      )
    : { rows: [] };

  const attsByReport = new Map<string, InvoiceAttachment[]>();
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

  return { group: rowToGroup(gRes.rows[0]), reports };
}

export async function patchGroup(params: {
  userId: string;
  groupId: string;
  title: string | null;
}): Promise<InvoiceGroup | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const title =
    params.title == null ? null : toNullableShortText(params.title, 220);

  const res = await pg.query(
    `update invoice_groups set title = $1::text, updated_at = now()
     where id = $2::uuid and user_id = $3::uuid
     returning *`,
    [title, params.groupId, params.userId],
  );
  if (res.rows.length === 0) return null;
  return rowToGroup(res.rows[0]);
}

export async function createReport(params: {
  userId: string;
  groupId: string;
  title: unknown;
  issueDate: unknown;
  nextAppointment: unknown;
  doctor: unknown;
  textNote: unknown;
}): Promise<InvoiceReport> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (!isNonEmptyText(params.title, 220)) {
    throw new Error("title is required");
  }

  const gRes = await pg.query(
    `select id from invoice_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) throw new Error("Group not found");

  const id = newUuid();

  const res = await pg.query(
    `insert into invoice_reports (id, group_id, user_id, title, issue_date, next_appointment, doctor, text_note, created_at, updated_at)
     values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::date, $6::date, $7::text, $8::text, now(), now())
     returning *`,
    [
      id,
      params.groupId,
      params.userId,
      String(params.title).trim(),
      toIsoDateOrNull(params.issueDate),
      toIsoDateOrNull(params.nextAppointment),
      toNullableShortText(params.doctor, 180),
      toNullableShortText(params.textNote, 5000),
    ],
  );

  await pg.query(
    `update invoice_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return rowToReport(res.rows[0]);
}

export async function patchReport(params: {
  userId: string;
  groupId: string;
  reportId: string;
  patch: Partial<{
    title: unknown;
    issueDate: unknown;
    nextAppointment: unknown;
    doctor: unknown;
    textNote: unknown;
  }>;
}): Promise<InvoiceReport | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const updates: string[] = [];
  const values: any[] = [params.reportId, params.groupId, params.userId];
  let i = 3;

  if (params.patch.title !== undefined) {
    if (!isNonEmptyText(params.patch.title, 220))
      throw new Error("title is required");
    values.push(String(params.patch.title).trim());
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
    values.push(toNullableShortText(params.patch.doctor, 180));
    i += 1;
    updates.push(`doctor = $${i}::text`);
  }
  if (params.patch.textNote !== undefined) {
    values.push(toNullableShortText(params.patch.textNote, 5000));
    i += 1;
    updates.push(`text_note = $${i}::text`);
  }

  if (updates.length === 0) return null;

  const sql = `update invoice_reports
               set ${updates.join(", ")}, updated_at = now()
               where id = $1::uuid and group_id = $2::uuid and user_id = $3::uuid
               returning *`;

  const res = await pg.query(sql, values);
  if (res.rows.length === 0) return null;

  await pg.query(
    `update invoice_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
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
}): Promise<InvoiceAttachment> {
  await ensureSchema();
  const pg = getPostgresPool();

  const rRes = await pg.query(
    `select id from invoice_reports where id = $1::uuid and group_id = $2::uuid and user_id = $3::uuid`,
    [params.reportId, params.groupId, params.userId],
  );
  if (rRes.rows.length === 0) throw new Error("Report not found");

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
    `insert into invoice_attachments (id, report_id, user_id, key, filename, content_type, size_bytes, kind, created_at, updated_at)
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
    `update invoice_reports set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
    [params.reportId, params.userId],
  );
  await pg.query(
    `update invoice_groups set updated_at = now() where id = $1::uuid and user_id = $2::uuid`,
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
     from invoice_attachments a
     join invoice_reports r on r.id = a.report_id
     join invoice_groups g on g.id = r.group_id
     where g.id = $1::uuid and g.user_id = $2::uuid`,
    [params.groupId, params.userId],
  );

  return keysRes.rows.map((r: any) => String(r.key)).filter(Boolean);
}

export async function deleteGroupRow(params: {
  userId: string;
  groupId: string;
}): Promise<boolean> {
  await ensureSchema();
  const pg = getPostgresPool();

  const delRes = await pg.query(
    `delete from invoice_groups where id = $1::uuid and user_id = $2::uuid`,
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

  const gRes = await pg.query(
    `select id from invoice_groups where id = $1::uuid and user_id = $2::uuid`,
    [params.groupId, params.userId],
  );
  if (gRes.rows.length === 0) throw new Error("Group not found");

  const countRes = await pg.query(
    `select count(*)::int as cnt
     from invoice_share_links
     where created_by_user_id = $1::uuid and created_at >= (now() - interval '24 hours')`,
    [params.userId],
  );
  const cnt = Number(countRes.rows?.[0]?.cnt ?? 0) || 0;
  if (cnt >= params.dailyLimit) {
    throw new Error("SHARE_LIMIT_EXCEEDED");
  }

  const token = crypto.randomBytes(18).toString("base64url");

  const res = await pg.query(
    `insert into invoice_share_links (token, group_id, created_by_user_id, expires_at, created_at)
     values ($1::text, $2::uuid, $3::uuid, (now() + ($4::int || ' seconds')::interval), now())
     returning expires_at`,
    [token, params.groupId, params.userId, ttl],
  );

  return { token, expiresAt: new Date(res.rows[0].expires_at).toISOString() };
}

export async function getSharedGroupByToken(params: {
  token: string;
}): Promise<{
  group: InvoiceGroup;
  reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
  expiresAt: string;
} | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const sRes = await pg.query(
    `select token, group_id, expires_at from invoice_share_links
     where token = $1::text and expires_at > now()`,
    [params.token],
  );
  if (sRes.rows.length === 0) return null;

  const groupId = String(sRes.rows[0].group_id);
  const expiresAt = new Date(sRes.rows[0].expires_at).toISOString();

  const gRes = await pg.query(
    `select * from invoice_groups where id = $1::uuid`,
    [groupId],
  );
  if (gRes.rows.length === 0) return null;

  const reportsRes = await pg.query(
    `select * from invoice_reports where group_id = $1::uuid order by created_at desc`,
    [groupId],
  );

  const reportIds = reportsRes.rows.map((r: any) => String(r.id));
  const attRes = reportIds.length
    ? await pg.query(
        `select * from invoice_attachments where report_id = any($1::uuid[]) order by created_at desc`,
        [reportIds],
      )
    : { rows: [] };

  const attsByReport = new Map<string, InvoiceAttachment[]>();
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
