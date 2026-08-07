import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2, Circle } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { deriveProfileNextAction } from "@/lib/dashboard/next-action";
import { skillEvidenceStatus } from "@/lib/profile/skill-evidence";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { getProfileOpportunitySignal } from "@/lib/player-card/opportunity-signal";
import { countTodayJournalEntries } from "@/lib/player-card/today-activity";
import {
  deriveWorkerReadiness,
  missingReadinessPillars,
  type ReadinessPillarKey,
} from "@/lib/player-card/readiness";
import { countCurrentEngagements } from "@/lib/player-card/work-history-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import {
  buildPlayerCardMinimum,
  type PlayerCardMinimumSource,
} from "@/lib/identity/player-card-minimum";
import { AvatarDisplay } from "@/components/app/avatar-display";
import {
  CvCompletenessGrid,
  type CvSectionCard,
} from "@/components/app/cv-completeness-grid";

/**
 * THE PROFILE HUB — the ONE overview on `/dashboard/profile` (W7-S1).
 *
 * ── WHY THIS COMPONENT ABSORBED FOUR OTHERS ──────────────────────────────
 * The W7 P1-4 inventory measured SIX components on this page all answering
 * "how complete / ready is my profile?", stacked before the first editable
 * field: `ProfileStateStrip` (readiness word + freshness + today's count),
 * `LiveProfileSection` (missing list + work history + evidence line +
 * opportunity signal), `WorkerSetupJourney` (5 steps), `CvCompletenessGrid`
 * (10 CV sections), `SkillsReviewBanner` (unsupported-skill count) and this
 * hub (4 pillars). Together ≈1350 px — a fifth of the desktop page and one and a
 * half mobile screens — with four separate renderings of the SAME
 * `deriveWorkerReadiness` output and three of the same journal counts.
 *
 * This is a consolidation, NOT a removal: every fact and every action those
 * components carried is reachable here. The old→new map is recorded in
 * `docs/audits/W7_S1_PROFILE_HUB_OVERVIEW.md` §5.
 *
 * ── THE SHAPE ────────────────────────────────────────────────────────────
 * One reading order, the same one for every identity:
 *
 *   WHO AM I  →  STATUS  →  WHAT IS MISSING  →  WHAT TO DO NEXT
 *                                              →  (disclosure) WHAT IS DONE
 *
 * Required work is the visible list. Optional improvement (the CV section
 * grid), completed steps, work history, evidence counts, today's activity and
 * the opportunity signal live behind ONE disclosure — present, findable, and
 * not competing with the thing the person still has to do.
 *
 * ── HONESTY (unchanged from every absorbed component) ────────────────────
 *  - No rating. Doctrine §19(a) forbids a global person rating; every number
 *    here answers "how many of what", never "how good is this person".
 *  - Skills are SELF-DECLARED and labelled so.
 *  - Every done-state comes from the ONE canonical readiness model
 *    (`deriveWorkerReadiness`) — never a second computation.
 *  - A read that fails degrades to its empty state, never to an invented one.
 *
 * ── DATA ─────────────────────────────────────────────────────────────────
 * `getWorkerPlayerCard()` is `cache()`d, so the three absorbed components
 * shared one read; this component makes that literal — ONE call site. The
 * only DB round trip it owns is today's journal-entry count, inherited from
 * the state strip.
 *
 * Server component. No client JS of its own, no writes, no new route.
 */

/** The 5 plain-language setup steps, preserved verbatim from the absorbed
 *  `WorkerSetupJourney`: same keys, same copy namespace, same canonical
 *  destinations. A step is done only when its real readiness signal exists. */
type StepKey = "goal" | "experience" | "review" | "location" | "availability";

/** Readiness pillars the 5 steps do NOT cover. Surfaced with the existing
 *  action-wording copy so no missing signal disappears with the old
 *  `LiveProfileSection` missing-list. */
const STEPLESS_PILLARS: readonly ReadinessPillarKey[] = ["journal", "evidence"];

