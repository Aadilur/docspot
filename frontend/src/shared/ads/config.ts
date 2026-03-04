function env(name: string): string {
  const raw = (import.meta.env as Record<string, unknown>)[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function envBool(name: string): boolean {
  const raw = env(name).toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const ADSENSE_CLIENT = env("VITE_ADSENSE_CLIENT");

export const ADSENSE_TEST_MODE = envBool("VITE_ADSENSE_TEST_MODE");

// Google Ad Manager (GAM) rewarded ads (web). Requires GPT.
// Example: /1234567/docspot_rewarded
export const GAM_REWARDED_AD_UNIT_PATH = env("VITE_GAM_REWARDED_AD_UNIT_PATH");

export const ADSENSE_SLOTS = {
  footer: env("VITE_ADSENSE_SLOT_FOOTER"),
  share: env("VITE_ADSENSE_SLOT_SHARE"),
  feed: env("VITE_ADSENSE_SLOT_FEED"),
  gate: env("VITE_ADSENSE_SLOT_GATE"),
} as const;
