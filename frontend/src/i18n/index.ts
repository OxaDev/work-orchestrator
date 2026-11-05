import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enAgenda from "./en/agenda.json";
import enCommon from "./en/common.json";
import enDirectory from "./en/directory.json";
import enErrors from "./en/errors.json";
import enMissions from "./en/missions.json";
import frAgenda from "./fr/agenda.json";
import frCommon from "./fr/common.json";
import frDirectory from "./fr/directory.json";
import frErrors from "./fr/errors.json";
import frMissions from "./fr/missions.json";

/** EN/FR interface, French by default (ADR-0013). */
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
const STORAGE_KEY = "wo.locale";

export const resources = {
  en: {
    common: enCommon,
    errors: enErrors,
    directory: enDirectory,
    missions: enMissions,
    agenda: enAgenda,
  },
  fr: {
    common: frCommon,
    errors: frErrors,
    directory: frDirectory,
    missions: frMissions,
    agenda: frAgenda,
  },
} as const;

export function isLocale(value: unknown): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

function storedLocale(): Locale {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Switches language and remembers it locally (moved to the user profile in P1). */
export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Storage unavailable (private mode): the choice lasts for the session only.
  }
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLocale(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "errors", "directory", "missions", "agenda"],
  interpolation: { escapeValue: false },
});

export default i18n;
