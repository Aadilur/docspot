import { randomUUID } from "crypto";

import { ensureSchema } from "./schema";
import { getPostgresPool, withPostgresTransaction } from "./postgres";

function coerceBigintLike(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function toNullableText(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function toIso(value: unknown): string {
  return new Date(value as any).toISOString();
}

export type CareerApplication = {
  id: string;
  jobId: string;
  jobSlug: string;
  userId: string;
  status: string;
  userMessageLimit: number;
  cvKey: string;
  cvFilename: string | null;
  cvContentType: string | null;
  cvSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type CareerApplicationMessage = {
  id: string;
  applicationId: string;
  senderRole: "user" | "admin";
  message: string;
  createdAt: string;
};

function mapApplicationRow(row: any): CareerApplication {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    jobSlug: String(row.job_slug),
    userId: String(row.user_id),
    status: String(row.status),
    userMessageLimit: Math.max(
      0,
      Math.trunc(Number(row.user_message_limit ?? 5)),
    ),
    cvKey: String(row.cv_key),
    cvFilename: toNullableText(row.cv_filename),
    cvContentType: toNullableText(row.cv_content_type),
    cvSizeBytes: Math.max(0, coerceBigintLike(row.cv_size_bytes)),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapMessageRow(row: any): CareerApplicationMessage {
  const role = String(row.sender_role) === "admin" ? "admin" : "user";
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    senderRole: role,
    message: String(row.message ?? ""),
    createdAt: toIso(row.created_at),
  };
}

type PgQueryable = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};

async function getPublishedJobBySlugTx(
  pg: PgQueryable,
  slug: string,
): Promise<{ id: string; slug: string } | null> {
  const res = await pg.query(
    `select id, slug
     from career_jobs
     where slug = $1::text and is_published = true
     limit 1`,
    [slug],
  );
  const row = (res.rows ?? [])[0];
  if (!row) return null;
  return { id: String(row.id), slug: String(row.slug) };
}

export async function getCareerApplicationById(
  applicationId: string,
): Promise<CareerApplication | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const id = String(applicationId || "").trim();
  if (!id) return null;

  const res = await pg.query(
    `select
       a.id,
       a.job_id,
       j.slug as job_slug,
       a.user_id,
       a.status,
       a.user_message_limit,
       a.cv_key,
       a.cv_filename,
       a.cv_content_type,
       a.cv_size_bytes,
       a.created_at,
       a.updated_at
     from career_applications a
     join career_jobs j on j.id = a.job_id
     where a.id = $1::uuid
     limit 1`,
    [id],
  );

  const row = (res.rows ?? [])[0];
  if (!row) return null;
  return mapApplicationRow(row);
}

export async function getMyLatestCareerApplicationForJob(params: {
  userId: string;
  jobSlug: string;
}): Promise<CareerApplication | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = String(params.userId || "").trim();
  const slug = String(params.jobSlug || "").trim();
  if (!userId || !slug) return null;

  const res = await pg.query(
    `select
       a.id,
       a.job_id,
       j.slug as job_slug,
       a.user_id,
       a.status,
       a.user_message_limit,
       a.cv_key,
       a.cv_filename,
       a.cv_content_type,
       a.cv_size_bytes,
       a.created_at,
       a.updated_at
     from career_applications a
     join career_jobs j on j.id = a.job_id
     where a.user_id = $1::uuid
       and j.slug = $2::text
     order by a.created_at desc
     limit 1`,
    [userId, slug],
  );

  const row = (res.rows ?? [])[0];
  if (!row) return null;
  return mapApplicationRow(row);
}

