import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { signInWithGoogle } from "../shared/firebase/auth";
import { useAuthState } from "../shared/firebase/useAuthState";
import { getMe, type UserRecord } from "../shared/api/users";

export default function PricingSection() {
  const { t } = useTranslation();
  const { user } = useAuthState();
  const [userRecord, setUserRecord] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setUserRecord(null);
      return;
    }

    (async () => {
      try {
        const record = await getMe();
        if (!cancelled) setUserRecord(record);
      } catch {
        if (!cancelled) setUserRecord(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleGetStarted = async () => {
    if (user) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Login failed:", err);
    } finally {
      setBusy(false);
    }
  };

  const isFreeTier = !userRecord || userRecord.userType === "free";
  const isProTier = userRecord?.userType === "paid";

  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-5">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("pricingTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300 mx-auto">
            {t("pricingSubtitle")}
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {/* Free Plan */}
          <div className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30 flex flex-col relative">
            {user && isFreeTier && (
              <div className="absolute -top-3 left-6 inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                {t("pricingCurrentPlan")}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                {t("pricingFreeName")}
              </h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {t("pricingFreeDesc")}
              </p>

              <div className="mt-4">
                <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                  {t("pricingFreePrice")}
                </span>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                  {t("pricingFreePeriod")}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3 flex-1">
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingFreeStorage")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingFreeMedical")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingFreeShare")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingFreeDevices")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingFreeAds")}
                </span>
              </div>
            </div>

            {user ? (
              <Link
                to="/prescription"
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-brand-600 bg-transparent px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-600/5 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:text-brand-300 dark:hover:bg-brand-400/10 dark:focus:ring-brand-900"
              >
                {t("pricingGetStarted")}
              </Link>
            ) : (
              <button
                onClick={handleGetStarted}
                disabled={busy}
                className="mt-6 inline-flex items-center justify-center rounded-xl border border-brand-600 bg-transparent px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-600/5 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50 dark:text-brand-300 dark:hover:bg-brand-400/10 dark:focus:ring-brand-900"
              >
                {busy ? t("loading") : t("login")}
              </button>
            )}
          </div>

          {/* Pro Plan */}
          <div className="rounded-2xl border border-brand-500/40 bg-gradient-to-br from-brand-600/10 to-brand-700/5 p-6 shadow-md backdrop-blur-sm dark:border-brand-400/30 dark:from-brand-400/5 dark:to-brand-500/5 flex flex-col ring-1 ring-brand-500/20 relative">
            {user && isProTier && (
              <div className="absolute -top-3 left-6 inline-flex rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                {t("pricingCurrentPlan")}
              </div>
            )}
            <div className="inline-flex w-fit items-center rounded-full bg-brand-600/15 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
              {t("pricingPopular")}
            </div>

            <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {t("pricingProName")}
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {t("pricingProDesc")}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                  {t("pricingProPriceMonthly")}
                </span>
                <span className="ml-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {t("pricingProPeriodMonthly")}
                </span>
              </div>
              <div className="rounded-lg border border-brand-200/50 bg-brand-50/50 p-3 dark:border-brand-900/30 dark:bg-brand-950/20">
                <div>
                  <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    {t("pricingProPrice6Month")}
                  </span>
                  <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {t("pricingProPeriod6Month")}
                  </span>
                </div>
                <div className="mt-1 inline-flex rounded-full bg-amber-600/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                  {t("pricingSave40")}
                </div>
              </div>
              <div className="rounded-lg border border-green-200/50 bg-green-50/50 p-3 dark:border-green-900/30 dark:bg-green-950/20">
                <div>
                  <span className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                    {t("pricingProPriceAnnual")}
                  </span>
                  <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {t("pricingProPeriodAnnual")}
                  </span>
                </div>
                <div className="mt-1 inline-flex rounded-full bg-green-600/15 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-400/10 dark:text-green-300">
                  {t("pricingSave60")}
                </div>
              </div>
            </div>

            <div className="mt-6 space-y-3 flex-1">
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProStorage")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProMedical")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProNoAds")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProAdvanced")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProSupport")}
                </span>
              </div>
              <div className="flex items-start gap-3">
                <Check className="h-4 w-4 flex-shrink-0 text-brand-600 dark:text-brand-400 mt-0.5" />
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {t("pricingProVersions")}
                </span>
              </div>
            </div>

            {user ? (
              <Link
                to="/pricing"
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 dark:focus:ring-brand-900"
              >
                {isProTier ? t("pricingManage") : t("pricingUpgrade")}
              </Link>
            ) : (
              <button
                onClick={handleGetStarted}
                disabled={busy}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50 dark:focus:ring-brand-900"
              >
                {busy ? t("loading") : t("login")}
              </button>
            )}
          </div>
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {t("pricingCTA")}{" "}
            <Link
              to="/pricing"
              className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {t("viewPricingPage")}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
