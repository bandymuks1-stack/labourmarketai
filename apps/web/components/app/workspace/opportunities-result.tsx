"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import { useWorldStateOptional } from "@/components/app/world-state/world-state-provider";
import { loadOpportunitiesResultAction } from "@/lib/marketplace/worker-opportunities-actions";
import type {
  InterestLabelBag,
  OpportunitiesResultMatch,
  OpportunitiesResultView,
} from "@/lib/marketplace/worker-opportunities-contract";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * THE OPPORTUNITIES RESULT — W3 row 5, the first genuine ABSORB.
 *
 * "Man tinkantys darbai" was a card on `/dashboard/advanced` with exactly one
 * mount, which made it one of the 15 capabilities that only existed on the
 * second dashboard. Unlike rows 13/15 it had no canonical home to fall back
 * to, so it could not simply die with the route: it had to become a result
 * first. This is that result.
 *
 * NOT A PORT OF THE CARD. The card could render NOTHING when the owner-gated
 * worker-visibility RPC was unapplied — an honest choice for a card in a grid,
 * and an impossible one for a result the person explicitly asked for. Silence
 * would read as "no jobs match you", which is a claim about data that cannot
 * exist yet. So every reason the card had for rendering nothing is a state
 * here, and each says which reason it is.
 *
 * THE FULL STATE SET, because a result panel is the one surface where the
 * person is waiting for an answer:
 *
 *   idle        first paint, before the read is even requested
 *   loading     the read is in flight
 *   error       the action threw — offers RETRY, never a false emptiness
 *   unavailable the gated demand source is unapplied (no data can exist)
 *   no-worker   the caller has no worker row; matching means nothing yet
 *   empty       the read worked and found nothing — the honest empty
 *   partial     rows are real but the seen store read degraded, so novelty is
 *               not claimed this render
 *   ready       rows, each with its complete §19 basis
 *
 * NOTHING IS COMPUTED HERE. Every value rendered came from a row the canonical
 * use case returned. There is no score, no ranking of its own, and no sentence
 * about whether a job is a good idea.
 *
 * NO ROUTING. Like every other result body, this component holds no `<Link>`
 * and no router — `onOpenFull` is the workspace layer's callback to the
 * existing board, which stays reachable throughout (NO REGRESSION).
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: OpportunitiesResultView };

