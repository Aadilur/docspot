import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-zinc-200/70 py-10 text-xs text-zinc-500 dark:border-zinc-800/70 dark:text-zinc-400">
      <div className="mx-auto w-full max-w-5xl px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            © {new Date().getFullYear()} {t("brand")}
          </div>
          <div className="flex gap-4">
            <Link
              to="/"
              className="hover:text-zinc-900 dark:hover:text-zinc-50"
            >
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
          </div>
        </div>
      </div>
    </footer>
  );
}
