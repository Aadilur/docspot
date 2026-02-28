import type { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";

export type AuthContext = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  locale?: string;
  provider?: string;
  decoded: admin.auth.DecodedIdToken;
};

let firebaseApp: admin.app.App | null = null;

function getFirebaseApp(): admin.app.App {
  if (firebaseApp) return firebaseApp;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Auth is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (Firebase service account JSON).",
    );
  }

  let serviceAccount: any;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

async function verifyIdToken(idToken: string): Promise<AuthContext> {
  getFirebaseApp();
  const decoded = await admin.auth().verifyIdToken(idToken);

  const provider =
    typeof (decoded as any)?.firebase?.sign_in_provider === "string"
      ? String((decoded as any).firebase.sign_in_provider)
      : undefined;

  return {
    uid: decoded.uid,
    email: typeof decoded.email === "string" ? decoded.email : undefined,
    name:
      typeof (decoded as any)?.name === "string"
        ? String((decoded as any).name)
        : undefined,
    picture:
      typeof (decoded as any)?.picture === "string"
        ? String((decoded as any).picture)
        : undefined,
    locale:
      typeof (decoded as any)?.locale === "string"
        ? String((decoded as any).locale)
        : undefined,
    provider,
    decoded,
  };
}

function getBearerToken(req: Request): string | null {
  const header = req.header("authorization") || req.header("Authorization");
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  try {
    const auth = await verifyIdToken(token);
    (req as any).auth = auth;
    next();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    // If auth isn't configured at all, treat as service config issue.
    if (/Auth is not configured|FIREBASE_SERVICE_ACCOUNT_JSON/i.test(msg)) {
      res.status(503).json({ ok: false, error: msg });
      return;
    }
    res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

function isAdminClaims(decoded: admin.auth.DecodedIdToken): boolean {
  const anyDecoded = decoded as any;
  if (anyDecoded?.admin === true) return true;
  if (anyDecoded?.role === "admin") return true;
  if (Array.isArray(anyDecoded?.roles) && anyDecoded.roles.includes("admin")) {
    return true;
  }
  return false;
}

function isAdminUid(uid: string): boolean {
  const raw = (process.env.ADMIN_UIDS || "").trim();
  const adminUids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminUids.length === 0) return false;
  return adminUids.includes(uid);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthContext | undefined;
  if (!auth?.uid) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  // Prefer Firebase custom claims; keep ADMIN_UIDS for bootstrap/back-compat.
  const allow = isAdminClaims(auth.decoded) || isAdminUid(auth.uid);
  if (!allow) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }

  next();
}

function getAdminSessionCookieName(): string {
  return (process.env.ADMIN_SESSION_COOKIE || "docspot_admin_session").trim();
}

export async function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const cookieName = getAdminSessionCookieName();
  const sessionCookie = (req as any)?.cookies?.[cookieName];

  if (!sessionCookie || typeof sessionCookie !== "string") {
    res.redirect("/admin/login");
    return;
  }

  try {
    getFirebaseApp();
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);

    const allow = isAdminClaims(decoded) || isAdminUid(decoded.uid);
    if (!allow) {
      res.status(403).send("Forbidden");
      return;
    }

    (req as any).auth = {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      name:
        typeof (decoded as any)?.name === "string"
          ? String((decoded as any).name)
          : undefined,
      picture:
        typeof (decoded as any)?.picture === "string"
          ? String((decoded as any).picture)
          : undefined,
      locale:
        typeof (decoded as any)?.locale === "string"
          ? String((decoded as any).locale)
          : undefined,
      provider: undefined,
      decoded,
    } satisfies AuthContext;

    next();
  } catch {
    res.redirect("/admin/login");
  }
}

export async function createAdminSessionCookie(idToken: string): Promise<{
  cookieName: string;
  cookieValue: string;
  expiresInMs: number;
}> {
  getFirebaseApp();

  // Max allowed by Firebase is 14 days.
  const daysRaw = Number(process.env.ADMIN_SESSION_DAYS ?? 7);
  const days = Number.isFinite(daysRaw)
    ? Math.max(1, Math.min(14, daysRaw))
    : 7;
  const expiresInMs = days * 24 * 60 * 60 * 1000;

  // Ensure the caller is an admin (claims preferred; ADMIN_UIDS allowed for bootstrap).
  const decoded = await admin.auth().verifyIdToken(idToken);
  const allow = isAdminClaims(decoded) || isAdminUid(decoded.uid);
  if (!allow) {
    throw new Error("Forbidden");
  }

  const sessionCookie = await admin
    .auth()
    .createSessionCookie(idToken, { expiresIn: expiresInMs });

  return {
    cookieName: getAdminSessionCookieName(),
    cookieValue: sessionCookie,
    expiresInMs,
  };
}

export function clearAdminSessionCookie(res: Response) {
  const cookieName = getAdminSessionCookieName();
  res.clearCookie(cookieName, { path: "/admin" });
}
