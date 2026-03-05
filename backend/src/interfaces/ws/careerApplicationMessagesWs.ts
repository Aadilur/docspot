import type { IncomingMessage, Server as HttpServer } from "node:http";

import WebSocket, { WebSocketServer, type RawData } from "ws";

import { ensureSchema } from "../../infrastructure/db/schema";
import { getPostgresPool } from "../../infrastructure/db/postgres";
import { upsertUser } from "../../infrastructure/db/users";
import * as careerApplicationsDb from "../../infrastructure/db/careerApplications";
import {
  getAdminSessionCookieName,
  verifyAdminSessionCookie,
  verifyFirebaseIdToken,
} from "../http/middleware/firebaseAuth";

type SubscribeMessage = {
  type: "subscribe";
  token?: string;
  applicationId: string;
  afterCreatedAt?: string | null;
};

type WsEnvelope =
  | SubscribeMessage
  | {
      type: string;
      [key: string]: unknown;
    };

type ConnectionContext = {
  userId: string;
  isAdmin: boolean;
  subscribedApplicationIds: Set<string>;
};

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = String(header || "").trim();
  if (!raw) return out;

  for (const part of raw.split(";")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const key = p.slice(0, idx).trim();
    const value = p.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }

  return out;
}

function isAdminClaims(decoded: any): boolean {
  if (decoded?.admin === true) return true;
  if (decoded?.role === "admin") return true;
  if (Array.isArray(decoded?.roles) && decoded.roles.includes("admin")) {
    return true;
  }
  return false;
}

function isAdminUid(uid: string): boolean {
  const raw = (process.env.ADMIN_UIDS || "").trim();
  if (!raw) return false;
  const adminUids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminUids.length === 0) return false;
  return adminUids.includes(uid);
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function rawDataToUtf8(data: RawData): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return "";
}

const subscribersByApplicationId = new Map<string, Set<WebSocket>>();
const contextBySocket = new WeakMap<WebSocket, ConnectionContext>();
const cookieHeaderBySocket = new WeakMap<WebSocket, string>();

function subscribeSocketToApplication(params: {
  ws: WebSocket;
  applicationId: string;
}): void {
  const { ws, applicationId } = params;

  let set = subscribersByApplicationId.get(applicationId);
  if (!set) {
    set = new Set();
    subscribersByApplicationId.set(applicationId, set);
  }
  set.add(ws);

  const ctx = contextBySocket.get(ws);
  if (ctx) {
    ctx.subscribedApplicationIds.add(applicationId);
  }
}

function cleanupSocket(ws: WebSocket): void {
  const ctx = contextBySocket.get(ws);
  if (ctx) {
    for (const appId of ctx.subscribedApplicationIds) {
      const set = subscribersByApplicationId.get(appId);
      if (!set) continue;
      set.delete(ws);
      if (set.size === 0) subscribersByApplicationId.delete(appId);
    }
  } else {
    for (const [appId, set] of subscribersByApplicationId) {
      set.delete(ws);
      if (set.size === 0) subscribersByApplicationId.delete(appId);
    }
  }

  contextBySocket.delete(ws);
}

