import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { INTENT_ICONS } from "@/components/layouts/intent-icons";
import { PUBLIC_INTENTS, primaryHref } from "@/lib/navigation/public-intents";

/**
 * THE FIRST SCREEN IS THE CHOICE (owner priority 2026-11-12: a partner did
 * not go deeper because the navigation was not self-evident).
 *
 * Six plainly named cards — the SAME six intents as the header
 * (`lib/navigation/public-intents.ts`) — directly under the promise. Each is
 * one link to the start of that function (the intent's first destination, a
 * real page the intent guard checks). No slogan, no "Start now": the label
 * says what you get.
 *
 * Two columns on a phone, three from `sm`, so all six fit the first screen.
 */
export async function LandingIntentChoice() {
  const t = await getTranslations("siteNav");
  return (
    <nav aria-label={t("trigger")} data-testid="landing-intent-choice">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {PUBLIC_INTENTS.map((intent) => {
          const Icon = INTENT_ICONS[intent.iconKey];
          return (
            <li key={intent.id}>
              <Link
                href={primaryHref(intent)}
                data-testid={`landing-intent-${intent.id}`}
                className="flex h-full min-h-[4.5rem] flex-col justify-between gap-2 rounded-xl border border-ink-600 bg-ink-800/50 p-3 transition-colors hover:border-brand-blue motion-reduce:transition-none sm:p-4"
              >
                <Icon aria-hidden className="h-5 w-5 text-brand-blue" />
                <span className="text-sm font-semibold leading-snug text-text-primary">
                  {t(`intents.${intent.id}.title`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
