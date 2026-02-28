import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { FileText, Pill, Receipt, X } from "lucide-react";

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
            className="mb-6 grid gap-3 "
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
                  <div className="relative  w-full overflow-hidden bg-zinc-50 dark:bg-zinc-900/40">
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
                  </div>
                </Wrapper>
              );
            })}
          </section>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-gradient-to-b from-brand-100/40 via-transparent to-transparent dark:from-brand-500/10"
        />
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
            <button
              type="button"
              onClick={() => setGetStartedOpen(true)}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              {t("ctaPrimary")}
            </button>
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
            <Link
              to="/prescription"
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
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
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
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
              className="group rounded-2xl border border-zinc-200/70 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
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

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
