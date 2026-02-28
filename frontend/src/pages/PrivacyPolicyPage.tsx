import { useTranslation } from "react-i18next";

import Footer from "../components/Footer";
import Header from "../components/Header";

export default function PrivacyPolicyPage() {
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
            {t("privacyPolicyPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("privacyPolicyPageSubtitle")}
          </p>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            Last updated: March 1, 2026
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-200">
          <div className="space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                1) What we collect
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                <li>
                  Account info you provide through sign-in (such as your name,
                  email address, and profile photo).
                </li>
                <li>
                  Content you upload to the Service (documents, images, PDFs,
                  and related metadata).
                </li>
                <li>
                  Basic technical information required to operate the Service
                  (for example, browser and device information, IP address, and
                  security logs).
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                2) How we use information
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                <li>Provide, maintain, and improve the Service.</li>
                <li>Authenticate you and prevent abuse or fraud.</li>
                <li>Respond to support requests and communicate with you.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                3) How we share information
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                We do not sell your personal information. We may share
                information with trusted service providers (for example,
                infrastructure and storage providers) only as needed to run the
                Service, and with authorities if required to comply with law.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                4) Security
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                We use reasonable safeguards designed to protect your
                information. No method of transmission or storage is 100%
                secure, so we cannot guarantee absolute security.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                5) Data retention and deletion
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                We keep your information for as long as needed to provide the
                Service. You can request account deletion, and we will take
                reasonable steps to delete or de-identify your information,
                subject to legal and operational requirements.
              </p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                6) Your choices
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-300">
                <li>
                  Access and update basic account information via your profile.
                </li>
                <li>Delete content you upload, subject to product behavior.</li>
                <li>
                  Contact us to request data access or deletion assistance.
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                7) Contact
              </h2>
              <p className="mt-2 text-zinc-600 dark:text-zinc-300">
                Privacy questions? Email{" "}
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
