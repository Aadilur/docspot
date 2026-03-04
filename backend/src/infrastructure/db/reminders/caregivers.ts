import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import { insertAuditLog } from "./audit";
import { newUuid, rowToCaregiverLink } from "./helpers";
import type {
  CaregiverAccessLevel,
  CaregiverLinkRecord,
  CaregiverPatientItem,
  CaregiverRequestItem,
} from "./types";

// Caregiver linking + access checks.

export async function inviteCaregiver(params: {
  patientId: string;
  caregiverId: string;
  accessLevel?: CaregiverAccessLevel | null;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  if (params.patientId === params.caregiverId) {
    throw new Error("cannot link to self");
  }

  const id = newUuid();
  const levelRaw = params.accessLevel ?? "view";
  const accessLevel: CaregiverAccessLevel =
    levelRaw === "edit" || levelRaw === "full" || levelRaw === "view"
      ? levelRaw
      : "view";
  const result = await pg.query(
    `
      insert into caregiver_links (id, patient_id, caregiver_id, status, created_at)
      values ($1::uuid, $2::uuid, $3::uuid, 'pending', now())
      on conflict (patient_id, caregiver_id)
      do update set status = 'pending', access_level = $4::text
      returning *;
    `,
    [id, params.patientId, params.caregiverId, accessLevel],
  );

  // Ensure access level is set for both new and existing rows.
  await pg.query(
    `
      update caregiver_links
      set access_level = $3::text
      where patient_id = $1::uuid and caregiver_id = $2::uuid;
    `,
    [params.patientId, params.caregiverId, accessLevel],
  );

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.patientId,
    action: "caregiver.invite",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId, accessLevel },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function rejectCaregiverInvite(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      update caregiver_links
      set status = 'rejected'
      where patient_id = $1::uuid and caregiver_id = $2::uuid
      returning *;
    `,
    [params.patientId, params.caregiverId],
  );
  if (result.rows.length === 0) throw new Error("invite not found");

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.caregiverId,
    action: "caregiver.reject",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function acceptCaregiverInvite(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const result = await pg.query(
    `
      update caregiver_links
      set status = 'accepted'
      where patient_id = $1::uuid and caregiver_id = $2::uuid
      returning *;
    `,
    [params.patientId, params.caregiverId],
  );

  if (result.rows.length === 0) throw new Error("invite not found");

  await insertAuditLog({
    userId: params.patientId,
    actorUserId: params.caregiverId,
    action: "caregiver.accept",
    entityType: "caregiver_link",
    entityId: String(result.rows[0].id),
    metadata: { caregiverId: params.caregiverId },
  });

  return rowToCaregiverLink(result.rows[0]);
}

export async function listCaregiverRequests(params: {
  caregiverId: string;
}): Promise<CaregiverRequestItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        cl.*, 
        u.id as patient_user_id,
        u.display_name as patient_display_name,
        u.email as patient_email,
        u.photo_url as patient_photo_url
      from caregiver_links cl
      join users u on u.id = cl.patient_id
      where cl.caregiver_id = $1::uuid
        and cl.status = 'pending'
      order by cl.created_at desc
      limit 200;
    `,
    [params.caregiverId],
  );

  return (res.rows ?? []).map((r: any) => ({
    link: rowToCaregiverLink(r),
    patient: {
      id: String(r.patient_user_id),
      displayName:
        r.patient_display_name == null ? null : String(r.patient_display_name),
      email: r.patient_email == null ? null : String(r.patient_email),
      photoUrl:
        r.patient_photo_url == null ? null : String(r.patient_photo_url),
    },
  }));
}

export async function listCaregiverPatients(params: {
  caregiverId: string;
}): Promise<CaregiverPatientItem[]> {
  await ensureSchema();
  const pg = getPostgresPool();

  const res = await pg.query(
    `
      select
        cl.*, 
        u.id as patient_user_id,
        u.display_name as patient_display_name,
        u.email as patient_email,
        u.photo_url as patient_photo_url
      from caregiver_links cl
      join users u on u.id = cl.patient_id
      where cl.caregiver_id = $1::uuid
        and cl.status = 'accepted'
      order by cl.created_at desc
      limit 200;
    `,
    [params.caregiverId],
  );

  return (res.rows ?? []).map((r: any) => ({
    link: rowToCaregiverLink(r),
    patient: {
      id: String(r.patient_user_id),
      displayName:
        r.patient_display_name == null ? null : String(r.patient_display_name),
      email: r.patient_email == null ? null : String(r.patient_email),
      photoUrl:
        r.patient_photo_url == null ? null : String(r.patient_photo_url),
    },
  }));
}

export async function patchCaregiverAlias(params: {
  caregiverId: string;
  patientId: string;
  alias: string | null;
}): Promise<CaregiverLinkRecord> {
  await ensureSchema();
  const pg = getPostgresPool();

  const a = params.alias == null ? null : String(params.alias).trim();
  const alias = a ? a.slice(0, 80) : null;

  const res = await pg.query(
    `
      update caregiver_links
      set caregiver_alias = $3::text
      where caregiver_id = $1::uuid
        and patient_id = $2::uuid
        and status = 'accepted'
      returning *;
    `,
    [params.caregiverId, params.patientId, alias],
  );
  if (res.rows.length === 0) throw new Error("link not found");
  return rowToCaregiverLink(res.rows[0]);
}

export async function getCaregiverLink(params: {
  caregiverId: string;
  patientId: string;
}): Promise<CaregiverLinkRecord | null> {
  await ensureSchema();
  const pg = getPostgresPool();
  const res = await pg.query(
    `
      select *
      from caregiver_links
      where caregiver_id = $1::uuid and patient_id = $2::uuid
      limit 1;
    `,
    [params.caregiverId, params.patientId],
  );
  if (res.rows.length === 0) return null;
  return rowToCaregiverLink(res.rows[0]);
}

export async function requireCaregiverAccessLevel(params: {
  caregiverId: string;
  patientId: string;
  minLevel: CaregiverAccessLevel;
}): Promise<CaregiverAccessLevel> {
  await ensureSchema();
  const pg = getPostgresPool();
  const res = await pg.query(
    `
      select access_level
      from caregiver_links
      where patient_id = $1::uuid
        and caregiver_id = $2::uuid
        and status = 'accepted'
      limit 1;
    `,
    [params.patientId, params.caregiverId],
  );
  if (res.rows.length === 0) throw new Error("forbidden");

  const raw = String(res.rows[0].access_level ?? "view");
  const level: CaregiverAccessLevel =
    raw === "edit" || raw === "full" || raw === "view" ? raw : "view";

  const order: Record<CaregiverAccessLevel, number> = {
    view: 1,
    edit: 2,
    full: 3,
  };
  if (order[level] < order[params.minLevel]) throw new Error("forbidden");
  return level;
}

export async function requireCaregiverAccess(params: {
  caregiverId: string;
  patientId: string;
}): Promise<void> {
  await requireCaregiverAccessLevel({
    caregiverId: params.caregiverId,
    patientId: params.patientId,
    minLevel: "view",
  });
}
