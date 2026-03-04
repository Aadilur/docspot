declare global {
  interface Window {
    googletag?: any;
  }
}

let scriptPromise: Promise<boolean> | null = null;

export async function ensureGptScript(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  window.googletag = window.googletag || { cmd: [] };

  if (scriptPromise) return await scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const id = "docspot-gpt";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      resolve(true);
      return;
    }

    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.src = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";

    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);

    document.head.appendChild(s);
  });

  return await scriptPromise;
}
