import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { getCmsLogoCached } from "../shared/api/cms";

export default function Footer() {
  const { t } = useTranslation();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoAlt, setLogoAlt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const logo = await getCmsLogoCached();
      if (cancelled) return;
      setLogoUrl(logo?.imageUrl ?? null);
      setLogoAlt(logo?.imageAlt ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="border-t border-zinc-200/70 bg-white/50 py-12 text-xs text-zinc-500 backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-zinc-400">
      <div className="mx-auto w-full max-w-5xl px-5">
        <div className="grid gap-8 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-brand-600/15 ring-1 ring-brand-500/25 dark:bg-brand-400/10 dark:ring-brand-400/20">
                <img
                  src={logoUrl ?? "/icon.svg"}
                  alt={(logoAlt ?? t("brand")) as any}
                  className="h-6 w-6 object-contain"
                />
              </div>
              <div className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                {t("brand")}
              </div>
            </Link>

            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("subtitle")}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white/70 p-4 text-xs shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                {t("footerSupport")}
              </div>
              <a
                href="mailto:support@docspot.app"
                className="mt-2 inline-flex rounded-lg px-1 py-0.5 font-semibold text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-200 dark:text-brand-300 dark:focus:ring-brand-900"
              >
                support@docspot.app
              </a>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              {t("footerProduct")}
            </div>
            <div className="mt-3 grid gap-2">
              <Link
                to="/prescription"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("storePrescription")}
              </Link>
              <Link
                to="/invoice"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("storeInvoice")}
              </Link>
              <Link
                to="/other-doc"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("storeOtherDoc")}
              </Link>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              {t("footerLegal")}
            </div>
            <div className="mt-3 grid gap-2">
              <Link
                to="/terms-and-conditions"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("footerTerms")}
              </Link>
              <Link
                to="/privacy-policy"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("footerPrivacy")}
              </Link>
              <Link
                to="/refund-policy"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("footerRefund")}
              </Link>

              <Link
                to="/contact"
                className="rounded-lg px-1 py-0.5 text-sm hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
              >
                {t("navContact")}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-zinc-200/70 pt-6 text-xs text-zinc-500 dark:border-zinc-800/70 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
          <div>
            © {new Date().getFullYear()} {t("brand")}
          </div>
          <div className="text-zinc-500 dark:text-zinc-400">
            {t("footerCompany")}: {t("businessTypeValue")} •{" "}
            {t("locationValue")}
          </div>
        </div>
      </div>
    </footer>
  );
}
