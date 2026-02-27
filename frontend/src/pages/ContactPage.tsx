import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function ContactPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("contactPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("contactPageSubtitle")}
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("supportTitle")}
            </h2>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              {t("supportBody")}
            </p>
            <div className="mt-4">
              <a
                href="mailto:support@docspot.app"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
              >
                support@docspot.app
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("contactInfoTitle")}
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("location")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("locationValue")}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("businessType")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("businessTypeValue")}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("category")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("categoryValue")}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              {t("contactPrivacyNote")}
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
