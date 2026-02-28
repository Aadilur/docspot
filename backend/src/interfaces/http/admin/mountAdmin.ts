import type { Express, Request, Response } from "express";
import express from "express";
import { randomUUID } from "crypto";
import fs from "node:fs";

import { PutObjectCommand } from "@aws-sdk/client-s3";

import { getConfig } from "../../../infrastructure/config/env";
import { ensureSchema } from "../../../infrastructure/db/schema";
import {
  createPresignedGetUrl,
  deleteObject,
  getS3Client,
} from "../../../infrastructure/storage/s3";
import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  requireAdminSession,
} from "../middleware/firebaseAuth";

function readFirebaseWebConfig(): Record<string, any> | null {
  const raw = (process.env.FIREBASE_WEB_CONFIG_JSON || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderLoginPage(opts: {
  firebaseWebConfigJson: string | null;
  appName: string;
}): string {
  const { firebaseWebConfigJson, appName } = opts;

  const configSection = firebaseWebConfigJson
    ? `<script>
      window.__DOCSPOT_FIREBASE_CONFIG__ = ${firebaseWebConfigJson};
    </script>`
    : "";

  const missingConfigBanner = firebaseWebConfigJson
    ? ""
    : `<div style="margin: 0 0 12px 0; padding: 12px; border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; border-radius: 10px; font-size: 14px;">
        <div style="font-weight: 700; margin-bottom: 6px;">Firebase Web Config missing</div>
        <div>Set <code>FIREBASE_WEB_CONFIG_JSON</code> in backend env to enable login UI.</div>
        <div style="margin-top: 6px; opacity: 0.9;">You can still create a session cookie by calling <code>POST /admin/sessionLogin</code> with an <code>idToken</code>.</div>
      </div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(appName)} Admin Login</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; margin: 0; padding: 0; background: #0b0b0f; }
      .wrap { max-width: 520px; margin: 0 auto; padding: 32px 16px; }
      .card { background: #fff; border-radius: 16px; padding: 18px; border: 1px solid rgba(0,0,0,0.08); }
      @media (prefers-color-scheme: dark) {
        .card { background: #0f1115; border-color: rgba(255,255,255,0.10); }
        body { background: #05060a; }
      }
      h1 { font-size: 18px; margin: 0 0 6px 0; }
      p { margin: 0 0 14px 0; opacity: 0.8; }
      label { display: grid; gap: 6px; margin: 12px 0; font-size: 14px; }
      input { height: 42px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.12); padding: 0 12px; font-size: 14px; }
      @media (prefers-color-scheme: dark) { input { border-color: rgba(255,255,255,0.14); background: #0b0d12; color: #e5e7eb; } }
      button { height: 42px; border-radius: 12px; border: 0; padding: 0 14px; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer; }
      button[disabled] { opacity: 0.6; cursor: not-allowed; }
      .row { display: flex; gap: 10px; align-items: center; }
      .muted { opacity: 0.75; font-size: 12px; margin-top: 8px; }
      .err { margin-top: 10px; padding: 10px; border-radius: 12px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; font-size: 14px; }
      @media (prefers-color-scheme: dark) { .err { border-color: rgba(248,113,113,0.35); background: rgba(127,29,29,0.25); color: #fecaca; } }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      a { color: inherit; }
    </style>
    ${configSection}
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>${htmlEscape(appName)} Admin</h1>
        <p>Sign in with Firebase to access AdminJS.</p>

        ${missingConfigBanner}

        <div id="authed" style="display:none; margin-bottom: 12px; padding: 12px; border: 1px solid rgba(0,0,0,0.12); border-radius: 12px; font-size: 14px;">
          <div style="font-weight: 700;">Signed in</div>
          <div id="who" class="muted"></div>
        </div>

        <label>
          Email
          <input id="email" type="email" autocomplete="email" placeholder="admin@example.com" />
        </label>
        <label>
          Password
          <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />
        </label>

        <div class="row">
          <button id="btn" type="button">Sign in</button>
          <button id="logout" type="button" style="background:#111827; display:none;">Logout</button>
        </div>
        <div class="muted">Requires an admin custom claim (<code>admin: true</code>) on your Firebase user.</div>

        <div id="err" class="err" style="display:none;"></div>
      </div>
    </div>

    <script>
      const errBox = document.getElementById('err');
      const btn = document.getElementById('btn');
      const logoutBtn = document.getElementById('logout');
      const authed = document.getElementById('authed');
      const who = document.getElementById('who');

      function setError(msg) {
        if (!msg) {
          errBox.style.display = 'none';
          errBox.textContent = '';
          return;
        }
        errBox.style.display = 'block';
        errBox.textContent = String(msg);
      }

      function setBusy(busy) {
        btn.disabled = busy;
        logoutBtn.disabled = busy;
      }

      const cfg = window.__DOCSPOT_FIREBASE_CONFIG__;
      if (cfg) {
        try { firebase.initializeApp(cfg); } catch (e) { /* ignore */ }
      }

      async function createSessionFromCurrentUser(user) {
        const idToken = await user.getIdToken();
        const res = await fetch('/admin/sessionLogin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((json && json.error) ? json.error : ('Login failed (' + res.status + ')'));
        }
        window.location.href = '/admin';
      }

      if (firebase && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
          if (user) {
            authed.style.display = 'block';
            who.textContent = user.email || user.uid;
            logoutBtn.style.display = 'inline-block';
          } else {
            authed.style.display = 'none';
            who.textContent = '';
            logoutBtn.style.display = 'none';
          }
        });
      }

      btn.addEventListener('click', async () => {
        setError('');
        if (!cfg) {
          setError('FIREBASE_WEB_CONFIG_JSON is not configured on the backend.');
          return;
        }
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        if (!email || !password) {
          setError('Email and password are required.');
          return;
        }
        try {
          setBusy(true);
          const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
          await createSessionFromCurrentUser(cred.user);
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      });

      logoutBtn.addEventListener('click', async () => {
        setError('');
        try {
          setBusy(true);
          await fetch('/admin/sessionLogout', { method: 'POST' });
          if (firebase && firebase.auth) {
            await firebase.auth().signOut();
          }
          window.location.href = '/admin/login';
        } catch (e) {
          setError(e && e.message ? e.message : String(e));
        } finally {
          setBusy(false);
        }
      });
    </script>
  </body>
</html>`;
}

function adminActionBeforeNew() {
  return async (request: any) => {
    if (request?.method?.toLowerCase?.() !== "post") return request;
    const payload = { ...(request.payload ?? {}) };

    const now = new Date().toISOString();
    if (!payload.id) payload.id = randomUUID();
    if (!payload.created_at) payload.created_at = now;
    payload.updated_at = now;

    // Convenience: auto-set published_at when publishing.
    if (typeof payload.status === "string" && payload.status === "published") {
      if (!payload.published_at) payload.published_at = now;
    }

    return { ...request, payload };
  };
}

function adminActionBeforeEdit() {
  return async (request: any) => {
    if (request?.method?.toLowerCase?.() !== "post") return request;
    const payload = { ...(request.payload ?? {}) };

    const now = new Date().toISOString();
    payload.updated_at = now;

    if (typeof payload.status === "string" && payload.status === "published") {
      if (!payload.published_at) payload.published_at = now;
    }

    return { ...request, payload };
  };
}

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ ok: false, error: message });
}

