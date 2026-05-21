import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

// next-intl request config. Messages live in messages/{locale}.json and are
// the single source of every user-facing string (principle §7, no hardcoding).
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Base UI strings + platform taxonomy name files (slug → name), kept in
  // JSON per PLATFORM_DOCTRINE §2 (taxonomy names live in JSON, never in DB).
  const [base, professions, skillNames, journal, relationshipTypes, productivityUnits] =
    await Promise.all([
      import(`../../messages/${locale}.json`),
      import(`../../messages/${locale}/professions.json`),
      import(`../../messages/${locale}/skill-names.json`),
      import(`../../messages/${locale}/journal.json`),
      import(`../../messages/${locale}/relationship-types.json`),
      import(`../../messages/${locale}/productivity-units.json`),
    ]);

  return {
    locale,
    messages: {
      ...base.default,
      professions: professions.default,
      skillNames: skillNames.default,
      journal: journal.default,
      relationshipTypes: relationshipTypes.default,
      productivityUnits: productivityUnits.default,
    },
  };
});
