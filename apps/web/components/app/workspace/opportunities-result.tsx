"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { ExternalApplyConfirm } from "@/components/app/external-vacancy-confirm";
import { OpportunitiesShownMarker } from "@/components/app/marketplace/opportunities-shown-marker";
import { FitBandChip } from "@/components/app/opportunities/fit-band-chip";
import { WorkerInterestButton } from "@/components/app/worker-interest-button";
import { useWorldStateOptional } from "@/components/app/world-state/world-state-provider";
import { Button } from "@/components/ui/Button";
import { loadOpportunitiesResultAction } from "@/lib/marketplace/worker-opportunities-actions";
import type {
  InterestLabelBag,
  OpportunitiesResultExternalRow,
  OpportunitiesResultMatch,
  OpportunitiesResultView,
} from "@/lib/marketplace/worker-opportunities-contract";
import type { FitBand } from "@/lib/opportunities/fit-band";
import {
  bandOfStatus,
  countByBand,
  isDiscoveryOnly,
  nonEmptyBands,
  selectReadbackRows,
} from "@/lib/opportunities/opportunities-view";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * THE OPPORTUNITIES RESULT — a SHORT READBACK, not the station.
 *
 * Target IA 2026-09-13 §3: "Conversation results are readbacks. A chat
 * result is a compact answer plus a link to its station. It is not a second
 * rendering of the station." The station is PASAULIS
 * (`/dashboard/opportunities`), which holds every row inside its fit band
 * with its WHY. This result therefore renders:
 *
 *   1. its own heading — the DISCOVERY title when nothing the engine
 *      assessed as a fit is present (#1689, defect H), the fit title
 *      otherwise;
 *   2. ONE sentence of band counts over the rows the use case handed it;
 *   3. at most THREE rows — STRONG first, then POSSIBLE, never any other
 *      band (a `not_assessed` row listed under "find me work" was the
 *      production defect); discovery-only says so in one line instead;
 *   4. ONE pill to the destination.
 *
 * What it used to be — a stacked list of platform rows followed by every
 * external row grouped under five headings — is gone from here on purpose:
 * that was the station rendered inside an overlay.
 *
 * THE FULL STATE SET stays, because a result panel is the one surface where
 * the person is waiting for an answer, and every reason for having no rows
 * is a DIFFERENT fact:
 *
 *   idle · loading · error (RETRY, never a false emptiness) · unavailable
 *   (no demand data can exist yet) · no-worker (nothing to compare against)
 *   · empty (the read worked and found nothing) · partial (rows real, novelty
 *   not trustworthy this render) · ready
 *
 * NOTHING IS COMPUTED HERE. Every value came from a row the canonical use
 * case returned; the band of a platform row is the same derivation the use
 * case applies to an external one (`bandOfStatus` → `deriveFitBand`). No
 * score, no ranking of its own, no `<Link>` and no router — `onOpenFull` is
 * the workspace layer's callback to the destination.
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: OpportunitiesResultView };

/** One readback row — a platform match or a public ad, already banded. */
type ReadbackRow =
  | { readonly kind: "platform"; readonly key: string; readonly band: FitBand; readonly match: OpportunitiesResultMatch }
  | { readonly kind: "external"; readonly key: string; readonly band: FitBand; readonly row: OpportunitiesResultExternalRow };

