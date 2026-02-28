# DocSpot Backend — Endpoints

This is a single place to see all HTTP endpoints, grouped segment-by-segment.

Base URL (prod): `https://api.docspot.app`

## Auth

This API uses Firebase Authentication.

- Send `Authorization: Bearer <FIREBASE_ID_TOKEN>` on authenticated requests.
- Most user-facing operations are under `/me`.
- Admin-only endpoints require `ADMIN_UIDS` to include your Firebase `uid`.

## 1) Root

- `GET /` — liveness JSON (public)

## 2) Health

- `GET /health` — service health (public)
- `GET /health/db` — Postgres connectivity (public; 200 ok, 503 if unavailable)
- `GET /health/storage` — S3 env/config status (public; 200 ok, 503 if not configured)

## 3) Storage uploads (generic)

- `POST /uploads/presign` (auth)
  - Body: `{ "filename": "test.pdf", "contentType": "application/pdf" }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds }`
  - Next: `PUT <url>` with file bytes and the same `Content-Type`

## 4) Me (current user)

- `GET /me` (auth) — get or create the current user
- `PATCH /me` (auth) — update editable fields

### Profile photo (S3-backed)

- `POST /me/photo/presign` (auth)
  - Body: `{ "filename": "avatar.png", "contentType": "image/png", "sizeBytes": 12345 }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds, usage, warning, reservationExpiresAt }`
  - Next: `PUT <url>` with image bytes and the same `Content-Type`
  - Note: `key` is a stable avatar key with an image extension (example: `users/<id>/avatar/profile.png`).

- `POST /me/photo/confirm` (auth)
  - Body: `{ "key": "<key>" }`
  - Confirms the upload (heads the object, updates storage accounting, sets `photoKey` on the user)
  - Response: `{ ok, user, object, usage, warning }`

- `PATCH /me` (auth)
  - Attach uploaded photo: `{ "photoKey": "<key>" }`
  - Remove custom photo: `{ "photoKey": null }`

- `GET /me/photo` (auth)
  - Redirects to a short-lived signed S3 GET URL if `photoKey` exists

- `GET /me/photo/url` (auth)
  - Returns `{ ok: true, url, expiresInSeconds }` for a short-lived signed S3 GET URL

## 5) Users (admin only)

- `GET /users?limit=50&offset=0` — list users
- `GET /users/:id` — get a user by id
- `GET /users/by-provider?provider=<provider>&providerUserId=<uid>` — get user by OAuth identity
- `POST /users` — create user
- `POST /users/upsert` — upsert user by `(provider, providerUserId)`
- `PATCH /users/:id` — update fields (plan/quota/profile fields)
- `DELETE /users/:id` — delete user

## 6) User profile photo (admin only)

This flow keeps buckets private: the backend returns a redirect to a short-lived signed URL.

- `POST /users/:id/photo/presign`
  - Body: `{ "filename": "avatar.png", "contentType": "image/png" }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds }`
  - Next: `PUT <url>` with image bytes and the same `Content-Type`
  - Note: `key` is a stable avatar key with an image extension (example: `users/<id>/avatar/profile.png`).

- `PATCH /users/:id`
  - Attach uploaded photo: `{ "photoKey": "<key>" }`
  - Remove custom photo: `{ "photoKey": null }`
  - Optional fallback to provider photo: `{ "photoUrl": "https://..." }`

- `GET /users/:id/photo`
  - Redirects to a short-lived signed S3 GET URL if `photoKey` exists
  - Else redirects to `photoUrl` if it is an `http(s)` URL
