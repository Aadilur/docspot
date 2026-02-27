import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import bnCommon from "./locales/bn/common.json";

const STORAGE_KEY = "docspot_lang";

type SupportedLanguage = "en" | "bn";

function getInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "bn") return stored;

  const preferred = navigator.language.toLowerCase();
  if (preferred.startsWith("bn")) return "bn";
  return "en";
}

export function setLanguage(language: SupportedLanguage) {
  localStorage.setItem(STORAGE_KEY, language);
  void i18n.changeLanguage(language);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon },
    bn: { common: bnCommon },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
