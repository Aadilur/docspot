# DocSpot

Responsive web app + PWA for storing and sharing personal documents (invoices, prescriptions, etc.).

- Frontend: React + Vite + Tailwind + i18n + PWA
- Backend: Node.js + Express (TypeScript) + Postgres + S3-compatible storage + Firebase Auth

Key backend features:

- Firebase ID-token auth for user APIs
- Share links for read-only public access to a shared group (invoices/prescriptions/objects)
- Private bucket uploads via presigned URLs + server-side accounting
- Admin UI (AdminJS) for CMS content

## Monorepo

- Install: `npm install`
- Frontend dev: `npm run dev:frontend`
- Frontend build: `npm run build:frontend`
- Backend dev: `npm run dev:backend`

Environment examples:

- `frontend/.env.example`
- `backend/.env.example`

Local defaults:

- Backend: `http://localhost:3001`
- Frontend (Vite): `http://localhost:5173`

Docs:

- Backend overview: `backend/README.md`
- Backend endpoints: `backend/src/interfaces/http/ENDPOINTS.md`
- Admin setup: `ADMIN_SETUP.md`
- Ads setup: `ADS_SETUP.md`

## Notes

Authentication is via Firebase. AdminJS can flip `users.user_type` (`free`/`paid`) to simulate Free vs Pro.

Basic Google AdSense native ad slots are supported (footer + share flows) and are automatically hidden for Pro users.