export function OpportunitiesResult({
  onOpenFull,
}: {
  /** Wired by the workspace layer — the board this result summarizes. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Bumping this re-runs the read — that is the whole of RETRY.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadOpportunitiesResultAction()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        // A thrown action is never rendered as emptiness: "we could not read"
        // and "there is nothing" are different answers to the person.
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (phase.kind === "idle" || phase.kind === "loading") {
    return (
      <p
        className="text-basis text-text-muted"
        data-testid="opportunities-loading"
        aria-busy="true"
      >
        {t("pendingInline")}
      </p>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="opportunities-error">
        <p className="text-basis text-text-secondary">{t("opportunitiesError")}</p>
        <PanelButton onClick={retry} testId="opportunities-retry">
          {t("retry")}
        </PanelButton>
      </div>
    );
  }

  const { view } = phase;

  // The gated demand source is unapplied — there is no demand data at all, so
  // "no matches" would be a false claim rather than an empty answer.
  if (view.kind === "unavailable") {
    return (
      <Explained
        testId="opportunities-unavailable"
        text={t("opportunitiesUnavailable")}
        onOpenFull={onOpenFull}
        openLabel={t("openFull")}
      />
    );
  }

  // No worker row: matching has no subject yet. The board still opens, and it
  // is where the person becomes matchable.
  if (view.kind === "no-worker") {
    return (
      <Explained
        testId="opportunities-no-worker"
        text={t("opportunitiesNoWorker")}
        onOpenFull={onOpenFull}
        openLabel={t("openFull")}
      />
    );
  }

  if (view.matches.length === 0) {
    // Honest empty (§18): the read worked, nothing matched, and the ONE
    // concrete next step is named rather than implied.
    return (
      <Explained
        testId="opportunities-empty"
        text={t("opportunitiesEmpty")}
        onOpenFull={onOpenFull}
        openLabel={t("openFull")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="opportunities-view">
      {/* Rendering IS the read event — and only the rows below are reported,
          never the full loaded set. */}
      <OpportunitiesShownMarker
        surface="conversation"
        requestIds={view.matches.map((m) => m.requestId)}
      />

      {/* PARTIAL: the rows are real, the novelty signal is not trustworthy
          this render, and the panel says which of the two is true. */}
      {view.seenDegraded && (
        <p
          className="text-meta text-state-amber"
          data-testid="opportunities-partial"
        >
          {t("opportunitiesPartial")}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border/40">
        {view.matches.map((m) => (
          <MatchRow
            key={m.requestId}
            match={m}
            claimNovelty={!view.seenDegraded}
            interestLabels={view.interestLabels}
          />
        ))}
      </ul>

      {/* Only stated when there genuinely are more than the shown slice. */}
      {view.totalRecommendable > view.matches.length && (
        <p className="text-meta text-text-muted" data-testid="opportunities-more">
          {t("opportunitiesMore", {
            n: view.totalRecommendable - view.matches.length,
          })}
        </p>
      )}

      <PanelButton
        onClick={() => onOpenFull("/dashboard/opportunities")}
        testId="opportunities-open-full"
      >
        {t("openFull")}
      </PanelButton>
    </div>
  );
}

/**
 * Honest fit colouring. Moved here from the thread's deleted card renderer —
 * a weak fit painted success-green tells the worker the opposite of what the
 * use case said, so the status drives the colour and nothing else does.
 */
const FIT_BADGE: Record<string, string> = {
  strong: "bg-state-success/10 text-state-success",
  possible: "bg-brand-blue/10 text-brand-blue",
  weak: "bg-state-warning/10 text-state-warning",
  insufficient: "bg-ink-700 text-text-muted",
};

/** Status → label key. TOTAL on purpose: a `?? "literal"` fallback beside a
 *  KEY-named map reads to the crypto-fallback guard as a published secret, and
 *  a total map is the clearer thing anyway. */
const FIT_LABEL: Record<string, string> = {
  strong: "fitStrong",
  possible: "fitPossible",
  weak: "fitWeak",
  insufficient: "fitInsufficient",
};

/** One match. Every line is a field from the row; nothing is derived here. */
function MatchRow({
  match,
  claimNovelty,
  interestLabels,
}: {
  match: OpportunitiesResultMatch;
  /** False while the seen read is degraded — novelty is then not claimed. */
  claimNovelty: boolean;
  /** Copy for the canonical interest control, resolved ONCE server-side and
   *  carried with the view. `null` = the owner-gated table is absent, so the
   *  row stays read-only rather than showing a button that cannot write. */
  interestLabels: InterestLabelBag | null;
}) {
  const world = useWorldStateOptional();
  const selected =
    world?.state.activeEntity?.type === "job" &&
    world.state.activeEntity.id === match.requestId;
  const locale = useLocale();
  const tRec = useTranslations("opportunities.recommendations");
  const tOpp = useTranslations("opportunities");
  const tlm = useTranslations("labourMarket");
  const tSkill = useTranslations("skillNames");
  const tFind = useTranslations("conversation.findWork");

  const workLabels = buildWorkTypeLabelMap(locale);
  const role =
    (match.roleSlug && workLabels[match.roleSlug]) || tOpp("fieldRoleUnknown");
  // The row names WHO is hiring when the demand carries a company, falling back
  // to the role — the same rule the deleted thread card used.
  const heading = match.companyName ?? role;
  const country =
    match.country && tlm.has(`countryNames.${match.country}`)
      ? tlm(`countryNames.${match.country}`)
      : match.country;
  const start =
    match.startPeriod && tOpp.has(`urgency.${match.startPeriod}`)
      ? tOpp(`urgency.${match.startPeriod}` as never)
      : null;
  const place = [match.locationLabel, country].filter(Boolean).join(" · ");
  const missingShown = match.missingSkillSlugs.slice(0, 2);
  const missingMore = match.missingSkillSlugs.length - missingShown.length;

  return (
    <li
      className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
      data-testid={`opportunities-row-${match.requestId}`}
      data-selected={selected ? "true" : undefined}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Selecting a match writes World State — it does NOT open a page.
            The deleted thread card owned this drill-in; the row inherits it,
            so the job's full facts, requirements and next steps stay one tap
            away in the same panel. Outside a World State provider the heading
            is plain text: a control that cannot do anything is never rendered. */}
        {world ? (
          <button
            type="button"
            onClick={() => world.openEntity({ type: "job", id: match.requestId })}
            data-testid="opportunities-match-open"
            aria-pressed={selected}
            className="min-w-0 rounded-sm text-left text-support font-semibold text-text-primary hover:text-brand-blue"
          >
            {heading}
          </button>
        ) : (
          <span className="text-support font-semibold text-text-primary">{heading}</span>
        )}
        <span
          data-fit-status={match.fitStatus}
          data-testid="opportunities-match-fit"
          className={`flex-none rounded-full px-2 py-0.5 text-meta font-semibold ${
            FIT_BADGE[match.fitStatus] ?? FIT_BADGE.insufficient
          }`}
        >
          {tFind(FIT_LABEL[match.fitStatus] ?? FIT_LABEL.insufficient)}
        </span>
        {claimNovelty && match.isNew && (
          <span
            className="rounded-full bg-brand-cyan/15 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-brand-cyan"
            data-testid="opportunities-match-new"
          >
            {tRec("newBadge")}
          </span>
        )}
        {match.salary === "within" && (
          <span className="rounded-full border border-state-success/40 bg-state-success/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success">
            {tRec("salaryWithin")}
          </span>
        )}
        {match.salary === "negotiable" && (
          <span className="rounded-full border border-state-amber/40 bg-state-amber/10 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-amber">
            {tRec("salaryNegotiable")}
          </span>
        )}
      </span>

      {(place || start) && (
        <span className="text-meta text-text-muted">
          {[place || null, start].filter(Boolean).join(" · ")}
        </span>
      )}

      {/* §19 canonical basis — counts WITH the confirmed share, together,
          always. A bare percentage never renders on this platform. */}
      <span className="text-meta text-text-secondary" data-testid="opportunities-match-basis">
        {tRec("basisCompact", {
          matched: match.basis.matchedTotal,
          total: match.basis.needTotal,
          confirmed: match.basis.matchedConfirmed,
        })}
      </span>

      {missingShown.length > 0 && (
        <span
          className="flex flex-wrap items-center gap-1"
          data-testid="opportunities-match-missing"
        >
          {missingShown.map((slug) => (
            <span
              key={slug}
              className="rounded-md border border-state-amber/30 bg-state-amber/5 px-1.5 py-0.5 text-meta text-state-amber"
            >
              {tOpp("skillMatch.missingPrefix")}{" "}
              {tSkill.has(slug) ? tSkill(slug) : slug}
            </span>
          ))}
          {missingMore > 0 && (
            <span className="text-meta text-text-muted">
              {tRec("moreSkills", { n: missingMore })}
            </span>
          )}
        </span>
      )}

      {/* THE ONE ACTION SURFACE. This is the SAME canonical control the
          opportunities board renders — one interest state machine, one write
          path. It used to be rendered a second time by the chat thread's own
          match card; that renderer is deleted, so this is now the only place
          a person expresses interest from a conversational answer.
          Rendered only when the owner-gated interest table exists; otherwise
          the row stays read-only rather than showing a button that cannot
          write. */}
      {interestLabels && (
        <div className="mt-1.5" data-testid="opportunities-match-interest">
          <WorkerInterestButton
            locale={locale}
            requestId={match.requestId}
            initialStatus={match.interestStatus}
            labels={interestLabels}
          />
        </div>
      )}
    </li>
  );
}

/** A stated reason plus the way to the full board — the shape every
 *  non-row state takes, so no state is a dead end. */
function Explained({
  testId,
  text,
  openLabel,
  onOpenFull,
}: {
  testId: string;
  text: string;
  openLabel: string;
  onOpenFull: (route: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <p className="text-basis text-text-secondary">{text}</p>
      <PanelButton
        onClick={() => onOpenFull("/dashboard/opportunities")}
        testId="opportunities-open-full"
      >
        {openLabel}
      </PanelButton>
    </div>
  );
}

function PanelButton({
  onClick,
  testId,
  children,
}: {
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
    >
      {children}
    </button>
  );
}
