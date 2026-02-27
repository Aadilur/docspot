# DocSpot Backend — Endpoints

This is a single place to see all HTTP endpoints, grouped segment-by-segment.

Base URL (prod): `https://api.docspot.app`

## 1) Root

- `GET /` — liveness JSON

## 2) Health

- `GET /health` — service health
- `GET /health/db` — Postgres connectivity (200 ok, 503 if unavailable)
- `GET /health/storage` — S3 env/config status (200 ok, 503 if not configured)

## 3) Storage uploads (generic)

- `POST /uploads/presign`
  - Body: `{ "filename": "test.pdf", "contentType": "application/pdf" }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds }`
  - Next: `PUT <url>` with file bytes and the same `Content-Type`

## 4) Users (CRUD)

- `GET /users?limit=50&offset=0` — list users
- `GET /users/:id` — get a user by id
- `GET /users/by-provider?provider=<provider>&providerUserId=<uid>` — get user by OAuth identity
- `POST /users` — create user
- `POST /users/upsert` — upsert user by `(provider, providerUserId)`
- `PATCH /users/:id` — update fields (plan/quota/profile fields)
- `DELETE /users/:id` — delete user

## 5) User profile photo (S3-backed)

This flow keeps buckets private: the backend returns a redirect to a short-lived signed URL.

- `POST /users/:id/photo/presign`
  - Body: `{ "filename": "avatar.png", "contentType": "image/png" }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds }`
  - Next: `PUT <url>` with image bytes and the same `Content-Type`

- `PATCH /users/:id`
  - Attach uploaded photo: `{ "photoKey": "<key>" }`
  - Remove custom photo: `{ "photoKey": null }`
  - Optional fallback to provider photo: `{ "photoUrl": "https://..." }`

- `GET /users/:id/photo`
  - Redirects to a short-lived signed S3 GET URL if `photoKey` exists
  - Else redirects to `photoUrl` if it is an `http(s)` URL
