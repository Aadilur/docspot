import { useEffect, useId, useRef } from "react";

import { ADSENSE_CLIENT, ADSENSE_TEST_MODE } from "./config";
import { ensureAdSenseScript, requestAdRender } from "./adsense";
import { useAdsEnabled } from "./useAdsEnabled";

type Props = {
  slot: string;
  format?: string;
  layout?: string;
  layoutKey?: string;
  fullWidthResponsive?: boolean;
  className?: string;
};

export function AdSenseSlot({
  slot,
  format = "auto",
  layout,
  layoutKey,
  fullWidthResponsive = true,
  className,
}: Props) {
  const { enabled } = useAdsEnabled();
  const client = ADSENSE_CLIENT;

  const insRef = useRef<HTMLModElement | null>(null);
  const localId = useId();

  useEffect(() => {
    if (!enabled) return;
    if (!client || !slot) return;

    let cancelled = false;

    (async () => {
      const ok = await ensureAdSenseScript(client);
      if (cancelled || !ok) return;

      const el = insRef.current;
      if (!el) return;

      const status =
        el.getAttribute("data-adsbygoogle-status") ??
        el.getAttribute("data-ad-status") ??
        "";

      // Avoid the common "already have ads in them" error.
      if (status === "done" || status === "filled") return;

      requestAdRender();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, client, slot]);

  if (!enabled || !client || !slot) return null;

  return (
    <ins
      ref={insRef}
      className={["adsbygoogle", className].filter(Boolean).join(" ")}
      style={{ display: "block" }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format={format}
      data-ad-layout={layout}
      data-ad-layout-key={layoutKey}
      data-full-width-responsive={fullWidthResponsive ? "true" : undefined}
      data-adtest={ADSENSE_TEST_MODE ? "on" : undefined}
      data-docspot-ad={localId}
    />
  );
}
