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
  onFilledChange?: (filled: boolean | null) => void;
  unfilledTimeoutMs?: number;
};

export function AdSenseSlot({
  slot,
  format = "auto",
  layout,
  layoutKey,
  fullWidthResponsive = true,
  className,
  onFilledChange,
  unfilledTimeoutMs = 6000,
}: Props) {
  const { enabled } = useAdsEnabled();
  const client = ADSENSE_CLIENT;

  const insRef = useRef<HTMLModElement | null>(null);
  const localId = useId();
  const lastFilledRef = useRef<boolean | null>(null);

  useEffect(() => {
    lastFilledRef.current = null;
    onFilledChange?.(null);

    if (!enabled) return;
    if (!client || !slot) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const el = insRef.current;
    if (!el) return;

    const updateFilled = (next: boolean | null) => {
      if (cancelled) return;
      if (lastFilledRef.current === next) return;
      lastFilledRef.current = next;
      onFilledChange?.(next);
    };

    const computeFilled = (): boolean | null => {
      const adStatus = el.getAttribute("data-ad-status");
      if (adStatus === "filled") return true;
      if (adStatus === "unfilled") return false;

      const adsByGoogleStatus = el.getAttribute("data-adsbygoogle-status");

      const hasContent =
        !!el.querySelector("iframe") ||
        el.childElementCount > 0 ||
        el.getBoundingClientRect().height > 0;

      if (hasContent) return true;

      if (adsByGoogleStatus === "done") {
        // AdSense has processed the slot, but there's still no content.
        return false;
      }

      return null;
    };

    const maybeUpdateFromDom = (final: boolean) => {
      const filled = computeFilled();
      if (filled !== null) {
        updateFilled(filled);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        mutationObserver = null;
        resizeObserver = null;
        return;
      }

      if (final) {
        updateFilled(false);
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
        mutationObserver = null;
        resizeObserver = null;
      }
    };

    mutationObserver = new MutationObserver(() => {
      maybeUpdateFromDom(false);
    });
    mutationObserver.observe(el, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-ad-status", "data-adsbygoogle-status"],
    });

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        maybeUpdateFromDom(false);
      });
      resizeObserver.observe(el);
    }

    // Initial best-effort read.
    maybeUpdateFromDom(false);

    timeoutId = window.setTimeout(() => {
      maybeUpdateFromDom(true);
    }, unfilledTimeoutMs);

    (async () => {
      const ok = await ensureAdSenseScript(client);
      if (cancelled) return;
      if (!ok) {
        updateFilled(false);
        return;
      }

      const adsByGoogleStatus =
        el.getAttribute("data-adsbygoogle-status") ?? "";
      const adStatus = el.getAttribute("data-ad-status") ?? "";

      // Avoid the common "already have ads in them" error.
      if (
        adsByGoogleStatus === "done" ||
        adStatus === "filled" ||
        adStatus === "unfilled"
      ) {
        maybeUpdateFromDom(false);
        return;
      }

      requestAdRender();
    })();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [enabled, client, slot, onFilledChange, unfilledTimeoutMs]);

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
