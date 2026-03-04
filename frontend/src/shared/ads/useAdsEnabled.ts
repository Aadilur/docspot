import { useAuthState } from "../firebase/useAuthState";
import { useMe } from "../me/MeProvider";

import { ADSENSE_CLIENT } from "./config";

export function useAdsEnabled(): {
  enabled: boolean;
  isPro: boolean;
  hasClient: boolean;
} {
  const { loading: authLoading, user } = useAuthState();
  const { me, loading: meLoading } = useMe();

  const hasClient = !!ADSENSE_CLIENT;
  const isPro = me?.userType === "paid";

  if (!hasClient) return { enabled: false, isPro, hasClient };

  // Anonymous visitors: treat as free.
  if (!user) return { enabled: true, isPro: false, hasClient: true };

  // Logged-in users: only show ads if we can confirm they're on the free tier.
  if (authLoading || meLoading)
    return { enabled: false, isPro, hasClient: true };
  if (!me) return { enabled: false, isPro, hasClient: true };

  return { enabled: me.userType === "free", isPro, hasClient: true };
}
