import { getTranslations } from "next-intl/server";

import { getPublicMarketFacts } from "@/lib/market/public-market-facts-read";
import {
  MIN_ADS_FOR_EXPLANATION,
  marketIsExplainable,
  type MarketCount,
} from "@/lib/market/public-market-facts";
import { createUtcFormatter } from "@/lib/time/display";

import { MarketExplanationRequest } from "./market-explanation-request";

/**
 * MARKET FOR YOUR OCCUPATION — the deterministic panel, and the host of the
 * product's first user-visible AI surface.
 *
 * ── ORDER OF OPERATIONS IS THE DESIGN ──────────────────────────────────────
 *
 * The facts render first and unconditionally. They are exact counts over
 * externally published advertisements, they need no provider, no key and no
 * budget, and on a board with no internal demand rows they are the only real
 * market signal this page can show at all. The AI control sits BELOW them and
 * is optional.
 *
 * That ordering is the honesty claim, made structurally rather than in copy:
 * if the provider is disabled, refused, throttled or out of budget, the
 * section loses a paragraph and keeps everything a worker actually needs.
 *
 * ── WHAT IS SAID OUT LOUD, BECAUSE THE NUMBERS DO NOT SAY IT ──────────────
 *
 * - SOURCE. These are imported public advertisements, not this platform's own
 *   demand rows and not the whole labour market. A count with no stated
 *   population is a claim waiting to be wrong (`market-coverage-claims.ts`
 *   records the day that cost the landing page its credibility).
 * - SCOPE OF THE RANKINGS. Skills and cities are ranked over the most recently
 *   published window, which is the whole population only sometimes. The copy
 *   branches on `rankingWindowCoversAll` rather than glossing it.
 * - PAY. `adsStatingPay` is rendered when it is zero, because "none of these
 *   advertisements states pay" is a genuinely useful market fact and is also
 *   the reason no figure appears anywhere on this panel.
 *
 * ── WHICH OCCUPATION THIS IS ABOUT ────────────────────────────────────────
 *
 * The worker's DECLARED profession, and failing that the one their recorded
 * work evidences (`evidencedProfessionSlug`). The panel used to require the
 * declared field, which made the product's only user-visible AI surface
 * unreachable for the 32 of 36 production workers who never filled it in —
 * a mandatory-profession dependency in the one place it was least defensible.
 * A derived occupation is always labelled as derived; a declared one always
 * wins. Still renders nothing when neither exists (there is no occupation to
 * be about) or when the store is not provisioned.
 */
export async function MarketExplanationPanel({
  professionSlug,
  evidencedProfessionSlug,
  locale,
}: {
  professionSlug: string | null;
  /**
   * The profession the worker's RECORDED WORK evidences, supplied only when
   * they declared none (see `bestEvidencedProfession`). Without it this panel
   * — and with it the product's only user-visible AI surface — did not exist
   * for the 32 of 36 production workers who never filled in a profession,
   * which is precisely the mandatory-profession dependency the product is not
   * supposed to have. When it is used, the panel SAYS it was derived.
   */
  evidencedProfessionSlug?: string | null;
  locale: string;
}) {
  const derived = !professionSlug && Boolean(evidencedProfessionSlug);
  const slug = professionSlug ?? evidencedProfessionSlug ?? null;
  if (!slug) return null;

  const read = await getPublicMarketFacts(slug);
  // `not_provisioned` and `unavailable` both render nothing HERE — this is an
  // additive panel on a page that already works, and an honest empty state for
  // a store that does not exist on this stack would be noise, not information.
  if (read.kind !== "ok") return null;
  const facts = read.facts;

  const t = await getTranslations("marketExplanation");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const dateFmt = createUtcFormatter(locale, { dateStyle: "medium" });

  const professionLabel = tProf.has(slug) ? tProf(slug) : slug;
  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

  return (
    <section
      className="flex flex-col gap-4 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="market-explanation-panel"
      aria-label={t("title", { profession: professionLabel })}
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-secondary">
          {t("title", { profession: professionLabel })}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("source", { measuredAt: dateFmt(facts.measuredAtIso) ?? facts.measuredAtIso })}
        </p>
        {/* WHERE THIS OCCUPATION CAME FROM. Rendered only when the panel
            is standing on a DERIVED profession: the reader is told the
            product read it off their recorded work rather than their
            profile, and how to change it. A derived reading that does not
            announce itself would be the product putting words in
            somebody's mouth. */}
        {derived ? (
          <p
            className="text-xs leading-relaxed text-text-muted"
            data-testid="market-explanation-derived"
          >
            {t("derivedFromWork")}
          </p>
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t("statOpen")} value={String(facts.activeAds)} />
        <Stat label={t("statNew7d")} value={String(facts.newAds7d)} />
        <Stat label={t("statNew30d")} value={String(facts.newAds30d)} />
      </dl>

      {facts.activeAds === 0 ? (
        // Zero is an answer, and it is rendered as one rather than hidden.
        <p className="text-sm leading-relaxed text-text-secondary">
          {t("noneOpen", { profession: professionLabel })}
        </p>
      ) : (
        <>
          <ChipRow
            title={
              facts.rankingWindowCoversAll
                ? t("skillsTitleAll")
                : t("skillsTitleWindow", { window: facts.rankingWindowAds })
            }
            items={facts.topSkills}
            label={skillLabel}
          />
          <ChipRow
            title={
              facts.rankingWindowCoversAll
                ? t("citiesTitleAll")
                : t("citiesTitleWindow", { window: facts.rankingWindowAds })
            }
            items={facts.topCities}
            label={(k) => k}
          />
          {/* Rendered only when it is TRUE that none state pay — never a
              standing disclaimer that would go stale the day one does. */}
          {facts.adsStatingPay === 0 ? (
            <p className="text-xs leading-relaxed text-text-secondary">
              {t("noPayStated")}
            </p>
          ) : null}
        </>
      )}

      {marketIsExplainable(facts) ? (
        <MarketExplanationRequest
          // The RESOLVED occupation, not the declared one — otherwise the AI
          // request would go out with `null` for exactly the workers this
          // panel was just extended to serve, and the surface would render a
          // control that cannot work.
          professionSlug={slug}
          locale={locale}
          labels={{
            cta: t("cta"),
            pending: t("pending"),
            resultTitle: t("resultTitle"),
            attribution: t("attribution"),
            whereTitle: t("whereTitle"),
            skillsTitle: t("aiSkillsTitle"),
            actionsTitle: t("actionsTitle"),
            limitationsTitle: t("limitationsTitle"),
            reviewNote: t("reviewNote"),
            off: {
              not_authenticated: t("offNotAuthenticated"),
              rate_limited: t("offRateLimited"),
              facts_unavailable: t("offFactsUnavailable"),
              market_too_small: t("offMarketTooSmall", { min: MIN_ADS_FOR_EXPLANATION }),
              ai_unavailable: t("offAiUnavailable"),
            },
          }}
        />
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {label}
      </dt>
      <dd className="text-2xl font-bold tracking-tightest text-text-primary">
        {value}
      </dd>
    </div>
  );
}

function ChipRow({
  title,
  items,
  label,
}: {
  title: string;
  items: readonly MarketCount[];
  label: (key: string) => string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-meta uppercase tracking-label text-text-secondary">
        {title}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-1 text-xs text-text-primary"
          >
            {label(item.key)}
            <span className="ml-1 text-text-secondary">{item.ads}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