const PILLAR_HREF: Readonly<Record<ReadinessPillarKey, string>> = {
  profession: "#profile-edit",
  skills: "#profile-edit",
  availability: "#cv-availability",
  workCard: "/dashboard?result=player-card",
  journal: "/dashboard/journal",
  evidence: "/dashboard/journal",
};

export async function ProfileHubOverview({
  cvProvided,
  selfDeclaredCount,
  hasWorker,
  skillEvidence,
  cardSource,
  personName,
  avatarUrl,
  cvSections,
  workerId,
}: {
  cvProvided: boolean;
  selfDeclaredCount: number;
  hasWorker: boolean;
  /** Evidence-support summary for workers (journal → skill linkage v1).
   *  Omitted for non-workers (no work-journal access yet). */
  skillEvidence?: { declared: number; supported: number; unsupported: number };
  /** Already-fetched identity fields. When provided, the CV(about) + skills
   *  pillar presence is sourced from the ONE minimum Player Card contract
   *  (`buildPlayerCardMinimum().missing`) — the single source of "what's
   *  missing", so this hub and the player card never disagree. No new
   *  checklist, no percentage. Falls back to the raw booleans when omitted. */
  cardSource?: PlayerCardMinimumSource;
  /** Identity, so the overview can answer "who am I here?" without the reader
   *  scrolling to the avatar editor. Read-only — the editor stays below. */
  personName: string;
  avatarUrl: string | null;
  /** The 10 CV sections with their real filled/empty state, computed by the
   *  page from data it already read. Optional improvement, not required work
   *  — so it lives inside the disclosure. */
  cvSections?: readonly CvSectionCard[];
  /** The worker row id, when the viewer has one. Only used to scope today's
   *  journal-entry count — the same prop the absorbed state strip took. */
  workerId?: string | null;
}) {
  /**
   * W7-S3: seven namespaces and the locale in ONE stage. They were eight
   * consecutive awaits over the same already-loaded bundle — sequential in
   * syntax only, and each one parked the render before the reads below could
   * even be started. `tReview` is the absorbed SkillsReviewBanner's own copy,
   * reused verbatim — the message and destination the worker already knows.
   */
  const [t, tStep, tState, tLive, tAction, tReview, tSkill, locale] =
    await Promise.all([
      getTranslations("profileHub"),
      getTranslations("setupJourney"),
      getTranslations("profileState"),
      getTranslations("playerCard.live"),
      getTranslations("playerCard.readinessSteps.action"),
      getTranslations("skills.reviewBanner"),
      getTranslations("skillNames"),
      getLocale(),
    ]);

  // Consolidation (launch audit §7.3): identity-essential presence flows through
  // the contract's `missing` list, not a parallel ad-hoc computation.
  const card = cardSource ? buildPlayerCardMinimum(cardSource) : null;
  const aboutOk = card ? !card.missing.includes("about") : cvProvided;
  const skillsOk = card
    ? !card.missing.includes("skills")
    : selfDeclaredCount > 0;

  // ONE deterministic next action from real signals (no AI/network/random).
  const nextAction = deriveProfileNextAction({
    cvProvided,
    selfDeclaredCount,
    hasWorker,
    unsupportedSkillCount: skillEvidence?.unsupported ?? 0,
  });
  const journalIsPrimary = nextAction.href === "/dashboard/journal";

  /**
   * ── THE READS (absorbed from three components) ─────────────────────────
   *
   * ONE parallel stage, not three serial awaits. All three are independent:
   * the card and the opportunity signal take no argument, and today's count
   * needs only the `workerId` PROP. Absorbing three sibling components into
   * one would otherwise have SERIALISED reads that React could previously
   * start together — measured as a real TTFB regression before this batch was
   * introduced, which is exactly the trap this slice exists to avoid.
   */
  const [playerCard, signalOrNull, todayCount] = await Promise.all([
    getWorkerPlayerCard(),
    getProfileOpportunitySignal(),
    workerId ? countTodayJournalEntries(workerId) : Promise.resolve(0),
  ]);
  const readiness = playerCard ? deriveWorkerReadiness(playerCard) : null;
  const pillarMet = (key: ReadinessPillarKey): boolean =>
    readiness?.pillars.find((p) => p.key === key)?.met ?? false;

  const steps: Array<{ key: StepKey; done: boolean; href: string }> = playerCard
    ? [
        { key: "goal", done: pillarMet("profession"), href: "#profile-edit" },
        {
          key: "experience",
          // CV import or answering the questions ends in declared skills /
          // journal-backed evidence — the same canonical outcome either way.
          done:
            playerCard.skillsDeclared > 0 ||
            playerCard.journalSupportedSkills > 0,
          href: "#profile-edit",
        },
        // Reviewing "what we found" = confirming the suggestions; confirmed
        // claims are exactly the declared-skills signal. Sourced from the ONE
        // minimum Player Card contract (launch audit §7.3) so this list and
        // the player card can never disagree about what is still missing.
        { key: "review", done: skillsOk, href: "#profile-edit" },
        // The work card carries location + preferred countries; its editor
        // lives inside the player-card result since W3.
        {
          key: "location",
          done: pillarMet("workCard"),
          href: "/dashboard?result=player-card",
        },
        {
          key: "availability",
          done: pillarMet("availability"),
          href: "#cv-availability",
        },
      ]
    : [];
  const doneCount = steps.filter((s) => s.done).length;
  const missingSteps = steps.filter((s) => !s.done);
  const doneSteps = steps.filter((s) => s.done);
  // Completeness is a NAMED list, never a percentage (§19). The canonical
  // helper decides what is missing; this only drops the pillars a plain-
  // language step already covers, so nothing is stated twice.
  const missingStepless = readiness
    ? missingReadinessPillars(readiness).filter((k) =>
        STEPLESS_PILLARS.includes(k),
      )
    : [];
  const nothingMissing =
    steps.length > 0 &&
    missingSteps.length === 0 &&
    missingStepless.length === 0;

  // ── freshness + today's activity (absorbed from ProfileStateStrip) ──────
  const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
  const now = new Date();
  const latest = playerCard?.latestEvidenceAt
    ? new Date(playerCard.latestEvidenceAt)
    : null;
  let freshness = tState("freshness.none");
  if (latest && !Number.isNaN(latest.getTime())) {
    const k = dayKey(latest);
    freshness =
      k === dayKey(now)
        ? tState("freshness.today")
        : k === dayKey(new Date(now.getTime() - 86_400_000))
          ? tState("freshness.yesterday")
          : tState("freshness.onDate", {
              date: latest.toLocaleDateString(locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              }),
            });
  }

  // The opportunity signal only means something for a worker; it was resolved
  // in the batch above (it takes no argument), so gating it here costs nothing.
  const signal = playerCard ? signalOrNull : null;
  const workTypes = buildWorkTypeLabelMap(locale);
  const currentCount = playerCard
    ? countCurrentEngagements(playerCard.workHistory)
    : 0;

  const rowCls =
    "flex min-h-11 items-start gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue";

  /** A step / pillar row. Internal anchors stay <a>; routes use <Link>. */
  const row = (
    key: string,
    testId: string,
    href: string,
    title: string,
    hint: string | null,
    done: boolean,
  ) => {
    const body = (
      <>
        {done ? (
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-state-success"
            aria-hidden
          />
        ) : (
          <Circle
            className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
            aria-hidden
          />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium text-text-primary">{title}</span>
          {hint && (
            <span className="text-xs leading-relaxed text-text-secondary">
              {hint}
            </span>
          )}
        </span>
        {/* Status is never colour-only: the icon carries a shape AND the row
            exposes a machine- and AT-readable state word. */}
        <span className="sr-only">
          {done ? t("state.done") : t("state.todo")}
        </span>
      </>
    );
    return (
      <li key={key}>
        {href.startsWith("#") ? (
          <a
            href={href}
            data-testid={testId}
            data-done={done}
            className={rowCls}
          >
            {body}
          </a>
        ) : (
          <Link
            href={href as "/dashboard"}
            data-testid={testId}
            data-done={done}
            className={rowCls}
          >
            {body}
          </Link>
        )}
      </li>
    );
  };

  return (
    /**
     * `id="setup-journey"` is INHERITED, not decorative: `completeOnboarding`
     * sends every fresh worker to `/dashboard/profile#setup-journey`
     * (lib/auth/actions.ts). The absorbed journey owned that anchor; the hub
     * owns it now, so the deep link still lands on the steps.
     */
    <section
      id="setup-journey"
      className="card-border flex scroll-mt-20 flex-col gap-4 p-5"
      data-testid="profile-hub-overview"
    >
      {/* ── WHO AM I ─────────────────────────────────────────────────────── */}
      <header className="flex items-start gap-3">
        <AvatarDisplay
          signedUrl={avatarUrl}
          displayName={personName}
          alt={personName}
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-display text-lg font-semibold text-text-primary">
            {personName}
          </h2>
          {/* STATUS — one honest state word from the ONE readiness model,
              plus "N of M" so the word is never the only information. */}
          {readiness ? (
            <p
              className="text-sm text-text-secondary"
              data-testid="profile-hub-status"
            >
              <span
                data-status={readiness.level}
                className={
                  readiness.level === "ready"
                    ? "font-medium text-state-success"
                    : "font-medium text-text-primary"
                }
              >
                {tState(`readiness.${readiness.level}`)}
              </span>
              {" · "}
              {tStep("progress", { done: doneCount, total: steps.length })}
              {" · "}
              <span data-testid="profile-hub-freshness">{freshness}</span>
            </p>
          ) : (
            <p className="text-sm text-text-secondary">{t("explainer")}</p>
          )}
        </div>
      </header>

      {/* ── WHAT IS MISSING ──────────────────────────────────────────────── */}
      {steps.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {tLive("missingTitle")}
          </h3>
          {nothingMissing ? (
            <p
              className="text-sm text-text-secondary"
              data-testid="profile-hub-missing-none"
            >
              {tLive("missingNone")}
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              data-testid="profile-hub-missing"
              // Honest, machine-checkable view of the identity-card essentials
              // still missing — sourced from the ONE contract, never a
              // percentage and never a rating.
              data-card-missing={card ? card.missing.join(",") : undefined}
            >
              {missingSteps.map((s, i) =>
                row(
                  s.key,
                  `setup-step-${s.key}`,
                  s.href,
                  `${i + 1}. ${tStep(`steps.${s.key}.title`)}`,
                  tStep(`steps.${s.key}.hint`),
                  false,
                ),
              )}
              {/* Readiness signals with no setup step of their own — the
                  absorbed LiveProfileSection's missing-list, same copy. */}
              {missingStepless.map((k) =>
                row(
                  k,
                  `profile-hub-missing-${k}`,
                  PILLAR_HREF[k],
                  tAction(k),
                  null,
                  false,
                ),
              )}
            </ul>
          )}
          {/* The absorbed SkillsReviewBanner: declared skills not yet backed by
              work evidence. Same real count, same destination, no second card
              and no duplicate "complete your profile" CTA. */}
          {skillEvidence && skillEvidence.unsupported > 0 && (
            <p
              className="text-xs leading-relaxed text-text-secondary"
              data-testid="profile-hub-review-note"
            >
              <span data-testid="profile-hub-review-count">
                {skillEvidence.unsupported}
              </span>{" "}
              — {tReview("body")}{" "}
              <a
                href="#profile-edit"
                className="font-medium text-brand-blue hover:underline"
                data-testid="profile-hub-review-cta"
              >
                {tReview("cta")} ↓
              </a>
            </p>
          )}
        </div>
      )}

      {/* The single honest verification disclaimer for the unified profile. */}
      <p
        className="text-meta leading-relaxed text-text-muted"
        data-testid="profile-hub-not-verified"
      >
        {t("notVerified")}
      </p>

      {/* ── WHAT TO DO NEXT ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* ONE primary next action — contextual, from the deterministic helper. */}
        {journalIsPrimary ? (
          <Link
            href="/dashboard/journal"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="profile-hub-primary-action"
          >
            {t(nextAction.labelKey)} →
          </Link>
        ) : (
          <a
            href="#profile-edit"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="profile-hub-primary-action"
          >
            {t(nextAction.labelKey)} ↓
          </a>
        )}
        {/* Chat-first bridge. Chat is the primary control surface, so the
            profile must not be a dead end: this opens the SAME conversation
            (`/dashboard`) where the person can ask about their profile in
            their own words. Deliberately NOT a seeded-prompt deep link —
            `?result=` is the only deep-link the workspace actually honours,
            and a seeded-prompt query parameter that nothing reads would be a
            control promising behaviour the product does not have. No second
            assistant, no parallel workflow. */}
        <Link
          href="/dashboard"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
          data-testid="profile-hub-ask-workspace"
        >
          {t("askWorkspace")} →
        </Link>
        {/* Secondary bridge to the Work Journal — only when it is NOT already
            the primary action, so there is never a duplicate journal link. */}
        {hasWorker && !journalIsPrimary && (
          <Link
            href="/dashboard/journal"
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-journal-link"
          >
            {t("journalLink")} →
          </Link>
        )}
        {/* The EXISTING CV import path, shown only when no CV text is saved. */}
        {!aboutOk && (
          <a
            href="#profile-edit"
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-cv-import-link"
          >
            {t("cvImportLink")} ↓
          </a>
        )}
        {hasWorker && (
          <Link
            href="/dashboard/opportunities"
            className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-opportunities-link"
          >
            {t("opportunitiesLink")} →
          </Link>
        )}
      </div>

      {/* ── WHAT IS ALREADY DONE (progressive disclosure) ────────────────── */}
      {playerCard && (
        <details className="group rounded-md border border-border-subtle">
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            data-testid="profile-hub-done-summary"
          >
            <span
              aria-hidden
              className="transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {t("doneDisclosure")}
          </summary>
          <div className="flex flex-col gap-5 px-3 pb-4 pt-1">
            {/* completed steps */}
            {doneSteps.length > 0 && (
              <ul
                className="flex flex-col gap-2"
                data-testid="profile-hub-done-steps"
              >
                {doneSteps.map((s) =>
                  row(
                    s.key,
                    `setup-step-${s.key}`,
                    s.href,
                    tStep(`steps.${s.key}.title`),
                    null,
                    true,
                  ),
                )}
              </ul>
            )}

            {/* today's activity — absorbed from ProfileStateStrip */}
            <p
              className="text-sm text-text-secondary"
              data-testid="profile-hub-activity"
            >
              {todayCount > 0
                ? tState("activity.count", { n: todayCount })
                : tState("activity.none")}
            </p>

            {/* where the work happened — absorbed from LiveProfileSection */}
            <div>
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {tLive("historyTitle")}
              </h3>
              {playerCard.workHistory.length === 0 ? (
                <p
                  className="mt-1.5 text-basis text-text-muted"
                  data-testid="live-profile-history-empty"
                >
                  {tLive("historyEmpty")}
                </p>
              ) : (
                <>
                  <ul
                    className="mt-1.5 flex flex-col gap-1"
                    data-testid="live-profile-history"
                  >
                    {playerCard.workHistory.map((e) => (
                      <li key={e.id} className="text-basis text-text-primary">
                        {/* An unknown employer or date renders as an honest gap,
                            not a guess — the model already nulled them. */}
                        <span>{e.organizationName ?? tLive("orgUnknown")}</span>
                        {e.title ? (
                          <span className="text-text-secondary">
                            {" "}
                            — {e.title}
                          </span>
                        ) : null}
                        <span className="text-text-muted">
                          {" "}
                          · {e.startedAt ?? tLive("dateUnknown")}
                          {e.current
                            ? ` · ${tLive("current")}`
                            : e.endedAt
                              ? ` — ${e.endedAt}`
                              : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {currentCount > 0 && (
                    <p className="mt-1 text-meta text-text-muted">
                      {tLive("currentCount", { count: currentCount })}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* what the journal backs — three DISTINCT populations, never
                blended (F9). Absorbed from LiveProfileSection + the hub's own
                evidence block, which stated the same fact twice. */}
            <div>
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {tLive("evidenceTitle")}
              </h3>
              <p
                className="mt-1.5 text-basis text-text-secondary"
                data-testid="live-profile-evidence"
              >
                {tLive("evidenceLine", {
                  declared: playerCard.skillsDeclared,
                  journal: playerCard.journalSupportedSkills,
                  confirmed: playerCard.verifiedSkills.length,
                  entries: playerCard.evidenceEntries,
                })}
              </p>
              {/* Journal → skill evidence-support layer (v1), kept verbatim
                  from the pre-W7-S1 hub. It is NOT the same fact as the line
                  above: that one counts skill POPULATIONS on the card, this
                  one is the stored per-skill provenance from
                  `deriveSkillEvidence`. Honest "supported by work entries" vs
                  "not yet supported" — never a verification claim. */}
              {skillEvidence && skillEvidence.declared > 0 && (
                <div className="mt-2" data-testid="profile-hub-skill-evidence">
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {t("evidence.intro")}
                  </p>
                  <p className="text-xs font-medium text-text-primary">
                    {t("evidence.supported", {
                      supported: skillEvidence.supported,
                      declared: skillEvidence.declared,
                    })}
                  </p>
                  {/* systemic-ux-skills-v1: ONE deterministic status line that
                      always agrees with the count above. */}
                  {(() => {
                    const status = skillEvidenceStatus(skillEvidence);
                    if (!status) return null;
                    return (
                      <p
                        className="text-meta leading-relaxed text-text-muted"
                        data-testid="profile-hub-skill-evidence-status"
                        data-status={status}
                      >
                        {t(`evidence.status_${status}`)}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* the opportunity signal — absorbed from LiveProfileSection */}
            {signal && (
              <div>
                <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {tLive("opportunityTitle")}
                </h3>
                {signal.matchingCount === null ? (
                  <p
                    className="mt-1.5 text-basis text-text-muted"
                    data-testid="live-profile-opportunity-unavailable"
                  >
                    {signal.unavailableReason === "board-unavailable"
                      ? tLive("opportunityUnavailable")
                      : tLive("opportunityNoWorker")}
                  </p>
                ) : (
                  <div data-testid="live-profile-opportunity">
                    <p className="mt-1.5 text-basis text-text-primary">
                      {tLive("opportunityCount", {
                        count: signal.matchingCount,
                      })}
                    </p>
                    {signal.closest && (
                      <>
                        {/* The §19 form: a basis tied to ONE concrete need,
                            with its counts. Never a standalone percentage. */}
                        <p className="mt-1 text-basis text-text-secondary">
                          {tLive("closestBasis", {
                            what:
                              signal.closest.companyName ??
                              (signal.closest.roleSlug
                                ? (workTypes[signal.closest.roleSlug] ??
                                  signal.closest.roleSlug)
                                : tLive("orgUnknown")),
                            matched: signal.closest.matchedSkills,
                            required: signal.closest.requiredSkills,
                            confirmed: signal.closest.confirmedSkills,
                          })}
                        </p>
                        {signal.closest.matchedSkillSlugs.length > 0 && (
                          <ul
                            className="mt-1.5 flex flex-wrap gap-1.5"
                            data-testid="live-profile-matched-skills"
                          >
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
            )}

            {/* OPTIONAL improvement, explicitly separated from the required
                work above: the 10 CV sections, each still linking to its own
                editor. Absorbed from the standalone CvCompletenessGrid. */}
            {cvSections && cvSections.length > 0 && (
              <CvCompletenessGrid sections={[...cvSections]} nested />
            )}
          </div>
        </details>
      )}
    </section>
  );
}
