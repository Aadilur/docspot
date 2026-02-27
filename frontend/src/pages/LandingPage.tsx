import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { setLanguage } from "../shared/i18n";
import { signInWithGoogle, signOutUser } from "../shared/firebase/auth";
import { useTheme } from "../shared/theme/useTheme";

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const { toggle } = useTheme();
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const trustPoints = useMemo(
    () => t("trustPoints", { returnObjects: true }) as string[],
    [t],
  );

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-brand-600/15 ring-1 ring-brand-500/25 dark:bg-brand-400/10 dark:ring-brand-400/20" />
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t("brand")}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              PWA • Responsive
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label
            className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:block"
            htmlFor="lang"
          >
            {t("language")}
          </label>
          <select
            id="lang"
            value={i18n.language}
            onChange={(e) => setLanguage(e.target.value as "en" | "bn")}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-800 shadow-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-brand-700 dark:focus:ring-brand-900"
          >
            <option value="en">English</option>
            <option value="bn">বাংলা</option>
          </select>

          <button
            type="button"
            onClick={toggle}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            {t("toggleTheme")}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("tagline")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              {t("ctaPrimary")}
            </button>

            {authEmail ? (
              <button
                type="button"
                onClick={async () => {
                  setAuthBusy(true);
                  setAuthError(null);
                  try {
                    await signOutUser();
                    setAuthEmail(null);
                  } catch (e) {
                    setAuthError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setAuthBusy(false);
                  }
                }}
                disabled={authBusy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                {t("signOut")}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  setAuthBusy(true);
                  setAuthError(null);
                  try {
                    const result = await signInWithGoogle();
                    setAuthEmail(result.user.email ?? result.user.uid);
                  } catch (e) {
                    setAuthError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setAuthBusy(false);
                  }
                }}
                disabled={authBusy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                {t("signInGoogle")}
              </button>
            )}

            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
            >
              {t("ctaSecondary")}
            </button>
            <p className="w-full pt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {t("comingSoon")}
            </p>

            {authEmail ? (
              <p className="w-full text-sm text-zinc-600 dark:text-zinc-300">
                {t("signedInAs")}:{" "}
                <span className="font-medium">{authEmail}</span>
              </p>
            ) : null}

            {authError ? (
              <p className="w-full text-sm text-red-600 dark:text-red-400">
                {authError}
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("trustTitle")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">
              {trustPoints.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-1 inline-block h-2 w-2 flex-none rounded-full bg-brand-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              PWA
            </h2>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Installable on mobile and desktop. Works well on slow networks.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Monetization
            </h2>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              Ads + rewarded ads for sharing (planned). Pro features later.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-5 pb-10 text-xs text-zinc-500 dark:text-zinc-400">
        © {new Date().getFullYear()} DocSpot
      </footer>
    </div>
  );
}
