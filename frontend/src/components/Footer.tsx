import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-zinc-200/70 bg-white/50 py-10 text-xs text-zinc-500 backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30 dark:text-zinc-400">
      <div className="mx-auto w-full max-w-5xl px-5">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <div className="text-zinc-700 dark:text-zinc-300">
              © {new Date().getFullYear()} {t("brand")}
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              {t("subtitle")}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Link
              to="/prescription"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("storePrescription")}
            </Link>
            <Link
              to="/invoice"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("storeInvoice")}
            </Link>
            <Link
              to="/other-doc"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("storeOtherDoc")}
            </Link>
            <Link
              to="/"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("navHome")}
            </Link>
            <Link
              to="/about"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("navAbout")}
            </Link>
            <Link
              to="/contact"
              className="rounded-lg px-1 py-0.5 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:hover:text-zinc-50 dark:focus:ring-brand-900"
            >
              {t("navContact")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