async function handleSubscribe(params: {
  ws: WebSocket;
  msg: SubscribeMessage;
}): Promise<void> {
  const { ws, msg } = params;

  const token = typeof msg.token === "string" ? msg.token.trim() : "";
  const applicationId =
    typeof msg.applicationId === "string" ? msg.applicationId.trim() : "";
  if (!applicationId) {
    sendJson(ws, { ok: false, error: "missing applicationId" });
    return;
  }

  const auth = token
    ? await verifyFirebaseIdToken(token)
    : await (async () => {
        const cookieHeader = cookieHeaderBySocket.get(ws) || "";
        const cookies = parseCookieHeader(cookieHeader);
        const cookieName = getAdminSessionCookieName();
        const sessionCookie = cookies[cookieName] || "";
        if (!sessionCookie) {
          throw new Error("missing auth");
        }
        return await verifyAdminSessionCookie(sessionCookie);
      })();

  const me = await upsertUser({
    provider: "firebase",
    providerUserId: auth.uid,
    email: auth.email ?? null,
    displayName: auth.name ?? null,
    photoUrl: null,
    locale: auth.locale ?? null,
    metadata: {
      firebase: { uid: auth.uid },
      signInProvider: auth.provider ?? null,
    },
  });

  const allowAdmin = isAdminClaims(auth.decoded) || isAdminUid(auth.uid);

  const application =
    await careerApplicationsDb.getCareerApplicationById(applicationId);
  if (!application) {
    sendJson(ws, { ok: false, error: "not found" });
    return;
  }

  const allow = allowAdmin || application.userId === me.id;
  if (!allow) {
    sendJson(ws, { ok: false, error: "forbidden" });
    return;
  }

  const existingCtx = contextBySocket.get(ws);
  if (!existingCtx) {
    contextBySocket.set(ws, {
      userId: me.id,
      isAdmin: allowAdmin,
      subscribedApplicationIds: new Set([applicationId]),
    });
  }

  subscribeSocketToApplication({ ws, applicationId });
  sendJson(ws, { ok: true, type: "subscribed", applicationId });

  const after =
    typeof msg.afterCreatedAt === "string" ? msg.afterCreatedAt.trim() : "";

  // Optional catch-up: only when a valid timestamp is provided.
  if (after) {
    const afterDate = new Date(after);
    if (!Number.isNaN(afterDate.getTime())) {
      const backlog = await careerApplicationsDb.listCareerApplicationMessages({
        applicationId,
        afterCreatedAt: after,
        limit: 200,
      });

      if (backlog.length) {
        sendJson(ws, {
          ok: true,
          type: "messages",
          applicationId,
          messages: backlog,
        });
      }
    }
  }
}

let pgListenerStarted = false;

async function startPgListener(): Promise<void> {
  if (pgListenerStarted) return;
  pgListenerStarted = true;

  await ensureSchema();
  const pool = getPostgresPool();
  const client = await pool.connect();

  await client.query("listen career_application_messages");

  client.on("notification", async (msg) => {
    if (msg.channel !== "career_application_messages") return;

    const payload = typeof msg.payload === "string" ? msg.payload : "";
    const parsed: any = payload ? safeJsonParse(payload) : null;
    const applicationId =
      parsed && typeof parsed.applicationId === "string"
        ? parsed.applicationId
        : "";
    const messageId =
      parsed && typeof parsed.messageId === "string" ? parsed.messageId : "";
    if (!applicationId || !messageId) return;

    const created =
      await careerApplicationsDb.getCareerApplicationMessageById(messageId);
    if (!created) return;

    const set = subscribersByApplicationId.get(applicationId);
    if (!set || set.size === 0) return;

    const payloadToSend = {
      ok: true,
      type: "message",
      applicationId,
      message: created,
    };

    for (const ws of set) {
      try {
        sendJson(ws, payloadToSend);
      } catch {
        // ignore
      }
    }
  });

  client.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("ws: pg listener error", err);
  });
}

export function mountCareerApplicationMessagesWs(params: {
  server: HttpServer;
}): void {
  void startPgListener().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("ws: failed to start pg listener", err);
  });

  const mountWss = (path: string) => {
    const wss = new WebSocketServer({
      server: params.server,
      path,
    });

    wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
      const cookieHeader = req?.headers?.cookie;
      if (typeof cookieHeader === "string" && cookieHeader.trim()) {
        cookieHeaderBySocket.set(ws, cookieHeader);
      }

      ws.on("message", (data: RawData) => {
        const text = rawDataToUtf8(data);
        const parsed = safeJsonParse(text);
        const msg = (
          parsed && typeof parsed === "object" ? parsed : null
        ) as WsEnvelope | null;

        if (!msg || typeof (msg as any).type !== "string") {
          sendJson(ws, { ok: false, error: "invalid message" });
          return;
        }

        if ((msg as any).type === "subscribe") {
          void handleSubscribe({ ws, msg: msg as SubscribeMessage }).catch(
            (err) => {
              const message = err instanceof Error ? err.message : "error";
              sendJson(ws, { ok: false, error: message });
            },
          );
          return;
        }

        sendJson(ws, { ok: false, error: "unsupported message" });
      });

      ws.on("close", () => {
        cleanupSocket(ws);
      });

      ws.on("error", () => {
        cleanupSocket(ws);
      });
    });
  };

  // App clients (Firebase ID token in subscribe message)
  mountWss("/ws/careers");

  // AdminJS clients (admin session cookie is scoped to /admin)
  mountWss("/admin/ws/careers");
}
