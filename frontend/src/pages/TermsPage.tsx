import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function TermsPage() {
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
            {t("termsPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("termsPageSubtitle")}
          </p>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Last updated: March 1, 2026
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-200">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                1) Agreement
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                By accessing or using DocSpot.App (the “Service”), you agree to
                these Terms of Service. If you do not agree, do not use the
                Service.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                2) Accounts
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                You may need to sign in (for example, with Google) to use
                certain features. You are responsible for activity that occurs
                under your account and for keeping access to your device and
                account secure.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                3) Your content
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                You retain ownership of documents you upload (“Content”). You
                grant us the limited right to host, store, process, and transmit
                your Content solely to operate and improve the Service.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                4) Acceptable use
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                Do not misuse the Service. You agree not to upload illegal
                content, infringe intellectual property rights, attempt
                unauthorized access, disrupt the Service, or use the Service to
                harm others.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                5) Sharing links
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                If the Service provides sharing links, you are responsible for
                how and with whom you share them. Anyone with access to a valid
                shared link may be able to view the linked content.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                6) Subscriptions and payments
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                If paid features are offered (for example, “Pro”), pricing,
                billing periods, and included features will be shown at checkout
                or in the app. Subscriptions may renew automatically until
                cancelled.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                7) Disclaimers
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                The Service is provided “as is” and “as available.” We do not
                guarantee uninterrupted or error-free operation, and we do not
                provide medical, legal, or financial advice.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                8) Limitation of liability
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                To the maximum extent permitted by law, DocSpot.App will not be
                liable for indirect, incidental, special, consequential, or
                punitive damages, or for loss of data, profits, or revenue.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                9) Changes
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                We may update these Terms from time to time. If changes are
                material, we will make reasonable efforts to provide notice.
                Continued use of the Service after an update means you accept
                the updated Terms.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                10) Contact
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                Questions about these Terms? Contact us at{" "}
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
