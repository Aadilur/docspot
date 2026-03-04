import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  ArrowRight,
  Bandage,
  BellRing,
  BriefcaseMedical,
  Check,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Cross,
  Dna,
  FileScan,
  FileSearch,
  FileStack,
  FileText,
  FlaskConical,
  HeartHandshake,
  HeartPulse,
  Hospital,
  Key,
  Microscope,
  Pill,
  PillBottle,
  Receipt,
  Scan,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Syringe,
  Thermometer,
  TestTube,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import Footer from "../components/Footer";
import Header from "../components/Header";
import PricingSection from "../components/PricingSection";
import { getCmsBannersCached } from "../shared/api/cms";
import { listInvoiceGroups } from "../shared/api/invoices";
import { listObjectGroups } from "../shared/api/objects";
import { listPrescriptionGroups } from "../shared/api/prescriptions";
import { listMedicines } from "../shared/api/reminders";
import { useAuthState } from "../shared/firebase/useAuthState";

type CmsBanner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  linkUrl: string | null;
  imageAlt: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  sortOrder: number;
  updatedAt: string;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(Boolean(query.matches));
    sync();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }

    // Safari < 14
    // eslint-disable-next-line deprecation/deprecation
    query.addListener(sync);
    // eslint-disable-next-line deprecation/deprecation
    return () => query.removeListener(sync);
  }, []);

  return reduced;
}

