import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section
          id="home"
          className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("tagline")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="#services"
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              {t("ctaPrimary")}
            </a>
            <a
              href="/about"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
            >
              {t("ctaSecondary")}
            </a>
            <p className="w-full pt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {t("comingSoon")}
            </p>
          </div>
        </section>

        <section id="services" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("servicesTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("servicesBody")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("servicePrescriptionTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("servicePrescriptionBody")}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceDocumentTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("serviceDocumentBody")}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceOtherTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("serviceOtherBody")}
              </p>
            </div>
          </div>
        </section>

        <section id="account" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("planTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("planBody")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("freePlanTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("freePlanBody")}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("privacyTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("privacyBody")}
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
