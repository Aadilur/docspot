# DocSpot Backend — Endpoints

This is a single place to see all HTTP endpoints, grouped segment-by-segment.

Base URL (prod): `https://api.docspot.app`

## Auth

This API uses Firebase Authentication.

- Send `Authorization: Bearer <FIREBASE_ID_TOKEN>` on authenticated requests.
- Most user-facing operations are under `/me`.
- Admin-only endpoints require auth + admin authorization.
  - Preferred: Firebase custom claim `admin: true` (also supports `role: "admin"` / `roles: ["admin"]`).
  - Fallback/bootstrap: `ADMIN_UIDS` contains your Firebase `uid`.

## 1) Root

- `GET /` — liveness JSON (public)

## 2) Health

- `GET /health` — service health (public)
- `GET /health/db` — Postgres connectivity (public; 200 ok, 503 if unavailable)
- `GET /health/redis` — Redis connectivity (public; 200 ok, 503 if unavailable or not configured)
- `GET /health/storage` — S3 env/config status (public; 200 ok, 503 if not configured)

## 3) CMS (public)

- `GET /cms/banners` — list published banners (includes signed `imageUrl` when S3 is configured)
- `GET /cms/logo` — get active logo (includes signed `imageUrl` when S3 is configured)

## 4) Uploads (auth)

Generic “drive” upload presign (counts against quota and must be confirmed via accounting flows):

- `POST /uploads/presign`
  - Body: `{ "filename": "test.pdf", "contentType": "application/pdf", "sizeBytes": 12345, "path": "documents/test.pdf" }`
    - `sizeBytes` is required
    - `path` is optional; must be a simple relative file path
  - Response: `{ ok, url, key, bucket, expiresInSeconds, usage, warning, reservationExpiresAt }`
  - Next: `PUT <url>` with file bytes and the same `Content-Type`
  - Then: `POST /me/storage/confirm` with `{ "key": "<key>" }`

## 5) Me (current user) (auth)

- `GET /me` — get or create the current user
- `PATCH /me` — update editable fields (`displayName`, `locale`, `photoKey`)

### Profile photo

- `POST /me/photo/presign`
  - Body: `{ "filename": "avatar.png", "contentType": "image/png", "sizeBytes": 12345 }`
- `POST /me/photo/confirm`
  - Body: `{ "key": "<key>" }`
- `GET /me/photo` — redirects to a short-lived signed URL (or 404 if none)
- `GET /me/photo/url` — returns `{ ok: true, url, expiresInSeconds }` (or 404 if none)

### Storage accounting + management

- `GET /me/storage` — total usage/quota summary
- `POST /me/storage/presign`
  - Body: `{ "filename": "file.pdf", "contentType": "application/pdf", "sizeBytes": 12345, "path": "documents/file.pdf" }`
- `POST /me/storage/confirm`
  - Body: `{ "key": "<key>" }`
- `POST /me/storage/delete`
  - Body: `{ "keys": ["users/<id>/drive/...", "users/<id>/drive/..."] }`
- `POST /me/storage/delete-prefix`
  - Body: `{ "prefix": "documents/", "limit": 200 }`
- `GET /me/storage/usage?folder=documents/`

## 6) Prescription groups (auth + public share)

- `GET /me/prescription-groups?limit=50&offset=0`
- `POST /me/prescription-groups`
- `GET /me/prescription-groups/:id`
- `PATCH /me/prescription-groups/:id`
- `DELETE /me/prescription-groups/:id`

Reports + attachments:

- `POST /me/prescription-groups/:id/reports`
- `PATCH /me/prescription-groups/:id/reports/:reportId`
- `POST /me/prescription-groups/:id/reports/:reportId/attachments`

Share:

- `POST /me/prescription-groups/:id/share` — creates a share token (rate-limited per 24h)
- `GET /share/prescriptions/:token` — public read-only access (signed attachment URLs)

## 7) Invoice groups (auth + public share)

- `GET /me/invoice-groups?limit=50&offset=0`
- `POST /me/invoice-groups`
- `GET /me/invoice-groups/:id`
- `PATCH /me/invoice-groups/:id`
- `DELETE /me/invoice-groups/:id`

Reports + attachments:

- `POST /me/invoice-groups/:id/reports`
- `PATCH /me/invoice-groups/:id/reports/:reportId`
- `POST /me/invoice-groups/:id/reports/:reportId/attachments`

Share:

- `POST /me/invoice-groups/:id/share`
- `GET /share/invoices/:token`

## 8) Object groups (auth + public share)

- `GET /me/object-groups?limit=50&offset=0`
- `POST /me/object-groups`
- `GET /me/object-groups/:id`
- `PATCH /me/object-groups/:id`
- `DELETE /me/object-groups/:id`

Reports + attachments:

- `POST /me/object-groups/:id/reports`
- `PATCH /me/object-groups/:id/reports/:reportId`
- `POST /me/object-groups/:id/reports/:reportId/attachments`

Share:

- `POST /me/object-groups/:id/share`
- `GET /share/objects/:token`

## 9) Users (admin only)

- `GET /users?limit=50&offset=0`
- `GET /users/:id`
- `GET /users/by-provider?provider=<provider>&providerUserId=<uid>`
- `POST /users` — create
- `POST /users/upsert` — upsert by `(provider, providerUserId)`
- `PATCH /users/:id`
- `DELETE /users/:id`

### User profile photo (admin only)

This flow keeps buckets private: the backend returns a redirect to a short-lived signed URL.

- `POST /users/:id/photo/presign`
  - Body: `{ "filename": "avatar.png", "contentType": "image/png" }`
- `GET /users/:id/photo`

## 10) Medicine reminders (auth)

Reminder settings:

- `GET /me/reminder-settings`
- `PATCH /me/reminder-settings`
  - Body: `{ "timezone": "Asia/Dhaka", "reminderOffsetMinutes": 10, "reminderGraceMinutes": 90 }` (all optional)

Medicines:

- `GET /me/medicines?limit=50&offset=0&includeArchived=true|false`
- `POST /me/medicines`
- `GET /me/medicines/:id`
- `PATCH /me/medicines/:id/archive`

Schedules:

- `GET /me/medicines/:id/schedules`
- `POST /me/medicines/:id/schedules`

Timeline:

- `GET /me/reminders/timeline/today?date=YYYY-MM-DD`

Intake updates:

- `PATCH /me/reminders/intake/:id/taken`
  - Optional header: `Idempotency-Key: <string>`
- `PATCH /me/reminders/intake/:id/skipped`
  - Body: `{ "reason": "..." }`

History:

- `GET /me/medicines/:id/history?limit=50&offset=0`

Caregiver:

- `POST /me/caregiver/invite` — Body: `{ "caregiverId": "<user uuid>" }`
- `POST /me/caregiver/accept` — Body: `{ "patientId": "<user uuid>" }`

Caregiver read-only (accepted link required):

- `GET /caregiver/medicines?patientId=<uuid>&limit=50&offset=0`
- `GET /caregiver/timeline/today?patientId=<uuid>&date=YYYY-MM-DD`