export function OpportunitiesResult({
  onOpenFull,
}: {
  /** Wired by the workspace layer — the destination this result summarizes. */
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const tFind = useTranslations("conversation.findWork");
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
        <Button variant="pill" onClick={retry} data-testid="opportunities-retry" className="self-start">
          {t("retry")}
        </Button>
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

  // No worker row: matching has no subject yet. The destination still opens,
  // and it is where the person becomes matchable.
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

  if (view.matches.length === 0 && view.external.length === 0) {
    // Honest empty (§18): the read worked, nothing matched — neither a
    // platform demand nor an external public-source ad — and the ONE concrete
    // next step is named rather than implied.
    return (
      <Explained
        testId="opportunities-empty"
        text={t("opportunitiesEmpty")}
        onOpenFull={onOpenFull}
        openLabel={t("openFull")}
      />
    );
  }

  // Every row the use case handed over, banded. A platform match crosses the
  // boundary with its engine status; the band is the same derivation the
  // external rows already carry — nothing here judges.
  const rows: ReadbackRow[] = [
    ...view.matches.map(
      (m): ReadbackRow => ({
        kind: "platform",
        key: `p:${m.requestId}`,
        band: bandOfStatus(m.fitStatus),
        match: m,
      }),
    ),
    ...view.external.map(
      (row): ReadbackRow => ({ kind: "external", key: `x:${row.key}`, band: row.band, row }),
    ),
  ];
  const counts = countByBand(rows);
  const discoveryOnly = isDiscoveryOnly(rows);
  const top = selectReadbackRows(rows, 3);
  // The sentence lists only the bands that hold something — no zeroes.
  const bandsSentence = nonEmptyBands(counts)
    .map((b) => tFind(`band.${b}` as never, { count: counts[b] } as never))
    .join(" · ");

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="opportunities-view"
      data-discovery-only={discoveryOnly ? "true" : undefined}
    >
      {/* The result's OWN heading follows its state: found postings that are
          not yet assessed are never headed "jobs that fit you". */}
      <h3
        className="text-support font-semibold text-text-primary"
        data-testid={discoveryOnly ? "opportunities-discovery-title" : "opportunities-fit-title"}
      >
        {discoveryOnly ? t("opportunities.titleDiscovery") : t("opportunities.title")}
      </h3>

      {/* Rendering IS the read event — and only the rows shown below are
          reported, never the full loaded set. */}
      {top.some((r) => r.kind === "platform") && (
        <OpportunitiesShownMarker
          surface="conversation"
          requestIds={top.map((r) => (r.kind === "platform" ? r.match.requestId : null)).filter((id): id is string => id !== null)}
        />
      )}

      {/* ONE sentence: how many rows, by band. */}
      <p className="text-basis text-text-secondary" data-testid="opportunities-band-counts">
        {t("opportunitiesCounts", { total: rows.length, bands: bandsSentence })}
      </p>

      {/* PARTIAL: the rows are real, the novelty signal is not trustworthy
          this render, and the panel says which of the two is true. */}
      {view.seenDegraded && (
        <p className="text-meta text-state-amber" data-testid="opportunities-partial">
          {t("opportunitiesPartial")}
        </p>
      )}

      {discoveryOnly ? (
        <p className="text-basis text-text-secondary" data-testid="opportunities-discovery-only">
          {t("opportunitiesDiscoveryOnly")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40" data-testid="opportunities-top-rows">
          {top.map((r) =>
            r.kind === "platform" ? (
              <MatchRow
                key={r.key}
                match={r.match}
                band={r.band}
                claimNovelty={!view.seenDegraded}
                interestLabels={view.interestLabels}
              />
            ) : (
              <ExternalRow key={r.key} row={r.row} />
            ),
          )}
        </ul>
      )}

      <Button
        variant="pill"
        onClick={() => onOpenFull("/dashboard/opportunities")}
        data-testid="opportunities-open-full"
        className="self-start"
      >
        {t("openFull")}
      </Button>
    </div>
  );
}

/**
 * Honest fit colouring for the engine's own status word on a platform row.
 * A weak fit painted success-green tells the worker the opposite of what the
 * use case said, so the status drives the colour and nothing else does.
 * (Only strong / possible rows ever reach the readback; the map stays TOTAL
 * so a future caller cannot fall through to a wrong colour.)
 */
const FIT_BADGE: Record<string, string> = {
  strong: "bg-state-success/10 text-state-success",
  possible: "bg-brand-blue/10 text-brand-blue",
  weak: "bg-state-warning/10 text-state-warning",
  insufficient: "bg-ink-700 text-text-muted",
};

/** Status → label key. TOTAL on purpose. */
const FIT_LABEL: Record<string, string> = {
  strong: "fitStrong",
  possible: "fitPossible",
  weak: "fitWeak",
  insufficient: "fitInsufficient",
};

/** Band → the chip word (the same five words the destination uses). */
const BAND_CHIP_LABEL: Record<FitBand, string> = {
  strong: "fitStrong",
  possible: "fitPossible",
  missing_requirement: "fitMissingRequirement",
  conflict: "fitConflict",
  not_assessed: "fitNotAssessed",
};

/** One platform match, compact. Every line is a field from the row; nothing
 *  is derived here. */
function MatchRow({
  match,
  band,
  claimNovelty,
  interestLabels,
}: {
  match: OpportunitiesResultMatch;
  band: FitBand;
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
  const tFind = useTranslations("conversation.findWork");

  const workLabels = buildWorkTypeLabelMap(locale);
  const role =
    (match.roleSlug && workLabels[match.roleSlug]) || tOpp("fieldRoleUnknown");
  // The row names WHO is hiring when the demand carries a company, falling back
  // to the role.
  const heading = match.companyName ?? role;
  const country =
    match.country && tlm.has(`countryNames.${match.country}`)
      ? tlm(`countryNames.${match.country}`)
      : match.country;
  const place = [match.locationLabel, country].filter(Boolean).join(" · ");

  return (
    <li
      className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
      data-testid={`opportunities-row-${match.requestId}`}
      data-selected={selected ? "true" : undefined}
      data-band={band}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* Selecting a match writes World State — it does NOT open a page.
            Outside a World State provider the heading is plain text: a
            control that cannot do anything is never rendered. */}
        {world ? (
          <button
            type="button"
            onClick={() => world.openEntity({ type: "job", id: match.requestId })}
            data-testid="opportunities-match-open"
            aria-pressed={selected}
            className="min-h-11 min-w-0 rounded-sm text-left text-support font-semibold text-text-primary hover:text-brand-blue"
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
            className="rounded-full bg-brand-cyan/15 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted"
            data-testid="opportunities-match-new"
          >
            {tRec("newBadge")}
          </span>
        )}
      </span>

      {place && <span className="text-meta text-text-muted">{place}</span>}

      {/* §19 canonical basis — counts WITH the confirmed share, together,
          always. A bare percentage never renders on this platform. */}
      <span className="text-meta text-text-secondary" data-testid="opportunities-match-basis">
        {tRec("basisCompact", {
          matched: match.basis.matchedTotal,
          total: match.basis.needTotal,
          confirmed: match.basis.matchedConfirmed,
        })}
      </span>

      {/* THE ONE ACTION SURFACE — the SAME canonical control the destination
          renders. Rendered only when the owner-gated interest table exists;
          otherwise the row stays read-only rather than showing a button that
          cannot write. */}
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

/**
 * One EXTERNAL public-source ad, compact: title · band chip · source line ·
 * the original ad behind one confirm. The row's WHY lives on the destination
 * beside every row; a readback row is only ever a STRONG or POSSIBLE fit.
 */
function ExternalRow({ row }: { row: OpportunitiesResultExternalRow }) {
  const tOpp = useTranslations("opportunities");
  const tFind = useTranslations("conversation.findWork");
  return (
    <li
      className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
      data-testid="opportunities-external-row"
      data-band={row.band}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 text-support font-semibold text-text-primary">
          {row.title}
        </span>
        <FitBandChip
          band={row.band}
          label={tFind(BAND_CHIP_LABEL[row.band])}
          testId="opportunities-external-fit"
        />
      </span>
      <span className="text-meta text-text-muted">
        {[row.employerName, row.city, row.country].filter(Boolean).join(" · ")}
        {" · "}
        {tOpp("external.publishedOn", { date: row.publishedAt })}
      </span>
      <span className="text-meta text-text-muted">{row.attributionText}</span>
      {row.originalUrl ? (
        /* Owner decision (V8 addendum §4): inform → confirm → open. Still an
           external link behind one confirm, not internal routing — the
           panel's "no router" rule holds. */
        <ExternalApplyConfirm
          url={row.originalUrl}
          openLabel={tOpp("external.openOriginal")}
          noticeText={tOpp("external.confirmNotice")}
          continueLabel={tOpp("external.confirmContinue")}
          dismissLabel={tOpp("external.confirmDismiss")}
          anchorTestId="opportunities-external-original"
          variant="row"
        />
      ) : (
        <span className="text-meta text-text-muted">
          {tOpp("external.noApplicationRoute")}
        </span>
      )}
    </li>
  );
}

/** A stated reason plus the way to the destination — the shape every
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
      <Button
        variant="pill"
        onClick={() => onOpenFull("/dashboard/opportunities")}
        data-testid="opportunities-open-full"
        className="self-start"
      >
        {openLabel}
      </Button>
    </div>
  );
}
