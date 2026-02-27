# DocSpot → GitHub + Railway deployment (monorepo: frontend/ + backend/)

This repo is a **monorepo** (npm workspaces) with two separate apps:

- `frontend/` = React + Vite + Tailwind + PWA
- `backend/` = Node.js + Express (TypeScript)

Railway should run them as **two different services** from the same GitHub repo.

---

## 0) One-time checks (deploy readiness)

### Frontend must have a production start command

Railway needs a server process. The frontend uses a static server:

- `frontend/package.json`
  - `build`: `tsc -b && vite build`
  - `start`: `serve -s dist -l $PORT`

### Backend must listen on PORT

Railway sets `PORT` automatically.

- `backend/src/main.ts` uses `process.env.PORT` ✅

### .gitignore

Make sure you do **not** commit secrets. The root `.gitignore` should ignore:

- `node_modules/`
- `frontend/dist/`, `backend/dist/`
- `.env`, `.env.*` (but keep `.env.example` files)

---

## 1) Publish to GitHub (first time)

### 1.1 Create a GitHub repo

1. Go to GitHub → **New repository**
2. Name it (example): `docspot`
3. Keep it **Public or Private** (your choice)
4. Do **NOT** initialize with README (you already have files locally)

### 1.2 Initialize git + push

Run these commands from the repo root:

```bash
git init
git add .
git commit -m "Initial monorepo scaffold"

git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git
git push -u origin main
```

### 1.3 Future updates

```bash
git add .
git commit -m "Your message"
git push
```

---

## 2) Deploy to Railway (recommended: 2 services in 1 project)

### Why two services?

- Frontend and backend scale/deploy independently
- Frontend is a static build served via Node
- Backend is an API server

### 2.1 Create a Railway project

1. Railway → **New Project**
2. Choose **Deploy from GitHub repo**
3. Pick your `docspot` repo

---

## 3) Create the Backend service (Express)

1. In the Railway project → **New Service** → **GitHub Repo**
2. Select the same repo
3. Name it: `backend`

### Service settings (important for workspaces)

In the backend service → **Settings**:

- **Root Directory**: `.` (repo root)

### Commands

- **Build Command**:
  ```bash
  npm ci --include=dev && npm run -w backend build
  ```
- **Start Command**:
  ```bash
  npm run -w backend start
  ```

### Verify

After deploy completes, open the backend URL and check:

- `GET https://<backend-service>.up.railway.app/health`

Railway provides `PORT` automatically.

---

## 4) Create the Frontend service (Vite PWA)

1. In the same Railway project → **New Service** → **GitHub Repo**
2. Select the same repo
3. Name it: `frontend`

### Service settings

In the frontend service → **Settings**:

- **Root Directory**: `.` (repo root)

### Commands

- **Build Command**:
  ```bash
  npm ci --include=dev && npm run -w frontend build
  ```
- **Start Command**:
  ```bash
  npm run -w frontend start
  ```

### Verify

- Open `https://<frontend-service>.up.railway.app/`
- Install as PWA (Chrome/Edge: “Install app”)

---

## 5) Connect frontend → backend (when you start calling APIs)

### 5.1 Add env var to Frontend service

Railway → **frontend** service → **Variables**:

- `VITE_API_BASE_URL = https://<backend-service>.up.railway.app`

### 5.2 Use it in the frontend

In code:

```ts
const apiBase = import.meta.env.VITE_API_BASE_URL;
```

> Note: Vite only exposes env vars prefixed with `VITE_`.

---

## 6) Security basics (recommended)

### 6.1 Restrict backend CORS

Set backend variable:

- `CORS_ORIGIN = https://<frontend-service>.up.railway.app`

(If you allow multiple origins, use comma-separated values.)

### 6.2 Firebase (frontend) variables

Do NOT commit Firebase secrets.
Set in Railway → **frontend** → **Variables** (examples):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

Optional (Analytics):

- `VITE_FIREBASE_MEASUREMENT_ID`

---

## 7) Managing deployments on Railway

### Auto-deploy on git push

- Push to `main`
- Railway will rebuild/redeploy each service

### View logs

- Railway project → select service → **Logs**

### Redeploy

- Railway project → select service → **Deployments** → **Redeploy**

### Rollback

- Railway project → select service → **Deployments** → pick an older deploy → **Rollback** (if available in your plan/UI)

---

## 8) Optional: Custom domains

Typical setup:

- Frontend: `docspot.com` or `app.docspot.com`
- Backend: `api.docspot.com`

Railway → service → **Settings / Domains** → add your domain and follow DNS instructions.

---

## Troubleshooting

### Build fails because devDependencies are missing

Use the provided build commands with:

- `npm ci --include=dev`

### 404 on SPA routes

If you later add routing, keep using:

- `serve -s dist`

(it serves SPA fallback correctly).
