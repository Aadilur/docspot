import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Trash2 } from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";

type DemoOtherDoc = {
  id: string;
  title: string;
  note: string;
  updatedAt: string;
};

export default function OtherDocPage() {
  const { t } = useTranslation();

  const initialItems = useMemo<DemoOtherDoc[]>(
    () => [
      {
        id: "doc-001",
        title: "Passport Scan (Demo)",
        note: "Keep a copy for travel.",
        updatedAt: "2026-02-12",
      },
      {
        id: "doc-002",
        title: "Car Documents (Demo)",
        note: "Renewal reminder later.",
        updatedAt: "2026-01-29",
      },
    ],
    [],
  );

  const [items, setItems] = useState(initialItems);

  return (
    <div className="min-h-dvh">
      <Header />

      <main className="mx-auto w-full max-w-5xl px-5 pb-12 pt-8">
        <section className="rounded-2xl border border-zinc-200/70 bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-zinc-800/70 dark:bg-zinc-950/30">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
            {t("brand")}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
            {t("otherDocPageTitle")}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
            {t("otherDocPageSubtitle")}
          </p>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {t("demoDataTitle")}
            </h2>
            <button
              type="button"
              onClick={() => setItems([])}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
            >
              {t("clearDemo")}
            </button>
          </div>

          {items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-zinc-200/70 bg-white p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950 dark:text-zinc-300">
              {t("noDemoData")}
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950"
                >
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("otherDocMeta", {
                        note: item.note,
                        updatedAt: item.updatedAt,
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => prev.filter((p) => p.id !== item.id))
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                    aria-label={t("remove")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
