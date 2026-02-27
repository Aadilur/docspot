import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { LogOut, Moon, Sun, UserRound } from "lucide-react";

import { setLanguage } from "../shared/i18n";
import { signInWithGoogle, signOutUser } from "../shared/firebase/auth";
import { useAuthState } from "../shared/firebase/useAuthState";
import { useTheme } from "../shared/theme/useTheme";

function truncate(value: string, max = 22) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();
  const { configured, loading, user, error } = useAuthState();

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const identity = useMemo(() => {
    if (!user) return null;
    return user.email ?? user.displayName ?? user.uid;
  }, [user]);

  const canAuth = configured && !loading;

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/60">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-brand-600/15 ring-1 ring-brand-500/25 dark:bg-brand-400/10 dark:ring-brand-400/20" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t("brand")}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              PWA • Responsive
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-zinc-600 dark:text-zinc-300 sm:flex">
          <Link to="/" className="hover:text-zinc-900 dark:hover:text-zinc-50">
            {t("navHome")}
          </Link>
          <Link
            to="/about"
            className="hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            {t("navAbout")}
          </Link>
          <Link
            to="/contact"
            className="hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            {t("navContact")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <select
            aria-label={t("language")}
            value={i18n.language}
            onChange={(e) => setLanguage(e.target.value as "en" | "bn")}
            className="hidden rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-brand-700 dark:focus:ring-brand-900 sm:block"
          >
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>

          <button
            type="button"
            onClick={toggle}
            aria-label={t("toggleTheme")}
            aria-pressed={theme === "dark"}
            className="group relative inline-flex h-9 w-[72px] items-center rounded-full border border-zinc-200 bg-white px-1 shadow-sm transition-colors duration-300 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            <span
              className={
                "inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-zinc-100 dark:text-zinc-900 " +
                (theme === "dark" ? "translate-x-[34px]" : "translate-x-0")
              }
            >
              {theme === "dark" ? (
                <Moon className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Sun className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
          </button>

          {user ? (
            <details className="relative group">
              <summary
                className="cursor-pointer list-none select-none rounded-full focus:outline-none focus:ring-2 focus:ring-brand-200 dark:focus:ring-brand-900 [&::-webkit-details-marker]:hidden"
                aria-label={t("accountMenu")}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-brand-600/15 ring-1 ring-brand-500/25 dark:bg-brand-400/10 dark:ring-brand-400/20">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={t("accountAvatarAlt")}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserRound
                      className="h-5 w-5 text-zinc-700 dark:text-zinc-200"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </summary>

              <div className="pointer-events-none absolute right-0 mt-2 w-64 translate-y-1 scale-[0.98] rounded-2xl border border-zinc-200 bg-white p-3 opacity-0 shadow-lg transition duration-200 ease-out motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 group-open:pointer-events-auto group-open:translate-y-0 group-open:scale-100 group-open:opacity-100">
                <div className="px-1 pb-2">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {user.displayName ?? t("account")}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {truncate(identity ?? "", 32)}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Link
                    to="/profile"
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    {t("profile")}
                  </Link>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        await signOutUser();
                      } catch (e) {
                        setActionError(
                          e instanceof Error ? e.message : String(e),
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {t("signOut")}
                  </button>
                </div>
              </div>
            </details>
          ) : (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setActionError(null);
                try {
                  await signInWithGoogle();
                } catch (e) {
                  setActionError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !canAuth}
              title={!configured ? t("firebaseNotConfigured") : undefined}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-60 dark:focus:ring-brand-900"
            >
              {t("signInGoogle")}
            </button>
          )}
        </div>
      </div>

      {(error || actionError) && (
        <div className="mx-auto w-full max-w-5xl px-5 pb-3">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {actionError ?? error}
          </div>
        </div>
      )}
    </header>
  );
}
