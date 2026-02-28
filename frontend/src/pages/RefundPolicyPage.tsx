import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function RefundPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("refundPolicyPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("refundPolicyPageSubtitle")}
          </p>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Last updated: March 1, 2026
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-200">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Refunds
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                DocSpot.App does not offer refunds for subscription payments.
                Please review plan details carefully before purchasing.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Cancellations
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                You can cancel a subscription at any time. After cancellation,
                you typically keep access until the end of the current billing
                period, and you will not be charged for the next renewal.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                How to cancel
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                <li>
                  If a “Manage subscription” option is available in your
                  profile, use it to open the subscription management page.
                </li>
                <li>
                  If you cannot access management, email{" "}
                  <a
                    href="mailto:support@docspot.app"
                    className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                  >
                    support@docspot.app
                  </a>{" "}
                  for help.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Contact
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                Billing questions? Contact{" "}
                <a
                  href="mailto:support@docspot.app"
                  className="font-semibold text-brand-700 hover:underline dark:text-brand-300"
                >
                  support@docspot.app
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