function HeroFeatureTyper({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  const { t } = useTranslation();

  const prefix = String(
    t("heroTyperPrefix", {
      defaultValue: "Main features",
    }),
  );

  const items = useMemo(() => {
    const raw = [
      t("heroTyperP1", { defaultValue: "Prescriptions, organized" }),
      t("heroTyperP2", { defaultValue: "Invoices & receipts, searchable" }),
      t("heroTyperP3", { defaultValue: "Object tracker with notes" }),
      t("heroTyperP4", { defaultValue: "Medication reminders, simplified" }),
    ];

    return raw
      .map((v) => (typeof v === "string" ? v : String(v)))
      .map((v) => v.trim())
      .filter(Boolean);
  }, [t]);

  const [itemIndex, setItemIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [mode, setMode] = useState<"typing" | "pausing" | "deleting">("typing");

  useEffect(() => {
    // Reset animation if the phrase list changes (e.g. language switch).
    setItemIndex(0);
    setCharIndex(0);
    setMode("typing");
  }, [items]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    if (items.length === 0) return;

    const safeIndex =
      ((itemIndex % items.length) + items.length) % items.length;
    const phrase = items[safeIndex] ?? "";
    const clampedCharIndex = Math.max(0, Math.min(charIndex, phrase.length));

    if (clampedCharIndex !== charIndex) {
      setCharIndex(clampedCharIndex);
      return;
    }

    let timeoutId: number | undefined;

    if (mode === "typing") {
      if (charIndex >= phrase.length) {
        timeoutId = window.setTimeout(() => setMode("pausing"), 900);
      } else {
        timeoutId = window.setTimeout(() => setCharIndex((c) => c + 1), 38);
      }
    } else if (mode === "pausing") {
      timeoutId = window.setTimeout(() => setMode("deleting"), 650);
    } else {
      if (charIndex <= 0) {
        timeoutId = window.setTimeout(() => {
          setMode("typing");
          setItemIndex((i) => (i + 1) % items.length);
        }, 160);
      } else {
        timeoutId = window.setTimeout(() => setCharIndex((c) => c - 1), 22);
      }
    }

    return () => {
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [prefersReducedMotion, items, itemIndex, charIndex, mode]);

  const phrase = items.length > 0 ? items[itemIndex % items.length] : "";
  const typed = prefersReducedMotion
    ? (items[0] ?? "")
    : phrase.slice(0, Math.max(0, Math.min(charIndex, phrase.length)));

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200/70 bg-gradient-to-r from-brand-50/70 via-white to-white px-4 py-3 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:from-brand-500/10 dark:via-zinc-950/50 dark:to-zinc-950/50">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
          <Sparkles
            className="h-5 w-5 motion-safe:animate-pulse"
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {prefix}
          </div>

          <div
            aria-hidden="true"
            className="mt-0.5 flex min-h-[1.5rem] items-baseline gap-1 text-base font-semibold text-zinc-900 dark:text-zinc-50"
          >
            <span className="text-brand-700 dark:text-brand-300">
              {typed || "\u00A0"}
            </span>
            {!prefersReducedMotion ? (
              <span
                aria-hidden="true"
                className="inline-block h-5 w-[2px] rounded-full bg-brand-700/70 dark:bg-brand-300/70 motion-safe:animate-pulse"
              />
            ) : null}
          </div>

          <span className="sr-only">
            {prefix}: {items.join(", ")}
          </span>
        </div>
      </div>
    </div>
  );
}

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

type FloatingIconSpec = {
  Icon: LucideIcon;
  top: string;
  left: string;
  size: number;
  className: string;
  dx: number;
  dy: number;
  scale0: number;
  scale1: number;
  op0: number;
  op1: number;
  rot0: number;
  rot1: number;
  duration: number;
  delay: number;
};

function LandingFullScreenBackground({
  prefersReducedMotion,
}: {
  prefersReducedMotion: boolean;
}) {
  const icons = useMemo<FloatingIconSpec[]>(
    () => [
      {
        Icon: Pill,
        top: "12%",
        left: "9%",
        size: 38,
        className: "text-brand-700/25 dark:text-brand-300/12",
        dx: 14,
        dy: -18,
        scale0: 0.9,
        scale1: 1.18,
        op0: 0.07,
        op1: 0.16,
        rot0: -10,
        rot1: 12,
        duration: 26,
        delay: -11,
      },
      {
        Icon: PillBottle,
        top: "18%",
        left: "84%",
        size: 34,
        className: "text-brand-600/25 dark:text-brand-300/12",
        dx: -16,
        dy: 20,
        scale0: 0.85,
        scale1: 1.16,
        op0: 0.06,
        op1: 0.15,
        rot0: 14,
        rot1: -8,
        duration: 30,
        delay: -18,
      },
      {
        Icon: Syringe,
        top: "33%",
        left: "92%",
        size: 30,
        className: "text-brand-700/20 dark:text-brand-300/10 hidden sm:block",
        dx: -18,
        dy: -10,
        scale0: 0.78,
        scale1: 1.12,
        op0: 0.05,
        op1: 0.12,
        rot0: 22,
        rot1: 8,
        duration: 34,
        delay: -7,
      },
      {
        Icon: Bandage,
        top: "62%",
        left: "6%",
        size: 34,
        className: "text-brand-700/18 dark:text-brand-300/10",
        dx: 16,
        dy: 14,
        scale0: 0.8,
        scale1: 1.14,
        op0: 0.06,
        op1: 0.14,
        rot0: -16,
        rot1: 6,
        duration: 28,
        delay: -20,
      },
      {
        Icon: Stethoscope,
        top: "70%",
        left: "88%",
        size: 44,
        className: "text-brand-600/20 dark:text-brand-300/10",
        dx: -12,
        dy: 18,
        scale0: 0.78,
        scale1: 1.1,
        op0: 0.05,
        op1: 0.13,
        rot0: 8,
        rot1: -14,
        duration: 32,
        delay: -15,
      },
      {
        Icon: HeartPulse,
        top: "42%",
        left: "18%",
        size: 42,
        className: "text-brand-700/18 dark:text-brand-300/10",
        dx: 10,
        dy: -20,
        scale0: 0.75,
        scale1: 1.12,
        op0: 0.05,
        op1: 0.13,
        rot0: -6,
        rot1: 10,
        duration: 29,
        delay: -9,
      },
      {
        Icon: Thermometer,
        top: "48%",
        left: "76%",
        size: 30,
        className: "text-brand-700/20 dark:text-brand-300/10",
        dx: -14,
        dy: -16,
        scale0: 0.82,
        scale1: 1.14,
        op0: 0.05,
        op1: 0.12,
        rot0: 18,
        rot1: -10,
        duration: 27,
        delay: -13,
      },
      {
        Icon: Microscope,
        top: "83%",
        left: "58%",
        size: 36,
        className: "text-brand-700/16 dark:text-brand-300/10 hidden sm:block",
        dx: 18,
        dy: -12,
        scale0: 0.78,
        scale1: 1.12,
        op0: 0.04,
        op1: 0.11,
        rot0: -12,
        rot1: 14,
        duration: 35,
        delay: -22,
      },
      {
        Icon: BriefcaseMedical,
        top: "16%",
        left: "56%",
        size: 40,
        className: "text-zinc-900/10 dark:text-zinc-100/6",
        dx: -10,
        dy: 18,
        scale0: 0.7,
        scale1: 1.08,
        op0: 0.05,
        op1: 0.11,
        rot0: 6,
        rot1: -8,
        duration: 33,
        delay: -16,
      },
      {
        Icon: Hospital,
        top: "58%",
        left: "90%",
        size: 34,
        className: "text-zinc-900/10 dark:text-zinc-100/6 hidden sm:block",
        dx: -14,
        dy: -16,
        scale0: 0.72,
        scale1: 1.06,
        op0: 0.04,
        op1: 0.1,
        rot0: -2,
        rot1: 10,
        duration: 31,
        delay: -4,
      },
      {
        Icon: ClipboardPlus,
        top: "78%",
        left: "26%",
        size: 34,
        className: "text-zinc-900/9 dark:text-zinc-100/6",
        dx: 12,
        dy: 20,
        scale0: 0.7,
        scale1: 1.06,
        op0: 0.04,
        op1: 0.1,
        rot0: 10,
        rot1: -12,
        duration: 36,
        delay: -19,
      },
      {
        Icon: Key,
        top: "29%",
        left: "4%",
        size: 32,
        className: "text-brand-700/16 dark:text-brand-300/10",
        dx: 18,
        dy: 12,
        scale0: 0.76,
        scale1: 1.12,
        op0: 0.05,
        op1: 0.12,
        rot0: -18,
        rot1: 10,
        duration: 28,
        delay: -14,
      },
      {
        Icon: Scan,
        top: "8%",
        left: "72%",
        size: 28,
        className: "text-brand-700/16 dark:text-brand-300/10 hidden sm:block",
        dx: -12,
        dy: 16,
        scale0: 0.78,
        scale1: 1.14,
        op0: 0.04,
        op1: 0.1,
        rot0: 16,
        rot1: -8,
        duration: 37,
        delay: -26,
      },
      {
        Icon: FileText,
        top: "86%",
        left: "88%",
        size: 30,
        className: "text-brand-700/14 dark:text-brand-300/10",
        dx: -18,
        dy: -18,
        scale0: 0.74,
        scale1: 1.1,
        op0: 0.04,
        op1: 0.1,
        rot0: 8,
        rot1: -10,
        duration: 34,
        delay: -9,
      },
      {
        Icon: Receipt,
        top: "6%",
        left: "24%",
        size: 32,
        className: "text-brand-700/14 dark:text-brand-300/10",
        dx: 14,
        dy: 16,
        scale0: 0.72,
        scale1: 1.08,
        op0: 0.04,
        op1: 0.1,
        rot0: -6,
        rot1: 12,
        duration: 35,
        delay: -28,
      },
      {
        Icon: TestTube,
        top: "10%",
        left: "46%",
        size: 28,
        className: "text-zinc-900/9 dark:text-zinc-100/6 hidden sm:block",
        dx: 14,
        dy: -14,
        scale0: 0.74,
        scale1: 1.08,
        op0: 0.04,
        op1: 0.1,
        rot0: -8,
        rot1: 12,
        duration: 38,
        delay: -23,
      },
      {
        Icon: FlaskConical,
        top: "64%",
        left: "38%",
        size: 36,
        className: "text-brand-700/14 dark:text-brand-300/10 hidden sm:block",
        dx: -18,
        dy: 16,
        scale0: 0.72,
        scale1: 1.1,
        op0: 0.04,
        op1: 0.1,
        rot0: 14,
        rot1: -10,
        duration: 33,
        delay: -12,
      },
      {
        Icon: Dna,
        top: "40%",
        left: "50%",
        size: 34,
        className: "text-zinc-900/8 dark:text-zinc-100/6",
        dx: 12,
        dy: 20,
        scale0: 0.7,
        scale1: 1.08,
        op0: 0.04,
        op1: 0.1,
        rot0: -14,
        rot1: 8,
        duration: 31,
        delay: -6,
      },
      {
        Icon: Cross,
        top: "24%",
        left: "66%",
        size: 30,
        className: "text-brand-700/16 dark:text-brand-300/10",
        dx: -14,
        dy: -18,
        scale0: 0.76,
        scale1: 1.12,
        op0: 0.04,
        op1: 0.11,
        rot0: 10,
        rot1: -16,
        duration: 29,
        delay: -17,
      },
      {
        Icon: FileScan,
        top: "22%",
        left: "38%",
        size: 28,
        className: "text-brand-700/14 dark:text-brand-300/10",
        dx: 18,
        dy: -10,
        scale0: 0.78,
        scale1: 1.14,
        op0: 0.03,
        op1: 0.09,
        rot0: -12,
        rot1: 14,
        duration: 34,
        delay: -21,
      },
      {
        Icon: FileSearch,
        top: "36%",
        left: "82%",
        size: 30,
        className: "text-zinc-900/8 dark:text-zinc-100/6 hidden sm:block",
        dx: -16,
        dy: 18,
        scale0: 0.72,
        scale1: 1.08,
        op0: 0.03,
        op1: 0.09,
        rot0: 12,
        rot1: -8,
        duration: 36,
        delay: -14,
      },
      {
        Icon: FileStack,
        top: "80%",
        left: "74%",
        size: 32,
        className: "text-brand-700/12 dark:text-brand-300/10 hidden sm:block",
        dx: -12,
        dy: -14,
        scale0: 0.72,
        scale1: 1.08,
        op0: 0.03,
        op1: 0.08,
        rot0: 6,
        rot1: -12,
        duration: 35,
        delay: -8,
      },
      {
        Icon: ClipboardCheck,
        top: "90%",
        left: "12%",
        size: 32,
        className: "text-zinc-900/8 dark:text-zinc-100/6 hidden sm:block",
        dx: 16,
        dy: -12,
        scale0: 0.7,
        scale1: 1.06,
        op0: 0.03,
        op1: 0.09,
        rot0: -10,
        rot1: 12,
        duration: 37,
        delay: -25,
      },
      {
        Icon: ClipboardList,
        top: "54%",
        left: "58%",
        size: 30,
        className: "text-brand-700/12 dark:text-brand-300/10 hidden sm:block",
        dx: -10,
        dy: 16,
        scale0: 0.74,
        scale1: 1.1,
        op0: 0.03,
        op1: 0.09,
        rot0: 8,
        rot1: -10,
        duration: 32,
        delay: -10,
      },
      {
        Icon: HeartHandshake,
        top: "60%",
        left: "72%",
        size: 34,
        className: "text-zinc-900/9 dark:text-zinc-100/6",
        dx: 10,
        dy: -18,
        scale0: 0.74,
        scale1: 1.1,
        op0: 0.04,
        op1: 0.1,
        rot0: -6,
        rot1: 10,
        duration: 28,
        delay: -5,
      },
    ],
    [],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute -top-28 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-brand-400/8 blur-3xl motion-safe:animate-[pulse_7s_ease-in-out_infinite] dark:bg-brand-500/4" />
      <div className="absolute -right-24 top-28 h-72 w-72 rounded-full bg-brand-300/25 blur-3xl motion-safe:animate-[pulse_8s_ease-in-out_infinite] dark:bg-brand-500/10" />
      <div className="absolute -left-24 bottom-8 h-72 w-72 rounded-full bg-brand-500/10 blur-3xl motion-safe:animate-[pulse_9s_ease-in-out_infinite] dark:bg-brand-400/10" />

      <div className="absolute inset-0">
        {icons.map((item, idx) => {
          const style: CSSVarStyle = {
            top: item.top,
            left: item.left,
            width: `${item.size}px`,
            height: `${item.size}px`,
            willChange: "transform, opacity",
            opacity: item.op0,
            transform: `translate3d(0px, 0px, 0) scale(${item.scale0}) rotate(${item.rot0}deg)`,
            "--ds-x0": "0px",
            "--ds-y0": "0px",
            "--ds-x1": `${item.dx}px`,
            "--ds-y1": `${item.dy}px`,
            "--ds-scale0": item.scale0,
            "--ds-scale1": item.scale1,
            "--ds-op0": item.op0,
            "--ds-op1": item.op1,
            "--ds-rot0": `${item.rot0}deg`,
            "--ds-rot1": `${item.rot1}deg`,
            animation: prefersReducedMotion
              ? undefined
              : `ds-float ${item.duration}s ease-in-out ${item.delay}s infinite`,
          };

          return (
            <span
              key={idx}
              className={`absolute ${item.className}`}
              style={style}
            >
              <item.Icon
                className="h-full w-full"
                aria-hidden="true"
                strokeWidth={1.6}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();
  const prefersReducedMotion = usePrefersReducedMotion();

  const { configured, loading: authLoading, user } = useAuthState();
  const canUseCounts = configured && !authLoading && !!user;

  const [serviceCountsLoading, setServiceCountsLoading] = useState(false);
  const [serviceCounts, setServiceCounts] = useState<{
    prescriptions: { count: number | null; more: boolean };
    invoices: { count: number | null; more: boolean };
    otherDocs: { count: number | null; more: boolean };
    reminders: { count: number | null; more: boolean };
  } | null>(null);

  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [banners, setBanners] = useState<CmsBanner[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (cancelled) return;
        const next = await getCmsBannersCached();
        setBanners(next);
      } catch {
        if (cancelled) return;
        setBanners([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!canUseCounts) {
      setServiceCounts(null);
      return () => {
        cancelled = true;
      };
    }

    setServiceCountsLoading(true);

    (async () => {
      const LIMIT = 101;

      const [p, i, o, r] = await Promise.allSettled([
        listPrescriptionGroups({ limit: LIMIT, offset: 0 }),
        listInvoiceGroups({ limit: LIMIT, offset: 0 }),
        listObjectGroups({ limit: LIMIT, offset: 0 }),
        listMedicines({ limit: LIMIT, offset: 0, includeArchived: false }),
      ]);

      const toCount = (
        result: PromiseFulfilledResult<any[]> | PromiseRejectedResult,
      ): { count: number | null; more: boolean } => {
        if (result.status !== "fulfilled") return { count: null, more: false };
        const arr = Array.isArray(result.value) ? result.value : [];
        const more = arr.length >= LIMIT;
        return { count: more ? LIMIT - 1 : arr.length, more };
      };

      const next = {
        prescriptions: toCount(p),
        invoices: toCount(i),
        otherDocs: toCount(o),
        reminders: toCount(r),
      };

      if (cancelled) return;
      setServiceCounts(next);
    })()
      .catch(() => {
        if (cancelled) return;
        setServiceCounts(null);
      })
      .finally(() => {
        if (cancelled) return;
        setServiceCountsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canUseCounts]);

  const formatCountLabel = (key: keyof NonNullable<typeof serviceCounts>) => {
    if (!serviceCounts) return null;
    const v = serviceCounts[key];
    const n = v.count === null ? "—" : `${v.count}${v.more ? "+" : ""}`;
    return `${n} ${t("entries", "entries")}`;
  };

  useEffect(() => {
    if (!getStartedOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGetStartedOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [getStartedOpen]);

  return (
    <div className="relative z-0 min-h-dvh overflow-hidden bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <LandingFullScreenBackground
        prefersReducedMotion={prefersReducedMotion}
      />
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="relative mx-auto w-full max-w-5xl px-3 pb-12 pt-6 sm:px-5 sm:pt-8">
        {/* Banners */}
        {banners.length > 0 && (
          <section
            aria-label={t("bannerTitle", { defaultValue: "Banners" }) as any}
            className="mb-8 grid gap-3"
          >
            {banners.map((banner) => {
              const Wrapper: any = banner.linkUrl ? "a" : "div";
              const wrapperProps = banner.linkUrl
                ? {
                    href: banner.linkUrl,
                    target: "_blank",
                    rel: "noreferrer",
                  }
                : {};

              const alt =
                banner.imageAlt || t("bannerImage", { defaultValue: "Banner" });

              return (
                <Wrapper
                  key={banner.id}
                  {...wrapperProps}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800/70 dark:bg-zinc-950/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900"
                >
                  <div className="relative w-full overflow-hidden bg-zinc-50 dark:bg-zinc-900/40">
                    <div className="relative h-72 w-full sm:h-72">
                      {banner.imageUrl ? (
                        <img
                          src={banner.imageUrl}
                          alt={alt as any}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                          {t("banner", { defaultValue: "Banner" })}
                        </div>
                      )}

                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-zinc-950/35 via-zinc-950/0 to-transparent dark:from-black/55"
                      />

                      {(banner.title || banner.subtitle) && (
                        <div className="absolute inset-x-0 bottom-0 px-3 py-4 sm:p-4">
                          {banner.title && (
                            <div className="text-sm font-semibold text-white">
                              {banner.title}
                            </div>
                          )}
                          {banner.subtitle && (
                            <div className="mt-1 text-xs font-semibold text-white/85">
                              {banner.subtitle}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Wrapper>
              );
            })}
          </section>
        )}

        {/* Hero */}
        <section
          id="home"
          className="relative overflow-hidden rounded-3xl bg-white/70 px-4 py-6 shadow-sm backdrop-blur-sm ring-0 dark:bg-zinc-950/30 sm:border sm:border-zinc-200/70 sm:ring-1 sm:ring-zinc-200/60 dark:sm:border-zinc-800/70 dark:sm:ring-zinc-800/60 sm:p-8"
        >
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            {/* Main (headline + key message) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300">
                {t("brand")}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
                {t("tagline")}
              </h1>
              <p className="mt-3 max-w-2xl text-pretty text-zinc-600 dark:text-zinc-300">
                {t("subtitle")}
              </p>

              {/* Animated main-feature typer (for testing) */}
              <HeroFeatureTyper prefersReducedMotion={prefersReducedMotion} />

              <div className="mt-4 grid gap-2 rounded-2xl bg-white/70 px-3 py-4 text-sm text-zinc-700 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 dark:bg-zinc-950/40 dark:text-zinc-200 dark:ring-zinc-800/60 sm:p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("heroProofTitle", {
                        defaultValue:
                          "Everything you store stays private by default.",
                      })}
                    </div>
                    <div className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("heroProofBody", {
                        defaultValue:
                          "Prescriptions, invoices, and other docs — organized and easy to find when you need them.",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <ShieldCheck className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgePrivate")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <Sparkles className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgeCalm")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-100">
                  <Users className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                  {t("heroBadgeFamily")}
                </span>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => setGetStartedOpen(true)}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 active:translate-y-[1px] motion-reduce:transition-none dark:focus:ring-brand-900 sm:w-auto"
                >
                  {t("ctaPrimary")}
                </button>
                <a
                  href="/about"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 active:translate-y-[1px] motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900 sm:w-auto"
                >
                  {t("ctaSecondary")}
                </a>
              </div>

              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {t("heroFootnote")}
              </p>
            </div>

            {/* Sub-main (quick start + service shortcuts) */}
            <div className="md:pl-2">
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-white/70 via-white/50 to-brand-50/50 px-3 py-4 shadow-sm ring-0 backdrop-blur-sm dark:from-zinc-950/50 dark:via-zinc-950/35 dark:to-brand-500/10 sm:p-6 sm:ring-1 sm:ring-zinc-200/60 dark:sm:ring-zinc-800/60">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("heroQuickStartTitle", {
                        defaultValue: "Start with one thing",
                      })}
                    </div>
                    <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                      {t("heroQuickStartBody", {
                        defaultValue:
                          "Pick a service — DocSpot keeps everything private and organized.",
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setGetStartedOpen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 active:translate-y-[1px] motion-reduce:transition-none dark:focus:ring-brand-900 sm:w-auto"
                  >
                    {t("ctaPrimary")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3">
                  <Link
                    to="/prescription"
                    className="group rounded-2xl bg-white/50 px-3 py-4 ring-0 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:bg-zinc-950/30 dark:hover:bg-zinc-950/45 dark:focus:ring-brand-900 sm:p-4 sm:ring-1 sm:ring-zinc-200/60 sm:hover:ring-zinc-200/80 dark:sm:ring-zinc-800/60 dark:sm:hover:ring-zinc-800/80"
                    aria-label={t("servicePrescriptionTitle")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                        <Pill className="h-5 w-5" aria-hidden="true" />
                      </div>
                      {canUseCounts ? (
                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {serviceCountsLoading
                            ? t("Loading...", "Loading...")
                            : formatCountLabel("prescriptions")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("servicePrescriptionTitle")}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {t("heroQuickPrescription", {
                        defaultValue: "Store prescriptions",
                      })}
                    </div>
                  </Link>

                  <Link
                    to="/invoice"
                    className="group rounded-2xl bg-white/50 px-3 py-4 ring-0 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:bg-zinc-950/30 dark:hover:bg-zinc-950/45 dark:focus:ring-brand-900 sm:p-4 sm:ring-1 sm:ring-zinc-200/60 sm:hover:ring-zinc-200/80 dark:sm:ring-zinc-800/60 dark:sm:hover:ring-zinc-800/80"
                    aria-label={t("serviceDocumentTitle")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                        <Receipt className="h-5 w-5" aria-hidden="true" />
                      </div>
                      {canUseCounts ? (
                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {serviceCountsLoading
                            ? t("Loading...", "Loading...")
                            : formatCountLabel("invoices")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("serviceDocumentTitle")}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {t("heroQuickInvoices", {
                        defaultValue: "Keep receipts & bills",
                      })}
                    </div>
                  </Link>

                  <Link
                    to="/other-doc"
                    className="group rounded-2xl bg-white/50 px-3 py-4 ring-0 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:bg-zinc-950/30 dark:hover:bg-zinc-950/45 dark:focus:ring-brand-900 sm:p-4 sm:ring-1 sm:ring-zinc-200/60 sm:hover:ring-zinc-200/80 dark:sm:ring-zinc-800/60 dark:sm:hover:ring-zinc-800/80"
                    aria-label={t("serviceOtherTitle")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                        <Search className="h-5 w-5" aria-hidden="true" />
                      </div>
                      {canUseCounts ? (
                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {serviceCountsLoading
                            ? t("Loading...", "Loading...")
                            : formatCountLabel("otherDocs")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("serviceOtherTitle")}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {t("heroQuickOther", {
                        defaultValue: "Track where you kept things",
                      })}
                    </div>
                  </Link>

                  <Link
                    to="/reminder"
                    className="group rounded-2xl bg-white/50 px-3 py-4 ring-0 transition-colors hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:bg-zinc-950/30 dark:hover:bg-zinc-950/45 dark:focus:ring-brand-900 sm:p-4 sm:ring-1 sm:ring-zinc-200/60 sm:hover:ring-zinc-200/80 dark:sm:ring-zinc-800/60 dark:sm:hover:ring-zinc-800/80"
                    aria-label={t("serviceReminderTitle") as any}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                        <BellRing className="h-5 w-5" aria-hidden="true" />
                      </div>
                      {canUseCounts ? (
                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {serviceCountsLoading
                            ? t("Loading...", "Loading...")
                            : formatCountLabel("reminders")}
                        </span>
                      ) : (
                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2 py-1 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {t("availableNow")}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("serviceReminderTitle")}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      {t("heroQuickReminders", {
                        defaultValue: "Medication reminders",
                      })}
                    </div>
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini1Title")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini2Title")}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 py-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
                  <Check
                    className="h-4 w-4 text-brand-700 dark:text-brand-300"
                    aria-hidden="true"
                  />
                  {t("heroMini3Title")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* At A Glance */}
        <section id="at-a-glance" className="mt-10 scroll-mt-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {t("atAGlanceTitle", {
                  defaultValue: "What you can do in DocSpot",
                })}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
                {t("atAGlanceBody", {
                  defaultValue:
                    "Four focused tools — each one designed to be fast, calm, and easy for families.",
                })}
              </p>
            </div>

            <a
              href="#how"
              className="hidden rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900 sm:inline-flex"
            >
              {t("seeHowItWorks", { defaultValue: "See how it works" })}
            </a>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Link
              to="/prescription"
              className="group rounded-3xl bg-white/80 p-4 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-zinc-950/60 dark:ring-zinc-800/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900 sm:p-5"
              aria-label={t("servicePrescriptionTitle")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Pill className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                  {t("demoBadge", { defaultValue: "Demo" })}
                </span>
              </div>

              <div className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("servicePrescriptionTitle")}
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {t("demoPrescriptionHint", {
                  defaultValue:
                    "Example groups with reports, attachments, and notes.",
                })}
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoPrescriptionGroup1Title", {
                        defaultValue: "Diabetes",
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoPrescriptionGroup1Meta", {
                        defaultValue: "3 reports • Updated today",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoPrescriptionGroup2Title", {
                        defaultValue: "Allergy",
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoPrescriptionGroup2Meta", {
                        defaultValue: "1 report • Updated Feb 28",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
                {t("openPrescriptions", {
                  defaultValue: "Open prescriptions",
                })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </Link>

            <Link
              to="/invoice"
              className="group rounded-3xl bg-white/80 p-4 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-zinc-950/60 dark:ring-zinc-800/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900 sm:p-5"
              aria-label={t("serviceDocumentTitle")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Receipt className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                  {t("demoBadge", { defaultValue: "Demo" })}
                </span>
              </div>

              <div className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceDocumentTitle")}
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {t("demoInvoiceHint", {
                  defaultValue:
                    "Example receipts and PDFs — grouped and shareable.",
                })}
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <Receipt className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoInvoiceGroup1Title", {
                        defaultValue: "City Hospital",
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoInvoiceGroup1Meta", {
                        defaultValue: "2 receipts • Last: ৳2,450",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <Receipt className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoInvoiceGroup2Title", {
                        defaultValue: "Pharmacy",
                      })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoInvoiceGroup2Meta", {
                        defaultValue: "1 invoice • Last: ৳780",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
                {t("openInvoices", { defaultValue: "Open invoices" })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </Link>

            <Link
              to="/other-doc"
              className="group rounded-3xl bg-white/80 p-4 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-zinc-950/60 dark:ring-zinc-800/60 dark:hover:bg-zinc-950 dark:focus:ring-brand-900 sm:p-5"
              aria-label={t("serviceOtherTitle")}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Search className="h-6 w-6" aria-hidden="true" />
                </span>
                <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                  {t("demoBadge", { defaultValue: "Demo" })}
                </span>
              </div>

              <div className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t("serviceOtherTitle")}
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {t("demoOtherHint", {
                  defaultValue:
                    "Example items with locations, notes, and photos.",
                })}
              </div>

              <div className="mt-4 grid gap-2">
                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoOtherItem1Title", { defaultValue: "Passport" })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoOtherItem1Meta", {
                        defaultValue: "Blue folder • Top drawer",
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-white/60 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800">
                    <FileText className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {t("demoOtherItem2Title", { defaultValue: "Car keys" })}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                      {t("demoOtherItem2Meta", {
                        defaultValue: "Hook near door • Photo attached",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 group-hover:underline dark:text-brand-300">
                {t("openOtherDocs", {
                  defaultValue: "Open object tracker",
                })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </div>
            </Link>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-50 via-white to-white shadow-sm ring-0 dark:from-brand-500/10 dark:via-zinc-950 dark:to-zinc-950 sm:border sm:border-zinc-200/70 sm:ring-1 sm:ring-zinc-200/60 dark:sm:border-zinc-800/70 dark:sm:ring-zinc-800/60">
            <div className="grid gap-6 px-4 py-5 sm:p-6 md:grid-cols-2 md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-100">
                    <BellRing
                      className="h-4 w-4 text-brand-700 dark:text-brand-300"
                      aria-hidden="true"
                    />
                    {t("availableNow")}
                  </span>
                  {canUseCounts ? (
                    <span className="inline-flex items-center rounded-full border border-zinc-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                      {serviceCountsLoading
                        ? t("Loading...", "Loading...")
                        : formatCountLabel("reminders")}
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-4 text-balance text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-xl">
                  {t("reminderShowcaseTitle", {
                    defaultValue: "Medication reminders that feel calm",
                  })}
                </h3>

                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("reminderShowcaseBody", {
                    defaultValue:
                      "Set schedules and track medicines without noisy complexity — built for real life.",
                  })}
                </p>

                <ul className="mt-4 hidden grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-300 sm:grid">
                  {[
                    t("reminderShowcaseB1", {
                      defaultValue: "Set schedules in minutes",
                    }) as any,
                    t("reminderShowcaseB2", {
                      defaultValue: "See what’s due at a glance",
                    }) as any,
                    t("reminderShowcaseB3", {
                      defaultValue: "Designed for caregivers",
                    }) as any,
                  ]
                    .slice(0, 4)
                    .map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">{b}</span>
                      </li>
                    ))}
                </ul>

                <details className="mt-4 rounded-2xl bg-white/60 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60 sm:hidden">
                  <summary className="cursor-pointer list-none select-none text-xs font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                    {t("moreDetails", { defaultValue: "More details" })}
                  </summary>
                  <ul className="mt-3 grid gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    {[
                      t("reminderShowcaseB1", {
                        defaultValue: "Set schedules in minutes",
                      }) as any,
                      t("reminderShowcaseB2", {
                        defaultValue: "See what’s due at a glance",
                      }) as any,
                      t("reminderShowcaseB3", {
                        defaultValue: "Designed for caregivers",
                      }) as any,
                    ].map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">{b}</span>
                      </li>
                    ))}
                  </ul>
                </details>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    to="/reminder"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-300 active:translate-y-[1px] motion-reduce:transition-none dark:focus:ring-brand-900"
                  >
                    {t("openReminders", { defaultValue: "Open reminders" })}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setGetStartedOpen(true)}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 active:translate-y-[1px] motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
                  >
                    {t("ctaPrimary")}
                  </button>
                </div>
              </div>

              <Link
                to="/reminder"
                className="group relative block overflow-hidden rounded-3xl bg-white/60 shadow-sm ring-1 ring-zinc-200/60 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:bg-zinc-950/30 dark:ring-zinc-800/60 dark:hover:bg-zinc-950/45 dark:focus:ring-brand-900"
                aria-label={
                  t("openReminders", { defaultValue: "Open reminders" }) as any
                }
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {t("reminderExampleTitle", {
                          defaultValue: "Example schedule",
                        })}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        {t("reminderExampleBody", {
                          defaultValue:
                            "Set times, then mark doses taken — simple for caregivers.",
                        })}
                      </div>
                    </div>

                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200/70 bg-white/70 px-3 py-1 text-xs font-semibold text-zinc-800 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-100">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-600 dark:bg-brand-400" />
                      {t("availableNow")}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {[
                      {
                        time: t("demoReminderT1", { defaultValue: "08:00" }),
                        title: t("demoReminderM1", {
                          defaultValue: "Vitamin D",
                        }),
                        note: t("demoReminderN1", { defaultValue: "1 tablet" }),
                        status: t("demoReminderS1", { defaultValue: "Due" }),
                        statusClassName:
                          "bg-amber-600/15 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300",
                      },
                      {
                        time: t("demoReminderT2", { defaultValue: "13:00" }),
                        title: t("demoReminderM2", {
                          defaultValue: "Antibiotic",
                        }),
                        note: t("demoReminderN2", {
                          defaultValue: "After lunch",
                        }),
                        status: t("demoReminderS2", { defaultValue: "Taken" }),
                        statusClassName:
                          "bg-green-600/15 text-green-700 dark:bg-green-400/10 dark:text-green-300",
                      },
                    ].map((item) => (
                      <div
                        key={`${item.time}-${item.title}`}
                        className="flex items-start justify-between gap-4 rounded-2xl bg-white/55 px-3 py-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60"
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                            <BellRing className="h-5 w-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                                {item.title}
                              </div>
                              <span
                                className={
                                  "rounded-full px-2 py-0.5 text-xs font-semibold " +
                                  item.statusClassName
                                }
                              >
                                {item.status}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                              {item.note}
                            </div>
                          </div>
                        </div>

                        <span className="rounded-full border border-zinc-200/70 bg-white/70 px-2.5 py-1 text-xs font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                          {item.time}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-2xl bg-white/60 p-3 ring-1 ring-zinc-200/60 dark:bg-zinc-950/30 dark:ring-zinc-800/60">
                    <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      {t("demoCaregiversTitle", {
                        defaultValue: "Caregivers",
                      })}
                    </div>

                    <div className="mt-2 grid gap-2">
                      {[
                        {
                          name: t("demoCaregiver1", {
                            defaultValue: "Ayesha",
                          }),
                          role: t("demoCaregiverRole1", {
                            defaultValue: "View only",
                          }),
                        },
                        {
                          name: t("demoCaregiver2", {
                            defaultValue: "Rahim",
                          }),
                          role: t("demoCaregiverRole2", {
                            defaultValue: "Can edit",
                          }),
                        },
                      ].map((c) => (
                        <div
                          key={`${c.name}-${c.role}`}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200/60 dark:bg-zinc-950/40 dark:text-zinc-200 dark:ring-zinc-800/60"
                        >
                          <span className="min-w-0 truncate">{c.name}</span>
                          <span className="shrink-0 rounded-full border border-zinc-200/70 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-200">
                            {c.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how" className="mt-12 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("howItWorksTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300 hidden sm:block">
            {t("howItWorksBody")}
          </p>

          <ol className="mt-6 grid gap-3">
            {[1, 2, 3].map((n) => (
              <li
                key={n}
                className="flex items-start gap-4 rounded-2xl bg-white/70 px-3 py-4 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 transition-colors hover:bg-white motion-reduce:transition-none dark:bg-zinc-950/40 dark:ring-zinc-800/60 dark:hover:bg-zinc-950 sm:p-4"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-sm font-semibold text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  {n}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {t(`howItWorksStep${n}Title` as any)}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                    {t(`howItWorksStep${n}Body` as any)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* Testimonials */}
        <section id="testimonials" className="mt-12 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("testimonialsTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300 hidden sm:block">
            {t("testimonialsBody")}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <figure
                key={n}
                className="rounded-2xl bg-white/80 px-4 py-5 shadow-sm backdrop-blur-sm ring-1 ring-zinc-200/60 dark:bg-zinc-950/60 dark:ring-zinc-800/60 sm:p-5"
              >
                <blockquote className="text-sm text-zinc-700 dark:text-zinc-200">
                  “{t(`testimonial${n}Quote` as any)}”
                </blockquote>
                <figcaption className="mt-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  — {t(`testimonial${n}Name` as any)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mt-10 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t("faqTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300 hidden sm:block">
            {t("faqBody")}
          </p>

          <div className="mt-6 grid gap-3">
            {[1, 2, 3].map((n) => (
              <details
                key={n}
                className="group rounded-2xl bg-white px-4 py-5 shadow-sm ring-1 ring-zinc-200/60 dark:bg-zinc-950 dark:ring-zinc-800/60 sm:p-5"
              >
                <summary className="cursor-pointer list-none select-none text-sm font-semibold text-zinc-900 dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                  {t(`faqQ${n}` as any)}
                </summary>
                <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  {t(`faqA${n}` as any)}
                </div>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <Footer />

      {/* Get Started Modal */}
      {getStartedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("getStartedModalTitle")}
        >
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => setGetStartedOpen(false)}
            className="absolute inset-0 cursor-default bg-zinc-950/30 backdrop-blur-[2px] dark:bg-black/40"
          />

          <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("getStartedModalTitle")}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  {t("getStartedModalBody")}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGetStartedOpen(false)}
                aria-label={t("close")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link
                to="/prescription"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Pill className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storePrescription")}
                </div>
              </Link>

              <Link
                to="/invoice"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <Receipt className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeInvoice")}
                </div>
              </Link>

              <Link
                to="/other-doc"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeOtherDoc")}
                </div>
              </Link>

              <Link
                to="/reminder"
                onClick={() => setGetStartedOpen(false)}
                className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-brand-200 motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:focus:ring-brand-900"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 ring-1 ring-brand-500/20 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                  <BellRing className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {t("storeReminder")}
                </div>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
