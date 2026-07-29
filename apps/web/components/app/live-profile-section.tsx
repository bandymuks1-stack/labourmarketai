import { getLocale, getTranslations } from "next-intl/server";

import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getProfileOpportunitySignal } from "@/lib/player-card/opportunity-signal";
import {
  deriveWorkerReadiness,
  missingReadinessPillars,
} from "@/lib/player-card/readiness";
import { countCurrentEngagements } from "@/lib/player-card/work-history-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * LIVE PROFILE — the identity, as the product actually knows it (W5 Slice 1).
 *
 * Everything here is a real row or an explicit absence. Four honest sections:
 *
 *   1. what is MISSING — the concrete list, from the canonical readiness
 *      model. Never a percentage and never a "profile strength";
 *   2. WHERE the work happened — real engagements from the canonical
 *      `engagement_contexts` spine (the gap the card had until W5);
 *   3. what the work JOURNAL backs — declared vs journal-supported vs
 *      manager-confirmed skills, three separate populations, never blended;
 *   4. the OPPORTUNITY signal — how many visible opportunities match, and the
 *      §19 basis of the closest one.
 *
 * ── WHY THERE IS NO SCORE ────────────────────────────────────────────────
 * Doctrine §19(a) forbids a global person score outright — `overall_score`,
 * `person_score`, `worker_rating`, `trust_score`, `profile_strength`, OVR. This
 * component renders counts, lists and per-opportunity bases. A number here
 * always answers "how many of what", never "how good is this person".
 *
 * ── NO SECOND MODEL ──────────────────────────────────────────────────────
 * It reads `getWorkerPlayerCard` — the ONE canonical card model the journal
 * page, the premium hub, the state strip and the setup journey already share
 * (request-cached, so this section costs nothing extra) — plus the canonical
 * readiness derivation and the canonical recommendations use case. It computes
 * no counts of its own.
 *
 * Server component. No writes, no routes, no navigation of its own.
 */
export async function LiveProfileSection() {
  const card = await getWorkerPlayerCard();
  if (!card) return null; // no worker profile — the caller renders setup

  const t = await getTranslations("playerCard.live");
  const tSkill = await getTranslations("skillNames");
  // The ACTION wording, not the met-state wording: this list is what is still
  // missing, so "Nurodyti profesiją" is right and "Profesija nurodyta" would
  // state the opposite of the truth. (The met-state subtree is `.pillar`.)
  const tPillar = await getTranslations("playerCard.readinessSteps.action");
  const locale = await getLocale();

  const readiness = deriveWorkerReadiness(card);
  const missing = missingReadinessPillars(readiness);
  const signal = await getProfileOpportunitySignal();
  const workTypes = buildWorkTypeLabelMap(locale);
  const currentCount = countCurrentEngagements(card.workHistory);

  return (
    <section className="flex flex-col gap-6" data-testid="live-profile-section">
      {/* 1 ── what is missing, named ------------------------------------ */}
      <div>
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("missingTitle")}
        </h3>
        {missing.length === 0 ? (
          <p className="mt-1.5 text-basis text-text-secondary" data-testid="live-profile-complete">
            {t("missingNone")}
          </p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="live-profile-missing">
            {missing.map((pillar) => (
              <li
                key={pillar}
                className="rounded-md border border-state-amber/30 bg-state-amber/5 px-2 py-0.5 text-meta text-state-amber"
              >
                {tPillar(pillar)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 2 ── where the work happened ----------------------------------- */}
      <div>
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("historyTitle")}
        </h3>
        {card.workHistory.length === 0 ? (
          <p className="mt-1.5 text-basis text-text-muted" data-testid="live-profile-history-empty">
            {t("historyEmpty")}
          </p>
        ) : (
          <>
            <ul className="mt-1.5 flex flex-col gap-1" data-testid="live-profile-history">
              {card.workHistory.map((e) => (
                <li key={e.id} className="text-basis text-text-primary">
                  {/* An unknown employer or date renders as an honest gap, not
                      as a guess — the model already nulled them. */}
                  <span>{e.organizationName ?? t("orgUnknown")}</span>
                  {e.title ? <span className="text-text-secondary"> — {e.title}</span> : null}
                  <span className="text-text-muted">
                    {" "}
                    · {e.startedAt ?? t("dateUnknown")}
                    {e.current ? ` · ${t("current")}` : e.endedAt ? ` — ${e.endedAt}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {currentCount > 0 && (
              <p className="mt-1 text-meta text-text-muted">
                {t("currentCount", { count: currentCount })}
              </p>
            )}
          </>
        )}
      </div>

      {/* 3 ── what the journal backs ------------------------------------ */}
      <div>
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("evidenceTitle")}
        </h3>
        {/* Three DISTINCT populations, stated separately. Blending them is the
            production defect (F9) the canonical card model exists to prevent. */}
        <p className="mt-1.5 text-basis text-text-secondary" data-testid="live-profile-evidence">
          {t("evidenceLine", {
            declared: card.skillsDeclared,
            journal: card.journalSupportedSkills,
            confirmed: card.verifiedSkills.length,
            entries: card.evidenceEntries,
          })}
        </p>
      </div>

      {/* 4 ── the opportunity signal ------------------------------------ */}
      <div>
        <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("opportunityTitle")}
        </h3>
        {signal.matchingCount === null ? (
          <p className="mt-1.5 text-basis text-text-muted" data-testid="live-profile-opportunity-unavailable">
            {signal.unavailableReason === "board-unavailable"
              ? t("opportunityUnavailable")
              : t("opportunityNoWorker")}
          </p>
        ) : (
          <div data-testid="live-profile-opportunity">
            <p className="mt-1.5 text-basis text-text-primary">
              {t("opportunityCount", { count: signal.matchingCount })}
            </p>
            {signal.closest && (
              <>
                {/* The §19 form: a basis tied to ONE concrete need, with its
                    counts. Never a standalone percentage, never a rating. */}
                <p className="mt-1 text-basis text-text-secondary">
                  {t("closestBasis", {
                    what:
                      signal.closest.companyName ??
                      (signal.closest.roleSlug
                        ? (workTypes[signal.closest.roleSlug] ?? signal.closest.roleSlug)
                        : t("orgUnknown")),
                    matched: signal.closest.matchedSkills,
                    required: signal.closest.requiredSkills,
                    confirmed: signal.closest.confirmedSkills,
                  })}
                </p>
                {signal.closest.matchedSkillSlugs.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="live-profile-matched-skills">
                    {signal.closest.matchedSkillSlugs.map((slug) => (
                      <li
                        key={slug}
                        className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-meta text-state-success"
                      >
                        {tSkill.has(slug) ? tSkill(slug) : slug}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
