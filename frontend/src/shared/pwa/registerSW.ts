import { registerSW as _registerSW } from "virtual:pwa-register";

export function registerSW() {
  if (!import.meta.env.PROD) return;

  _registerSW({
    immediate: true,
  });
}
