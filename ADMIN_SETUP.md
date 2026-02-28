# DocSpot Admin (AdminJS) Setup

This project uses **Express + AdminJS** for admin-level CRUD of CMS content.

Admin access is controlled by **Firebase Auth** using a **custom claim**:

- Your Firebase user must have: `admin: true`

The backend issues a **Firebase session cookie** for `/admin` after you sign in.

## 1) Required backend env vars

Set these for the backend process (same place you already set `DATABASE_URL` etc):

- `DATABASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (Firebase service account JSON string)

To enable the built-in `/admin/login` UI, also set:

- `FIREBASE_WEB_CONFIG_JSON` (Firebase Web App config JSON string)

Optional:

- `ADMIN_SESSION_DAYS` (default `7`, max `14`)
- `ADMIN_SESSION_COOKIE` (default `docspot_admin_session`)

## 2) Enable Firebase sign-in method

For the `/admin/login` page (email + password):

- In Firebase Console → **Authentication** → **Sign-in method**
- Enable **Email/Password**
- Create an admin user email/password

(You can switch to other providers later, but email/password is the simplest.)

## 3) Set the `admin: true` custom claim

You must set the claim once for the admin user’s UID.

### Option A: Node script (recommended)

Run from repo root (replace `<ADMIN_UID>`):

```bash
export FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
node -e "
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const uid = process.argv[1];
admin.auth().setCustomUserClaims(uid, { admin: true }).then(() => {
  console.log('Set admin claim for', uid);
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
" <ADMIN_UID>
```

### Option B: Temporary bootstrap with `ADMIN_UIDS`

If you already use `ADMIN_UIDS`, the backend still supports it as a fallback. You can:

- Set `ADMIN_UIDS=<ADMIN_UID>`
- Start backend
- Use the app normally
- Then set the custom claim and remove `ADMIN_UIDS`

## 4) Open AdminJS

- Start backend: `npm run dev:backend`
- Open: `http://localhost:3001/admin/login`
- Sign in with the Firebase admin email/password
- You should be redirected to: `http://localhost:3001/admin`

## 5) What you can manage in AdminJS

Under **CMS**:

- **Posts** (`cms_posts`)
- **FAQs** (`cms_faqs`)
- **Testimonials** (`cms_testimonials`)
- **Banners** (`cms_banners`)

### Images / cover images

AdminJS supports uploading these images directly:

- Post cover images
- Testimonial avatars
- Banner images

Uploads are stored in your configured S3 bucket (via the backend’s existing `S3_*` env vars). The admin UI shows a preview/link using a short-lived presigned URL.

If S3 is **not** configured, the admin panel still works, but it falls back to editing raw storage key fields (e.g. `cover_image_key`, `image_key`).
