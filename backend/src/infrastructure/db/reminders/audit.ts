import { ensureSchema } from "../schema";
import { getPostgresPool } from "../postgres";

import { newUuid } from "./helpers";

// Shared audit logging helper.
// Used by multiple reminders DB modules.

export async function insertAuditLog(params: {
  userId: string;
  actorUserId?: string | null;
  action: string;
  entityType:
    | "medicine"
    | "schedule"
    | "intake_event"
    | "caregiver_link"
    | string;
  entityId: string;
  metadata: unknown | null;
}): Promise<void> {
  await ensureSchema();
  const pg = getPostgresPool();

  const actorId =
    params.actorUserId === undefined ? params.userId : params.actorUserId;

  await pg.query(
    `
      insert into audit_logs (id, user_id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
      values ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text, $7::jsonb, now());
    `,
    [
      newUuid(),
      params.userId,
      actorId,
      params.action,
      params.entityType,
      params.entityId,
      params.metadata == null ? null : JSON.stringify(params.metadata),
    ],
  );

  // Enforce per-medicine log cap (keep newest 100).
  if (params.entityType === "medicine") {
    await pg.query(
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
      [params.userId, params.entityId],
    );
  }
}
