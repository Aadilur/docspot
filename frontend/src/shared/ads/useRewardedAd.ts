import { useCallback, useRef } from "react";

import { useAuthState } from "../firebase/useAuthState";
import { useMe } from "../me/MeProvider";

import { GAM_REWARDED_AD_UNIT_PATH } from "./config";
import { ensureGptScript } from "./gpt";

export type RewardedAdResult = {
  status: "skipped" | "shown" | "error";
  granted: boolean;
  reason?: string;
};

let servicesEnabled = false;

async function showRewardedWithGpt(
  adUnitPath: string,
): Promise<RewardedAdResult> {
  const ok = await ensureGptScript();
  if (!ok) {
    return { status: "error", granted: false, reason: "gpt-load-failed" };
  }

  const gt = window.googletag;
  if (!gt || !gt.cmd) {
    return { status: "error", granted: false, reason: "googletag-missing" };
  }

  return await new Promise<RewardedAdResult>((resolve) => {
    let settled = false;

    const finish = (res: RewardedAdResult) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const timeoutMs = 15_000;
    const timeoutId = window.setTimeout(() => {
      finish({ status: "error", granted: false, reason: "timeout" });
    }, timeoutMs);

    gt.cmd.push(() => {
      try {
        const pubads = gt.pubads?.();
        const rewardedEnum = gt.enums?.OutOfPageFormat?.REWARDED;
        const defineOutOfPageSlot = gt.defineOutOfPageSlot;

        if (
          !pubads ||
          !rewardedEnum ||
          typeof defineOutOfPageSlot !== "function"
        ) {
          window.clearTimeout(timeoutId);
          finish({
            status: "error",
            granted: false,
            reason: "rewarded-not-supported",
          });
          return;
        }

        const slot = defineOutOfPageSlot(adUnitPath, rewardedEnum);
        if (!slot) {
          window.clearTimeout(timeoutId);
          finish({
            status: "error",
            granted: false,
            reason: "define-slot-failed",
          });
          return;
        }

        slot.addService(pubads);

        let granted = false;

        const cleanup = () => {
          try {
            pubads.removeEventListener?.("rewardedSlotReady", onReady);
          } catch {
            // ignore
          }
          try {
            pubads.removeEventListener?.("rewardedSlotGranted", onGranted);
          } catch {
            // ignore
          }
          try {
            pubads.removeEventListener?.("rewardedSlotClosed", onClosed);
          } catch {
            // ignore
          }

          try {
            gt.destroySlots?.([slot]);
          } catch {
            // ignore
          }
        };

        const done = (res: RewardedAdResult) => {
          if (settled) return;
          window.clearTimeout(timeoutId);
          cleanup();
          finish(res);
        };

        function onReady(event: any) {
          if (!event || event.slot !== slot) return;
          try {
            event.makeRewardedVisible();
          } catch {
            done({
              status: "error",
              granted: false,
              reason: "make-visible-failed",
            });
          }
        }

        function onGranted(event: any) {
          if (!event || event.slot !== slot) return;
          granted = true;
        }

        function onClosed(event: any) {
          if (!event || event.slot !== slot) return;
          done({ status: "shown", granted });
        }

        pubads.addEventListener("rewardedSlotReady", onReady);
        pubads.addEventListener("rewardedSlotGranted", onGranted);
        pubads.addEventListener("rewardedSlotClosed", onClosed);

        if (!servicesEnabled) {
          try {
            gt.enableServices();
            servicesEnabled = true;
          } catch {
            // ignore
          }
        }

        try {
          gt.display(slot);
        } catch {
          done({ status: "error", granted: false, reason: "display-failed" });
        }
      } catch (e) {
        window.clearTimeout(timeoutId);
        finish({
          status: "error",
          granted: false,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    });
  });
}

export function useRewardedAd(): {
  configured: boolean;
  show: () => Promise<RewardedAdResult>;
} {
  const { loading: authLoading, user } = useAuthState();
  const { me, loading: meLoading } = useMe();

  const adUnitPath = (GAM_REWARDED_AD_UNIT_PATH || "").trim();
  const configured = !!adUnitPath;

  const inFlightRef = useRef<Promise<RewardedAdResult> | null>(null);

  const show = useCallback(async (): Promise<RewardedAdResult> => {
    if (!adUnitPath) {
      return { status: "skipped", granted: false, reason: "not-configured" };
    }

    // Anonymous visitors: treat as free.
    if (!user) return await showRewardedWithGpt(adUnitPath);

    // Logged-in users: only show rewarded ads if we can confirm they're on the free tier.
    if (authLoading || meLoading) {
      return { status: "skipped", granted: false, reason: "loading" };
    }

    if (!me) {
      return { status: "skipped", granted: false, reason: "no-me" };
    }

    if (me.userType !== "free") {
      return { status: "skipped", granted: false, reason: "pro" };
    }

    if (inFlightRef.current) return await inFlightRef.current;

    const p = showRewardedWithGpt(adUnitPath);
    inFlightRef.current = p;

    try {
      return await p;
    } finally {
      if (inFlightRef.current === p) inFlightRef.current = null;
    }
  }, [adUnitPath, user, authLoading, meLoading, me]);

  return { configured, show };
}
