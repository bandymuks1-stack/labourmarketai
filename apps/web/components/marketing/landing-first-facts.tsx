import { getTranslations } from "next-intl/server";
import { BadgeEuro, Compass, Users } from "lucide-react";

/**
 * WHO IT IS FOR, WHAT IT COSTS, HOW TO START — three plain facts on the
 * landing's first screen (owner P0 2026-11-13: a new visitor could not tell
 * that this is for every profession and sector, nor what it costs).
 *
 * The price line states only what is true today and is worded like the
 * pricing page: people use it free; an organization runs one active position
 * free. The strings live in `siteNav.facts` — the frozen landing namespaces
 * are not touched.
 */
export async function LandingFirstFacts() {
  const t = await getTranslations("siteNav.facts");
  const facts = [
    { key: "audience", Icon: Users },
    { key: "price", Icon: BadgeEuro },
    { key: "start", Icon: Compass },
  ] as const;
  return (
    <ul
      data-testid="landing-first-facts"
      className="grid min-w-0 gap-x-6 gap-y-2 text-sm leading-snug text-text-secondary sm:grid-cols-3"
    >
      {facts.map(({ key, Icon }) => (
        <li key={key} className="flex min-w-0 items-start gap-2" data-fact={key}>
          <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-blue" />
          <span className="min-w-0">
            <span className="font-semibold text-text-primary">{t(`${key}.title`)}</span>{" "}
            {t(`${key}.body`)}
          </span>
        </li>
      ))}
    </ul>
  );
}
