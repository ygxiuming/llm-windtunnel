import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../locales/en.json";
import zh from "../../locales/zh-CN.json";

export type Lang = "en" | "zh-CN";

const STORAGE_KEY = "windtunnel.lang";

function detectLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en" || saved === "zh-CN") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zh },
  },
  lng: detectLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.lang = lang;
}