export async function createCareerApplication(params: {
  userId: string;
  jobSlug: string;
  cvKey: string;
  cvFilename: string | null;
  cvContentType: string | null;
  initialMessage: string;
  maxCvBytes: number;
}): Promise<CareerApplication> {
  await ensureSchema();
  const pg = getPostgresPool();

  const userId = String(params.userId || "").trim();
  const slug = String(params.jobSlug || "").trim();
  const cvKey = String(params.cvKey || "").trim();
  const initialMessage = String(params.initialMessage || "").trim();

  if (!userId) throw new Error("invalid user");
  if (!slug) throw new Error("invalid job");
  if (!cvKey) throw new Error("cvKey is required");
  if (!initialMessage) throw new Error("message is required");

  const maxCvBytes = Math.max(1, Math.trunc(params.maxCvBytes));

  // Ensure the job exists and is published.
  const job = await getPublishedJobBySlugTx(pg, slug);
  if (!job) throw new Error("JOB_NOT_FOUND");

  // Ensure the CV key is a confirmed object for this user.
  const objRes = await pg.query(
    `select size_bytes
     from storage_objects
     where user_id = $1::uuid and key = $2::text and deleted_at is null
     limit 1`,
    [userId, cvKey],
  );
  const objRow = (objRes.rows ?? [])[0];
  if (!objRow) throw new Error("CV_NOT_CONFIRMED");

  const sizeBytes = Math.max(0, coerceBigintLike(objRow.size_bytes));
  if (sizeBytes <= 0) throw new Error("CV_NOT_CONFIRMED");
  if (sizeBytes > maxCvBytes) throw new Error("CV_TOO_LARGE");

  const appId = randomUUID();
  const msgId = randomUUID();
  const now = new Date().toISOString();

  await withPostgresTransaction(async (client) => {
    await client.query(
      `insert into career_applications (
         id,
         job_id,
         user_id,
         message,
         status,
         cv_key,
         cv_filename,
         cv_content_type,
         cv_size_bytes,
         created_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         $3::uuid,
         $4::text,
         'submitted',
         $5::text,
         $6::text,
         $7::text,
         $8::bigint,
         $9::timestamptz,
         $10::timestamptz
       )`,
      [
        appId,
        job.id,
        userId,
        initialMessage,
        cvKey,
        params.cvFilename,
        params.cvContentType,
        sizeBytes,
        now,
        now,
      ],
    );

    await client.query(
      `insert into career_application_messages (
         id,
         application_id,
         sender_role,
         sender_user_id,
         message,
         created_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         'user',
         $3::uuid,
         $4::text,
         $5::timestamptz,
         $6::timestamptz
       )`,
      [msgId, appId, userId, initialMessage, now, now],
    );
  });

  return {
    id: appId,
    jobId: job.id,
    jobSlug: job.slug,
    userId,
    status: "submitted",
    userMessageLimit: 5,
    cvKey,
    cvFilename: params.cvFilename,
    cvContentType: params.cvContentType,
    cvSizeBytes: sizeBytes,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listCareerApplicationMessages(params: {
  applicationId: string;
  afterCreatedAt: string | null;
  limit?: number;
}): Promise<CareerApplicationMessage[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const applicationId = String(params.applicationId || "").trim();
  if (!applicationId) return [];

  const limit = Math.max(1, Math.min(200, Math.trunc(params.limit ?? 50)));

  const after = params.afterCreatedAt ? new Date(params.afterCreatedAt) : null;
  const afterIso =
    after && !Number.isNaN(after.getTime()) ? after.toISOString() : null;

  const res = await pg.query(
    `select id, application_id, sender_role, message, created_at
     from career_application_messages
     where application_id = $1::uuid
       and ($2::timestamptz is null or created_at > $2::timestamptz)
     order by created_at asc
     limit $3::int`,
    [applicationId, afterIso, limit],
  );

  return (res.rows ?? []).map(mapMessageRow);
}

export async function getCareerApplicationMessageById(
  messageId: string,
): Promise<CareerApplicationMessage | null> {
  await ensureSchema();
  const pg = getPostgresPool();

  const id = String(messageId || "").trim();
  if (!id) return null;

  const res = await pg.query(
    `select id, application_id, sender_role, message, created_at
     from career_application_messages
     where id = $1::uuid
     limit 1`,
    [id],
  );
  const row = (res.rows ?? [])[0];
  if (!row) return null;
  return mapMessageRow(row);
}

export async function addCareerApplicationMessage(params: {
  applicationId: string;
  senderRole: "user" | "admin";
  senderUserId: string | null;
  message: string;
}): Promise<CareerApplicationMessage> {
  await ensureSchema();
  const pg = getPostgresPool();

  const applicationId = String(params.applicationId || "").trim();
  const message = String(params.message || "").trim();
  if (!applicationId) throw new Error("applicationId is required");
  if (!message) throw new Error("message is required");

  const senderRole = params.senderRole === "admin" ? "admin" : "user";
  const senderUserId = params.senderUserId ? String(params.senderUserId) : null;

  const id = randomUUID();
  const now = new Date().toISOString();

  await withPostgresTransaction(async (client) => {
    if (senderRole === "user") {
      const limitRes = await client.query(
        `select user_message_limit
         from career_applications
         where id = $1::uuid
         for update`,
        [applicationId],
      );
      const limitRow = (limitRes.rows ?? [])[0];
      if (!limitRow) throw new Error("APPLICATION_NOT_FOUND");

      const limit = Math.max(
        0,
        Math.trunc(Number(limitRow.user_message_limit ?? 5)),
      );

      const countRes = await client.query(
        `select count(*)::int as c
         from career_application_messages
         where application_id = $1::uuid and sender_role = 'user'`,
        [applicationId],
      );
      const count = Math.max(
        0,
        Math.trunc(Number((countRes.rows ?? [])[0]?.c ?? 0)),
      );

      if (count >= limit) {
        throw new Error("USER_MESSAGE_LIMIT_REACHED");
      }
    }

    await client.query(
      `insert into career_application_messages (
         id,
         application_id,
         sender_role,
         sender_user_id,
         message,
         created_at,
         updated_at
       ) values (
         $1::uuid,
         $2::uuid,
         $3::text,
         $4::uuid,
         $5::text,
         $6::timestamptz,
         $7::timestamptz
       )`,
      [id, applicationId, senderRole, senderUserId, message, now, now],
    );

    await client.query(
      `update career_applications set updated_at = $2::timestamptz where id = $1::uuid`,
      [applicationId, now],
    );
  });

  return {
    id,
    applicationId,
    senderRole,
    message,
    createdAt: now,
  };
}