export async function mountAdmin(app: Express): Promise<void> {
  // Ensure core schema (including CMS tables) exists.
  await ensureSchema();

  const { databaseUrl } = getConfig();
  if (!databaseUrl) {
    throw new Error("Database is not configured. Set DATABASE_URL.");
  }

  const firebaseConfig = readFirebaseWebConfig();

  const adminjsModule = await import("adminjs");
  const AdminJS = adminjsModule.default;
  const { ComponentLoader } = adminjsModule;
  const AdminJSExpress = (await import("@adminjs/express")).default;
  const { Database, Resource, parse } = await import("@adminjs/sql");

  AdminJS.registerAdapter({ Database, Resource });

  const uploadsEnabled = !!getConfig().s3;

  let componentLoader: InstanceType<typeof ComponentLoader> | undefined;
  let postCoverUpload: any | undefined;
  let testimonialAvatarUpload: any | undefined;
  let bannerImageUpload: any | undefined;
  let logoImageUpload: any | undefined;

  if (uploadsEnabled) {
    const { default: uploadFileFeature, BaseProvider } =
      await import("@adminjs/upload");

    class DocspotS3UploadProvider extends BaseProvider {
      constructor() {
        super(getConfig().s3?.bucket ?? "");
      }

      async upload(file: any, key: string, _context: any): Promise<void> {
        const { client, bucket } = getS3Client();
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: fs.createReadStream(file.path),
            ContentType: file.type || "application/octet-stream",
          }),
        );
      }

      async delete(key: string, _bucket: string, _context: any): Promise<void> {
        await deleteObject({ key });
      }

      async path(key: string, _bucket: string, _context: any): Promise<string> {
        const { url } = await createPresignedGetUrl({
          key,
          expiresInSeconds: 60 * 10,
        });
        return url;
      }
    }

    componentLoader = new ComponentLoader();
    const uploadProvider = new DocspotS3UploadProvider();

    postCoverUpload = uploadFileFeature({
      componentLoader,
      provider: uploadProvider,
      properties: {
        key: "cover_image_key",
        file: "coverImageFile",
        filePath: "coverImagePath",
        filename: "cover_image_filename",
        mimeType: "cover_image_content_type",
        size: "cover_image_size_bytes",
      },
      uploadPath: (record: any, filename: string) =>
        `cms/posts/${record.id()}/${filename}`,
      validation: {
        mimeTypes: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/svg+xml",
        ],
        maxSize: 10 * 1024 * 1024,
      },
    });

    testimonialAvatarUpload = uploadFileFeature({
      componentLoader,
      provider: uploadProvider,
      properties: {
        key: "avatar_key",
        file: "avatarFile",
        filePath: "avatarPath",
        filename: "avatar_filename",
        mimeType: "avatar_content_type",
        size: "avatar_size_bytes",
      },
      uploadPath: (record: any, filename: string) =>
        `cms/testimonials/${record.id()}/${filename}`,
      validation: {
        mimeTypes: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/svg+xml",
        ],
        maxSize: 10 * 1024 * 1024,
      },
    });

    bannerImageUpload = uploadFileFeature({
      componentLoader,
      provider: uploadProvider,
      properties: {
        key: "image_key",
        file: "bannerImageFile",
        filePath: "bannerImagePath",
        filename: "image_filename",
        mimeType: "image_content_type",
        size: "image_size_bytes",
      },
      uploadPath: (record: any, filename: string) =>
        `cms/banners/${record.id()}/${filename}`,
      validation: {
        mimeTypes: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/svg+xml",
        ],
        maxSize: 10 * 1024 * 1024,
      },
    });

    logoImageUpload = uploadFileFeature({
      componentLoader,
      provider: uploadProvider,
      properties: {
        key: "image_key",
        file: "logoImageFile",
        filePath: "logoImagePath",
        filename: "image_filename",
        mimeType: "image_content_type",
        size: "image_size_bytes",
      },
      uploadPath: (record: any, filename: string) =>
        `cms/logos/${record.id()}/${filename}`,
      validation: {
        mimeTypes: [
          "image/png",
          "image/jpeg",
          "image/webp",
          "image/gif",
          "image/svg+xml",
        ],
        maxSize: 10 * 1024 * 1024,
      },
    });
  }

  let dbName = "postgres";
  try {
    const url = new URL(databaseUrl);
    const path = (url.pathname || "").replace(/^\//, "");
    if (path) dbName = path;
  } catch {
    // ignore
  }

  const metadata = await parse("postgresql", {
    database: dbName,
    schema: "public",
    connectionString: databaseUrl,
  });

  const posts = new Resource(metadata.table("cms_posts"));
  const faqs = new Resource(metadata.table("cms_faqs"));
  const testimonials = new Resource(metadata.table("cms_testimonials"));
  const banners = new Resource(metadata.table("cms_banners"));
  const logos = new Resource(metadata.table("cms_logos"));

  const adminJs = new AdminJS({
    rootPath: "/admin",
    ...(componentLoader ? { componentLoader } : {}),
    resources: [
      {
        resource: posts,
        ...(postCoverUpload ? { features: [postCoverUpload] } : {}),
        options: {
          navigation: { name: "CMS", icon: "Document" },
          actions: {
            new: { before: adminActionBeforeNew() },
            edit: { before: adminActionBeforeEdit() },
          },
          listProperties: [
            "title",
            "slug",
            "status",
            "published_at",
            "updated_at",
          ],
          editProperties: [
            "title",
            "slug",
            "excerpt",
            "content",
            ...(uploadsEnabled ? ["coverImageFile"] : ["cover_image_key"]),
            "cover_image_alt",
            "status",
            "published_at",
          ],
          showProperties: [
            "id",
            "title",
            "slug",
            "excerpt",
            "content",
            ...(uploadsEnabled
              ? [
                  "coverImagePath",
                  "cover_image_key",
                  "cover_image_filename",
                  "cover_image_content_type",
                  "cover_image_size_bytes",
                ]
              : ["cover_image_key"]),
            "cover_image_alt",
            "status",
            "published_at",
            "created_at",
            "updated_at",
          ],
          properties: {
            id: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            content: { type: "textarea" },
            excerpt: { type: "textarea" },
            cover_image_key: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: !uploadsEnabled,
              },
            },
            cover_image_filename: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            cover_image_content_type: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            cover_image_size_bytes: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
          },
        },
      },
      {
        resource: faqs,
        options: {
          navigation: { name: "CMS", icon: "Help" },
          actions: {
            new: { before: adminActionBeforeNew() },
            edit: { before: adminActionBeforeEdit() },
          },
          listProperties: [
            "question",
            "is_published",
            "sort_order",
            "updated_at",
          ],
          editProperties: ["question", "answer", "is_published", "sort_order"],
          properties: {
            id: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            answer: { type: "textarea" },
          },
        },
      },
      {
        resource: testimonials,
        ...(testimonialAvatarUpload
          ? { features: [testimonialAvatarUpload] }
          : {}),
        options: {
          navigation: { name: "CMS", icon: "User" },
          actions: {
            new: { before: adminActionBeforeNew() },
            edit: { before: adminActionBeforeEdit() },
          },
          listProperties: [
            "name",
            "role",
            "is_published",
            "sort_order",
            "updated_at",
          ],
          editProperties: [
            "name",
            "role",
            "quote",
            ...(uploadsEnabled ? ["avatarFile"] : ["avatar_key"]),
            "avatar_alt",
            "is_published",
            "sort_order",
          ],
          showProperties: [
            "id",
            "name",
            "role",
            "quote",
            ...(uploadsEnabled
              ? [
                  "avatarPath",
                  "avatar_key",
                  "avatar_filename",
                  "avatar_content_type",
                  "avatar_size_bytes",
                ]
              : ["avatar_key"]),
            "avatar_alt",
            "is_published",
            "sort_order",
            "created_at",
            "updated_at",
          ],
          properties: {
            id: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            quote: { type: "textarea" },
            avatar_key: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: !uploadsEnabled,
              },
            },
            avatar_filename: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            avatar_content_type: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            avatar_size_bytes: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
          },
        },
      },
      {
        resource: banners,
        ...(bannerImageUpload ? { features: [bannerImageUpload] } : {}),
        options: {
          navigation: { name: "CMS", icon: "Image" },
          actions: {
            new: { before: adminActionBeforeNew() },
            edit: { before: adminActionBeforeEdit() },
          },
          listProperties: ["title", "is_published", "sort_order", "updated_at"],
          editProperties: [
            "title",
            "subtitle",
            "link_url",
            ...(uploadsEnabled ? ["bannerImageFile"] : ["image_key"]),
            "image_alt",
            "is_published",
            "sort_order",
          ],
          showProperties: [
            "id",
            "title",
            "subtitle",
            "link_url",
            ...(uploadsEnabled
              ? [
                  "bannerImagePath",
                  "image_key",
                  "image_filename",
                  "image_content_type",
                  "image_size_bytes",
                ]
              : ["image_key"]),
            "image_alt",
            "is_published",
            "sort_order",
            "created_at",
            "updated_at",
          ],
          properties: {
            id: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            subtitle: { type: "textarea" },
            image_key: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: !uploadsEnabled,
              },
            },
            image_filename: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            image_content_type: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            image_size_bytes: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
          },
        },
      },
      {
        resource: logos,
        ...(logoImageUpload ? { features: [logoImageUpload] } : {}),
        options: {
          navigation: { name: "CMS", icon: "Image" },
          actions: {
            new: { before: adminActionBeforeNew() },
            edit: { before: adminActionBeforeEdit() },
          },
          listProperties: ["name", "is_active", "updated_at"],
          editProperties: [
            "name",
            ...(uploadsEnabled ? ["logoImageFile"] : ["image_key"]),
            "image_alt",
            "is_active",
          ],
          showProperties: [
            "id",
            "name",
            ...(uploadsEnabled
              ? [
                  "logoImagePath",
                  "image_key",
                  "image_filename",
                  "image_content_type",
                  "image_size_bytes",
                ]
              : ["image_key"]),
            "image_alt",
            "is_active",
            "created_at",
            "updated_at",
          ],
          properties: {
            id: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            image_key: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: !uploadsEnabled,
              },
            },
            image_filename: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            image_content_type: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
            image_size_bytes: {
              isVisible: {
                list: false,
                filter: false,
                show: true,
                edit: false,
              },
            },
          },
        },
      },
    ],
    branding: {
      companyName: "DocSpot",
      withMadeWithLove: false,
    },
  });

  const adminRouter = express.Router();

  adminRouter.get("/login", (req: Request, res: Response) => {
    res
      .status(200)
      .type("html")
      .send(
        renderLoginPage({
          firebaseWebConfigJson: firebaseConfig
            ? JSON.stringify(firebaseConfig)
            : null,
          appName: "DocSpot",
        }),
      );
  });

  adminRouter.post("/sessionLogin", async (req: Request, res: Response) => {
    const idToken =
      typeof (req.body as any)?.idToken === "string"
        ? (req.body as any).idToken
        : "";
    if (!idToken) {
      jsonError(res, 400, "Missing idToken");
      return;
    }

    try {
      const { cookieName, cookieValue, expiresInMs } =
        await createAdminSessionCookie(idToken);

      const secure = process.env.NODE_ENV === "production";
      res.cookie(cookieName, cookieValue, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        maxAge: expiresInMs,
        path: "/admin",
      });

      res.status(200).json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/forbidden/i.test(msg)) {
        jsonError(res, 403, "Forbidden");
        return;
      }
      jsonError(res, 401, "Unauthorized");
    }
  });

  adminRouter.post("/sessionLogout", (req: Request, res: Response) => {
    clearAdminSessionCookie(res);
    res.status(200).json({ ok: true });
  });

  adminRouter.get("/logout", (req: Request, res: Response) => {
    clearAdminSessionCookie(res);
    res.redirect("/admin/login");
  });

  adminRouter.use(requireAdminSession);

  const router = AdminJSExpress.buildRouter(adminJs);
  adminRouter.use(router);

  app.use(adminJs.options.rootPath, adminRouter);
}
