import { getTranslations } from "next-intl/server";
import {
  READINESS_SCOPES,
  getCountryReadinessOrNull,
  type ReadinessConfidence,
  type ReadinessRequirement,
  type ReadinessScope,
  type RequirementLevel,
  type RiskLevel,
} from "@/lib/country-readiness";

/**
 * SKL-8 (what a country requires of you) + GEO-3 (mobility) on ONE surface.
 *
 * WHAT WAS DISCONNECTED. `lib/country-readiness/` holds a researched,
 * guard-enforced matrix — 10 countries × 4 scopes × 18 requirements, each with
 * an official source URL and a review date. Exactly one projection of it ever
 * reached a person: `lib/documents/readiness.ts` pulls
 * `matrixRequirementRows(country, "worker_posted")` for the personal document
 * checklist. That is ONE of four scopes, narrowed to rows that map to a
 * document type. The other three scopes — working solo, placing a team as a
 * subcontractor, hiring as a company — and every requirement with no document
 * behind it had no reader at all.
 *
 * WHY HERE AND NOT A NEW ROUTE. The navigation already existed and led
 * nowhere: `lib/answer-engine/chrome.ts` maps the `country-readiness`
 * capability to `/work-abroad`, and `/work-abroad` already links twice to
 * `/labour-market` (one CTA is literally `ctaReadiness`), which links to
 * `/labour-market/[country]` — which then said nothing about requirements.
 * Mounting the matrix on that per-country page completes a chain that was
 * already wired, instead of adding a second destination beside it.
 *
 * HONESTY CONTRACT (doctrine §7, and the same provenance rules as
 * `CountrySignals` beside it). Every statement shows its official source, the
 * date it was last reviewed, and how strongly it is backed. The matrix
 * deliberately marks country-SPECIFIC detail `needs_legal_review` rather than
 * inventing a national rule, and this component renders that marking
 * prominently — a requirement we cannot stand behind must not look like one we
 * can. A country outside the researched set renders an honest absence; it is
 * never filled in from a neighbour.
 */

const LEVEL_TONE: Record<RequirementLevel, string> = {
  required: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  recommended: "border-border-subtle bg-surface-2 text-text-secondary",
  conditional: "border-border-subtle bg-surface-2 text-text-secondary",
};

const RISK_TONE: Record<RiskLevel, string> = {
  high: "text-brand-blue",
  medium: "text-text-secondary",
  low: "text-text-muted",
};

/** The one value that must never read as settled fact. */
function isUnsettled(confidence: ReadinessConfidence): boolean {
  return confidence === "needs_legal_review";
}

export async function CountryReadinessRequirements({
  country,
}: {
  country: string;
}) {
  const t = await getTranslations("countryReadiness");
  const readiness = getCountryReadinessOrNull(country);

  // NO RESEARCHED CONTENT IS NOT "NO REQUIREMENTS". Say which it is.
  if (!readiness) {
    return (
      <section className="mt-12" data-testid="country-readiness-none">
        <h2 className="font-display text-2xl font-bold text-text-primary">
          {t("heading")}
        </h2>
        <p className="mt-4 rounded-card border border-dashed border-border-subtle bg-surface-1 p-4 text-sm leading-relaxed text-text-secondary">
          {t("noResearchYet")}
        </p>
      </section>
    );
  }

  const byScope = READINESS_SCOPES.map((scope) => ({
    scope,
    items: readiness.requirements.filter((r) => r.scope === scope),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="mt-12" data-testid={`country-readiness-${country}`}>
      <h2 className="font-display text-2xl font-bold text-text-primary">
        {t("heading")}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary">
        {t("intro")}
      </p>

      <div className="mt-8 flex flex-col gap-10">
        {byScope.map(({ scope, items }) => (
          <ScopeBlock key={scope} scope={scope} items={items} t={t} />
        ))}
      </div>

      {readiness.nationalPostingInfoUrl ? (
        <p className="mt-8 rounded-card border border-border-subtle bg-surface-1 p-4 text-xs leading-relaxed text-text-secondary">
          {t("nationalInfo")}{" "}
          <a
            href={readiness.nationalPostingInfoUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-brand-blue hover:text-brand-champagne"
          >
            {t("nationalInfoLink")}
          </a>
        </p>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-text-muted">
        {t("disclaimer")}
      </p>
    </section>
  );
}

function ScopeBlock({
  scope,
  items,
  t,
}: {
  scope: ReadinessScope;
  items: readonly ReadinessRequirement[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div data-testid={`country-readiness-scope-${scope}`}>
      <h3 className="font-display text-lg font-semibold text-text-primary">
        {t(`scope.${scope}.label`)}
      </h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
        {t(`scope.${scope}.description`)}
      </p>

      <ul className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map((r) => (
          <li
            key={`${r.scope}:${r.key}`}
            className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-1 p-5"
            data-requirement={r.key}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${LEVEL_TONE[r.level]}`}
              >
                {t(`level.${r.level}`)}
              </span>
              <span
                className={`font-mono text-meta uppercase tracking-label ${RISK_TONE[r.riskLevel]}`}
              >
                {t(`risk.${r.riskLevel}`)}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-text-primary">
              {t(`explanation.${r.explanationKey}`)}
            </p>

            {/* A statement we cannot stand behind is marked BEFORE its source,
                not tucked under it — see the honesty contract above. */}
            {isUnsettled(r.confidence) ? (
              <p
                className="rounded-md border border-dashed border-border-subtle bg-surface-2 p-3 text-xs leading-relaxed text-text-secondary"
                data-testid="requirement-needs-legal-review"
              >
                {t("confidence.needs_legal_review")}
              </p>
            ) : null}

            <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-border-subtle pt-3 text-meta text-text-muted">
              <dt className="font-mono uppercase tracking-label">
                {t("fieldSource")}
              </dt>
              <dd>
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-brand-blue hover:text-brand-champagne"
                >
                  {r.sourceTitle}
                </a>
              </dd>
              <dt className="font-mono uppercase tracking-label">
                {t("fieldConfidence")}
              </dt>
              <dd>{t(`confidenceShort.${r.confidence}`)}</dd>
              <dt className="font-mono uppercase tracking-label">
                {t("fieldLastReviewed")}
              </dt>
              <dd>{r.lastReviewedAt}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
