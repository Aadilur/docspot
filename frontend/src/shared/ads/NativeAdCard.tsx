import { useTranslation } from "react-i18next";
import { useState } from "react";

import { useAdsEnabled } from "./useAdsEnabled";
import { AdSenseSlot } from "./AdSenseSlot";

export function NativeAdCard(props: {
  slot: string;
  className?: string;
  minHeightClassName?: string;
}) {
  const { enabled } = useAdsEnabled();
  const { t } = useTranslation();
  const [filled, setFilled] = useState<boolean | null>(null);

  if (!enabled || !props.slot) return null;
  if (filled === false) return null;

  return (
    <div
      className={[
        "rounded-2xl border border-zinc-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-sm",
        "dark:border-zinc-800/70 dark:bg-zinc-950/30",
        props.className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
        {t("adSponsored")}
      </div>

      <div
        className={["w-full", props.minHeightClassName]
          .filter(Boolean)
          .join(" ")}
      >
        <AdSenseSlot
          slot={props.slot}
          onFilledChange={setFilled}
          unfilledTimeoutMs={6000}
        />
      </div>
    </div>
  );
}
