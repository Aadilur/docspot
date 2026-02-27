import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";
import { API_BASE_URL } from "../shared/api/http";

type AuthLevel = "public" | "auth" | "admin";

type Endpoint = {
  method: string;
  path: string;
  auth: AuthLevel;
  description: string;
};

const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/", auth: "public", description: "Liveness" },
  {
    method: "GET",
    path: "/health",
    auth: "public",
    description: "Service health",
  },
  {
    method: "GET",
    path: "/health/db",
    auth: "public",
    description: "Database connectivity",
  },
  {
    method: "GET",
    path: "/health/storage",
    auth: "public",
    description: "Storage config status",
  },

  {
    method: "POST",
    path: "/uploads/presign",
    auth: "auth",
    description: "Presign generic upload",
  },

  {
    method: "GET",
    path: "/me",
    auth: "auth",
    description: "Get or create current user",
  },
  {
    method: "PATCH",
    path: "/me",
    auth: "auth",
    description: "Update current user",
  },
  {
    method: "POST",
    path: "/me/photo/presign",
    auth: "auth",
    description: "Presign profile photo upload",
  },
  {
    method: "GET",
    path: "/me/photo",
    auth: "auth",
    description: "Redirect to signed photo URL",
  },

  { method: "GET", path: "/users", auth: "admin", description: "List users" },
  {
    method: "GET",
    path: "/users/:id",
    auth: "admin",
    description: "Get user by id",
  },
  {
    method: "GET",
    path: "/users/by-provider",
    auth: "admin",
    description: "Find user by provider identity",
  },
  { method: "POST", path: "/users", auth: "admin", description: "Create user" },
  {
    method: "POST",
    path: "/users/upsert",
    auth: "admin",
    description: "Upsert user",
  },
  {
    method: "PATCH",
    path: "/users/:id",
    auth: "admin",
    description: "Update user",
  },
  {
    method: "DELETE",
    path: "/users/:id",
    auth: "admin",
    description: "Delete user",
  },
  {
    method: "POST",
    path: "/users/:id/photo/presign",
    auth: "admin",
    description: "Presign user photo upload",
  },
  {
    method: "GET",
    path: "/users/:id/photo",
    auth: "admin",
    description: "Redirect to signed user photo URL",
  },
];

function authBadgeClasses(level: AuthLevel): string {
  if (level === "public") {
    return "border-zinc-200 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200";
  }
  if (level === "auth") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200";
}

export default function EndpointsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("endpointsPageTitle")}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            {t("endpointsPageSubtitle")}{" "}
            <span className="font-semibold">{API_BASE_URL}</span>
          </p>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60">
          <div className="grid grid-cols-[92px,1fr,110px] gap-3 border-b border-zinc-200/70 bg-white/60 px-5 py-3 text-xs font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
            <div>{t("endpointsMethod")}</div>
            <div>{t("endpointsPath")}</div>
            <div>{t("endpointsAuth")}</div>
          </div>

          <div className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
            {ENDPOINTS.map((ep) => (
              <div
                key={`${ep.method}:${ep.path}`}
                className="grid grid-cols-[92px,1fr,110px] gap-3 px-5 py-3 text-sm"
              >
                <div className="font-mono text-xs text-zinc-700 dark:text-zinc-200">
                  {ep.method}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-xs text-zinc-900 dark:text-zinc-50">
                    {ep.path}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {ep.description}
                  </div>
                </div>
                <div>
                  <span
                    className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-[11px] font-semibold ${authBadgeClasses(ep.auth)}`}
                  >
                    {ep.auth === "public"
                      ? t("endpointsPublic")
                      : ep.auth === "auth"
                        ? t("endpointsAuthRequired")
                        : t("endpointsAdminOnly")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
