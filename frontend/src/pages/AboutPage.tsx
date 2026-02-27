import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function AboutPage() {
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
            {t("aboutPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("aboutPageSubtitle")}
          </p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("aboutCompanyTitle")}
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("companyName")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  docspot
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
                  {t("location")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("locationValue")}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
              {t("aboutPrivacyNote")}
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("aboutProductTitle")}
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("category")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("categoryValue")}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("status")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("statusValue")}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">
                  {t("access")}
                </dt>
                <dd className="text-right font-medium text-zinc-800 dark:text-zinc-100">
                  {t("accessValue")}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {t("supportLine")}{" "}
              <a
                href="mailto:support@docspot.app"
                className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                support@docspot.app
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
