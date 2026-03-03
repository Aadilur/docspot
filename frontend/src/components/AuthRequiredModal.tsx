import { useEffect } from "react";
import { useTranslation } from "react-i18next";

type Props = {
  open: boolean;
  busy?: boolean;
  canAuth?: boolean;
  title?: string;
  body?: string;
  disabledReason?: string;
  onClose: () => void;
  onContinue: () => Promise<void> | void;
};

export default function AuthRequiredModal({
  open,
  busy = false,
  canAuth = true,
  title,
  body,
  disabledReason,
  onClose,
  onContinue,
}: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? t("authModalTitle")}
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t("close")}
      />

      <div className="relative w-full max-w-md rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-xl dark:border-zinc-800/70 dark:bg-zinc-950">
        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title ?? t("authModalTitle")}
        </div>
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {body ?? t("authModalBody")}
        </div>

        {disabledReason && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
            {disabledReason}
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={async () => {
              if (!canAuth || busy) return;
              await onContinue();
            }}
            disabled={!canAuth || busy}
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
          >
            {busy ? t("loading") : t("signInGoogle")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
