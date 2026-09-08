import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { PARTNER_DOOR, STARTING_CONTEXTS } from "@/lib/marketing/public-doors";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/marketing/reveal";
import { Card } from "@/components/ui/Card";

/**
 * STARTING CONTEXTS — not identities (owner window 11 §20).
 *
 * This is the former final-CTA band, and the doors are the SAME five real
 * destinations the registry has always held (`lib/marketing/public-doors.ts`,
 * still route-existence-checked by `lib/guards/global-landing.test.ts`).
 * Three things changed, all of them about what the section SAYS:
 *
 * 1. IT NAMES ITSELF AS A STARTING POINT. The subcopy states outright that
 *    this is not a permanent role and that the same person can look for work,
 *    hire, represent an agency and study on one account. Before, five buttons
 *    reading "Esu darbuotojas / Esu darbdavys / …" asked the visitor to
 *    declare what they ARE before they had used anything — which is precisely
 *    the identity gate §20 exists to remove, and which the product itself
 *    does not impose (IDENTITY ≠ ROLE, SEP-5).
 *
 * 2. PARTNER LEFT THE GRID. It answers a different question — a commercial
 *    relationship with the company — and opens `/about`, not a workspace. It
 *    is still here, as one line with its own framing. Nothing was removed.
 *
 * 3. THE AUDIENCE PAGES ARE RE-OFFERED BY NAME. `/for-workers`,
 *    `/for-companies` and `/for-agencies` left the primary nav in §16 because
 *    the nav was announcing three fixed roles before the visitor read
 *    anything. They belong HERE, where a person is actually choosing, and in
 *    the footer, where they already were.
 *
 * The natural-language entry at the top of the page remains the primary route
 * (§18): this section is the alternative for someone who would rather point at
 * a door than describe a need, never the first thing asked of them.
 */
export async function StartingContextsBand() {
  const [t, tDoors] = await Promise.all([
    getTranslations("landing.contexts"),
    getTranslations("landing.cta"),
  ]);

  return (
    <section className="mt-16" aria-labelledby="starting-contexts-title">
      <Reveal>
        {/* The canonical surface primitive, not the hand-typed border class
            the band it replaces used — visual contract v1, whose ratchet
            exists precisely to stop a new surface repeating that class by
            hand. (The ratchet counts the literal string, comments included,
            so this note names it only by description.) */}
        <Card className="wow-card p-6 sm:p-10">
          <p className="font-mono text-meta uppercase tracking-label text-text-secondary">
            {t("eyebrow")}
          </p>
          <h2
            id="starting-contexts-title"
            className="mt-3 max-w-2xl font-display text-3xl font-bold tracking-tightest text-text-primary sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {t("subcopy")}
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {STARTING_CONTEXTS.map(({ key, href, variant }) => (
              <Link
                key={key}
                href={href}
                data-testid={`final-door-${key}`}
                className={cn(
                  buttonLinkClassName(variant),
                  "w-full rounded-xl transition-transform hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                )}
              >
                {tDoors(key)} →
              </Link>
            ))}
          </div>

          {/* The audience pages the nav no longer names (§16). Quiet, because
              they explain a context rather than start one — but present, and
              labelled with the audience they are about. */}
          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted">
            <span>{t("moreLead")}</span>
            {STARTING_CONTEXTS.filter((c) => c.learnMore).map((c) => (
              <Link
                key={c.key}
                href={c.learnMore as "/for-workers"}
                data-testid={`context-learn-more-${c.key}`}
                className="text-text-secondary underline-offset-4 hover:text-brand-blue hover:underline"
              >
                {tDoors(c.key)}
              </Link>
            ))}
          </p>

          {/* PARTNER — a different question, at its own level (§20). */}
          <p
            data-testid="partner-door-line"
            className="mt-4 border-t border-ink-600 pt-4 text-xs text-text-muted"
          >
            {t("partnerLead")}{" "}
            <Link
              href={PARTNER_DOOR.href as "/about"}
              data-testid="final-door-partner"
              className="text-text-secondary underline-offset-4 hover:text-brand-blue hover:underline"
            >
              {t("partnerLink")}
            </Link>
          </p>
        </Card>
      </Reveal>
    </section>
  );
}
