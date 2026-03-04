declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

let scriptPromise: Promise<boolean> | null = null;

export async function ensureAdSenseScript(client: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const trimmed = (client || "").trim();
  if (!trimmed) return false;

  if (scriptPromise) return await scriptPromise;

  // If the AdSense script already exists (e.g. injected in index.html), don't add a duplicate.
  // We can safely resolve true immediately because `requestAdRender()` queues into
  // `window.adsbygoogle` even before the script finishes loading.
  const existingBySrc = document.querySelector(
    'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]',
  ) as HTMLScriptElement | null;
  if (existingBySrc) {
    scriptPromise = Promise.resolve(true);
    return true;
  }

  scriptPromise = new Promise((resolve) => {
    const id = "docspot-adsense";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      resolve(true);
      return;
    }

    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(trimmed)}`;
    s.crossOrigin = "anonymous";

    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);

    document.head.appendChild(s);
  });

  return await scriptPromise;
}

export function requestAdRender(): void {
  if (typeof window === "undefined") return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch {
    // Ignore (ad blockers, StrictMode double-invoke, etc.)
  }
}
