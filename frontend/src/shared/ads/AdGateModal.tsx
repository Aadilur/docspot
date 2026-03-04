import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ShareGateNativeAd } from "./placements";

type Props = {
  open: boolean;
  seconds?: number;
  onClose: () => void;
};

export function AdGateModal({ open, seconds = 14, onClose }: Props) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (!open) return;

    setRemaining(seconds);

    const startedAt = Date.now();
    const id = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const next = Math.max(0, seconds - elapsedSeconds);
      setRemaining(next);
      if (next <= 0) window.clearInterval(id);
    }, 200);

    return () => {
      window.clearInterval(id);
    };
  }, [open, seconds]);

  const locked = remaining > 0;

  useEffect(() => {
    if (!open) return;
    if (locked) return;
    onClose();
  }, [open, locked, onClose]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, locked, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("adSponsored")}
    >
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm"
        onClick={() => {
          if (locked) return;
          onClose();
        }}
        aria-label={t("close")}
      />

      <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-xl dark:border-zinc-800/70 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-3">
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {t("adSponsored")}
          </div>
          {locked ? (
            <div className="mt-0.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {remaining}s
            </div>
          ) : null}
        </div>

        <div className="mt-4 empty:hidden">
          <ShareGateNativeAd />
        </div>

        <div className="mt-5">
          {!locked ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
            >
              {t("close")}
            </button>
          ) : (
            <div className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {t("loading")} ({remaining}s)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
