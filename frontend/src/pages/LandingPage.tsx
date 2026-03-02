import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  BellRing,
  Check,
  FileText,
  Pill,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import PricingSection from "../components/PricingSection";
import { getCmsBannersCached } from "../shared/api/cms";

type CmsBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
  imageAlt: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  sortOrder: number;
  updatedAt: string;
};

function ProductMockImage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-100/70 via-white to-white shadow-sm ring-1 ring-zinc-200/70 transition-transform duration-300 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:from-brand-500/10 dark:via-zinc-950 dark:to-zinc-950 dark:ring-zinc-800/70">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(0,0,0,0.05),transparent_55%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.06),transparent_55%)]" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {title}
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              {subtitle}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/70 backdrop-blur dark:bg-zinc-950/40 dark:text-zinc-200 dark:ring-zinc-800/70">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" />
            {t("demoTag", { defaultValue: "Demo" })}
          </div>
        </div>

        <svg
          viewBox="0 0 640 360"
          className="mt-5 h-auto w-full"
          role="img"
          aria-label={title}
        >
          <rect
            x="0"
            y="0"
            width="640"
            height="360"
            rx="22"
            className="fill-white/60 stroke-zinc-200/80 dark:fill-zinc-950/30 dark:stroke-zinc-800/80"
          />

          <rect
            x="24"
            y="24"
            width="180"
            height="26"
            rx="10"
            className="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-900/60 dark:stroke-zinc-800"
          />
          <rect
            x="222"
            y="24"
            width="110"
            height="26"
            rx="10"
            className="fill-brand-600/10 stroke-brand-500/20 dark:fill-brand-400/10 dark:stroke-brand-400/20"
          />
          <rect
            x="352"
            y="24"
            width="110"
            height="26"
            rx="10"
            className="fill-zinc-100 stroke-zinc-200 dark:fill-zinc-900/60 dark:stroke-zinc-800"
          />

          <rect
            x="24"
            y="72"
            width="592"
            height="88"
            rx="18"
            className="fill-white stroke-zinc-200/80 dark:fill-zinc-950/40 dark:stroke-zinc-800/80"
          />
          <rect
            x="44"
            y="92"
            width="220"
            height="14"
            rx="7"
            className="fill-zinc-200 dark:fill-zinc-800"
          />
          <rect
            x="44"
            y="116"
            width="320"
            height="14"
            rx="7"
            className="fill-zinc-100 dark:fill-zinc-900"
          />
          <rect
            x="468"
            y="94"
            width="128"
            height="44"
            rx="14"
            className="fill-brand-600/10 stroke-brand-500/20 dark:fill-brand-400/10 dark:stroke-brand-400/20"
          />

          <rect
            x="24"
            y="178"
            width="286"
            height="158"
            rx="18"
            className="fill-white stroke-zinc-200/80 dark:fill-zinc-950/40 dark:stroke-zinc-800/80"
          />
          <rect
            x="44"
            y="198"
            width="166"
            height="14"
            rx="7"
            className="fill-zinc-200 dark:fill-zinc-800"
          />
          <rect
            x="44"
            y="222"
            width="230"
            height="14"
            rx="7"
            className="fill-zinc-100 dark:fill-zinc-900"
          />
          <rect
            x="44"
            y="258"
            width="240"
            height="58"
            rx="14"
            className="fill-zinc-50 stroke-zinc-200/70 dark:fill-zinc-950/30 dark:stroke-zinc-800/70"
          />

          <rect
            x="330"
            y="178"
            width="286"
            height="158"
            rx="18"
            className="fill-white stroke-zinc-200/80 dark:fill-zinc-950/40 dark:stroke-zinc-800/80"
          />
          <rect
            x="350"
            y="198"
            width="166"
            height="14"
            rx="7"
            className="fill-zinc-200 dark:fill-zinc-800"
          />
          <rect
            x="350"
            y="222"
            width="230"
            height="14"
            rx="7"
            className="fill-zinc-100 dark:fill-zinc-900"
          />
          <circle
            cx="574"
            cy="267"
            r="34"
            className="fill-brand-600/15 dark:fill-brand-400/15"
          />
          <path
            d="M560 268l10 10 20-26"
            className="fill-none stroke-brand-700 stroke-[10] dark:stroke-brand-300"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();

  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [banners, setBanners] = useState<CmsBanner[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (cancelled) return;
        const next = await getCmsBannersCached();
        setBanners(next);
      } catch {
        if (cancelled) return;
        setBanners([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!getStartedOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGetStartedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [getStartedOpen]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <Header />

      <main className="relative mx-auto w-full max-w-5xl px-4 pb-12 pt-6 sm:px-5 sm:pt-8">
        {banners.length > 0 && (
          <section
            aria-label={t("bannerTitle", { defaultValue: "Banners" }) as any}
            className="mb-8 grid gap-3"
          >
            {banners.map((banner) => {
              const Wrapper: any = banner.linkUrl ? "a" : "div";
              const wrapperProps = banner.linkUrl
                ? {
                    href: banner.linkUrl,
                    target: "_blank",
                    rel: "noreferrer",
                  }
                : {};

              const alt =
                banner.imageAlt || t("bannerImage", { defaultValue: "Banner" });

              return (
                <Wrapper
                  key={banner.id}
                  {...wrapperProps}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
                >
                  <div className="relative w-full overflow-hidden bg-zinc-50 dark:bg-zinc-900/40">
                    <div className="relative h-72 w-full sm:h-72">
                      {banner.imageUrl ? (
                        <img
                          src={banner.imageUrl}
                          alt={alt as any}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                          {t("banner", { defaultValue: "Banner" })}
                        </div>
                      )}

                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-zinc-950/35 via-zinc-950/0 to-transparent dark:from-black/55"
                      />

                      {/* {(banner.title || banner.subtitle) && (
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          {banner.title && (
                            <div className="text-sm font-semibold text-white">
                              {banner.title}
                            </div>
                          )}
                          {banner.subtitle && (
                            <div className="mt-1 text-xs text-white/85">
                              {banner.subtitle}
                            </div>
                          )}
                        </div>
                      )} */}
                    </div>
                  </div>
                </Wrapper>
              );
            })}
          </section>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <div className="absolute -top-28 left-1/2 h-72 w-[46rem] -translate-x-1/2 rounded-full bg-brand-400/25 blur-3xl motion-safe:animate-pulse dark:bg-brand-500/10" />
          <div className="absolute -right-24 top-28 h-72 w-72 rounded-full bg-brand-300/25 blur-3xl motion-safe:animate-pulse dark:bg-brand-500/10" />
          <div className="absolute -left-24 bottom-8 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl motion-safe:animate-pulse dark:bg-brand-400/10" />
        </div>

        <section
          id="home"
          className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30 sm:p-8"
        >
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
                {t("brand")}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                {t("tagline")}
              </h1>
              <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
                {t("subtitle")}
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <ShieldCheck className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgePrivate")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <Sparkles className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgeCalm")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <Users className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgeFamily")}
                </span>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setGetStartedOpen(true)}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 motion-reduce:transition-none dark:focus:ring-brand-900"
                >
                  {t("ctaPrimary")}
                </button>
                <a
                  href="/about"
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                >
                  {t("ctaSecondary")}
                </a>
              </div>

              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {t("heroFootnote")}
              </p>
            </div>

            <div className="md:pl-2">
              <ProductMockImage
                title={t("demoPreviewTitle") as any}
                subtitle={t("demoPreviewBody") as any}
              />

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini1Title")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini2Title")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini3Title")}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="reminder" className="mt-10 scroll-mt-24">
          <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-gradient-to-br from-brand-50 via-white to-white p-6 shadow-sm dark:border-zinc-800/70 dark:from-brand-500/10 dark:via-zinc-950 dark:to-zinc-950 sm:p-8">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-100">
                  <BellRing
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("availableNow")}
                </div>

                <h2 className="mt-4 text-balance text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
                  {t("reminderSpotlightTitle")}
                </h2>
                <p className="mt-2 max-w-xl text-pretty text-sm text-zinc-600 dark:text-zinc-300">
                  {t("reminderSpotlightBody")}
                </p>

                <ul className="mt-5 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {[1, 2, 3, 4].map((n) => (
                    <li key={n} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {t(`reminderFeature${n}Title` as any)}
                        </div>
                        <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                          {t(`reminderFeature${n}Body` as any)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setGetStartedOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 motion-reduce:transition-none dark:focus:ring-brand-900"
                  >
                    {t("reminderCta")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <a
                    href="#services"
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                  >
                    {t("reminderSeeAll")}
                  </a>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>{t("reminderPrivacyBody")}</span>
                </div>
              </div>

              <div className="md:pl-2">
                <ProductMockImage
                  title={t("reminderPreviewTitle") as any}
                  subtitle={t("reminderPreviewBody") as any}
                />
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="mt-12 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("howItWorksTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("howItWorksBody")}
          </p>

          <ol className="mt-6 grid gap-3">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="flex items-start gap-4 rounded-2xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm transition-colors hover:bg-white motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:hover:bg-zinc-950"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-sm font-semibold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  {n}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t(`howItWorksStep${n}Title` as any)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {t(`howItWorksStep${n}Body` as any)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="services" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("servicesTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("servicesBody")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              to="/prescription"
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
              aria-label={t("servicePrescriptionTitle")}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 text-brand-700 dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-brand-300">
                <Pill className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("servicePrescriptionTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("servicePrescriptionBody")}
              </p>
            </Link>
            <Link
              to="/invoice"
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
              aria-label={t("serviceDocumentTitle")}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 text-brand-700 dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-brand-300">
                <Receipt className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceDocumentTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("serviceDocumentBody")}
              </p>
            </Link>
            <Link
              to="/other-doc"
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
              aria-label={t("serviceOtherTitle")}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 text-brand-700 dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-brand-300">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceOtherTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("serviceOtherBody")}
              </p>
            </Link>

            <a
              href="#reminder"
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
              aria-label={t("serviceReminderTitle") as any}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-200/70 bg-white/70 text-brand-700 dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-brand-300">
                  <BellRing className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  {t("availableNow")}
                </span>
              </div>

              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceReminderTitle")}
              </h3>
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                {t("serviceReminderBody")}
              </p>

              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
                {t("reminderLearnMore")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </a>
          </div>
        </section>

        <PricingSection />

        <section id="testimonials" className="mt-12 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("testimonialsTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("testimonialsBody")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <figure
                key={n}
                className="rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/60"
              >
                <blockquote className="text-sm text-zinc-700 dark:text-zinc-200">
                  “{t(`testimonial${n}Quote` as any)}”
                </blockquote>
                <figcaption className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  — {t(`testimonial${n}Name` as any)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section id="faq" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("faqTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
            {t("faqBody")}
          </p>

          <div className="mt-6 grid gap-3">
            {[1, 2, 3].map((n) => (
              <details
                key={n}
                className="group rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
              >
                <summary className="cursor-pointer list-none select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                  {t(`faqQ${n}` as any)}
                </summary>
                <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {t(`faqA${n}` as any)}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />

      {getStartedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("getStartedModalTitle")}
        >
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setGetStartedOpen(false)}
            className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px] dark:bg-black/40"
          />

          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("getStartedModalTitle")}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("getStartedModalBody")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGetStartedOpen(false)}
                aria-label={t("close")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link
                to="/prescription"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Pill className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storePrescription")}
                </div>
              </Link>

              <Link
                to="/invoice"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Receipt className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeInvoice")}
                </div>
              </Link>

              <Link
                to="/other-doc"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeOtherDoc")}
                </div>
              </Link>

              <a
                href="#reminder"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeReminder")}
                </div>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
