# DocSpot Backend (skeleton)

Node.js + Express starter with a clean-architecture-friendly folder layout.

## Run

- Dev: `npm run dev`
- Health: `GET /health`

## Base URL

Production: `https://api.docspot.app`

## Environment variables

Note (Railway): do not manually set `PORT` in service variables. Railway injects `PORT` dynamically; overriding it commonly causes 502 (edge cannot reach your app).

### Database (Postgres)

Set:

- `DATABASE_URL` — full connection string

Health check:

- `GET /health/db` (returns 200 if DB is reachable, 503 otherwise)

### Object storage (S3-compatible)

Set these to use your bucket (example provider endpoint: `https://t3.storageapi.dev`):

- `S3_ENDPOINT`
- `S3_REGION` (your provider says `auto`; if signatures fail, try `us-east-1`)
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE` (default `true`; recommended for custom endpoints)

Health check:

- `GET /health/storage` (returns 200 if S3 env is configured)

Presign endpoint (to test uploads):

- `POST /uploads/presign`
  - Body: `{ "filename": "test.pdf", "contentType": "application/pdf" }`
  - Response: `{ ok, url, key, bucket, expiresInSeconds }`
  - Then do a `PUT` to the returned `url` with the file bytes and the same `Content-Type`.

## Users API (CRUD)

These endpoints are intended for development/testing right now (no auth yet):

- `GET /users?limit=50&offset=0`
- `GET /users/:id`
- `GET /users/by-provider?provider=google.com&providerUserId=<uid>`
- `POST /users` (create)
- `POST /users/upsert` (create or update by `(provider, providerUserId)`)
- `PATCH /users/:id` (update plan fields, quota, etc.)
- `DELETE /users/:id`

## Layers

- `src/domain` — core business rules (no frameworks)
- `src/application` — use-cases + ports
- `src/infrastructure` — DB/storage/adapters
- `src/interfaces/http` — controllers/routes
