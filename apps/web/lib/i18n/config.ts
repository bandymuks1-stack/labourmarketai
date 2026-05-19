// Active locales for M0. Reserve slots for future markets (NL, DE, PL, RU).
export const locales = ["lt", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "lt";

// Reserved, not active in M0 — see docs/I18N.md before enabling.
export const reservedLocales = ["nl", "de", "pl", "ru"] as const;
