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

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = (req as any).auth as AuthContext | undefined;
  if (!auth?.uid) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const raw = (process.env.ADMIN_UIDS || "").trim();
  const adminUids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminUids.length === 0 || !adminUids.includes(auth.uid)) {
    res.status(403).json({ ok: false, error: "Forbidden" });
    return;
  }

  next();
}
