import { ADSENSE_SLOTS } from "./config";
import { NativeAdCard } from "./NativeAdCard";

export function FooterNativeAd() {
  return (
    <NativeAdCard
      slot={ADSENSE_SLOTS.footer}
      minHeightClassName="min-h-[120px]"
    />
  );
}

export function ShareNativeAd() {
  return (
    <NativeAdCard
      slot={ADSENSE_SLOTS.share}
      minHeightClassName="min-h-[160px]"
    />
  );
}

export function FeedNativeAd() {
  return (
    <NativeAdCard
      slot={ADSENSE_SLOTS.feed}
      minHeightClassName="min-h-[180px]"
    />
  );
}

export function ShareGateNativeAd() {
  return (
    <NativeAdCard
      slot={ADSENSE_SLOTS.gate}
      minHeightClassName="min-h-[240px]"
    />
  );
}
