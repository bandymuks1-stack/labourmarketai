import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireRoleOrRedirect } from "@/lib/auth/require-role";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { EmployerContextNotice } from "@/components/app/employer-context-notice";
import { listCompanyDemands, runScouting, type ShortlistStatus } from "@/lib/scouting/scouting";
import { anonymizedToken } from "@/lib/scouting/scout-safe-view";
import { anonymizedWorkerLabel } from "@/lib/visibility/worker-profile-visibility";
// Real two-subject bridge (issue #859): candidates a connected agency proposed
// for THIS demand (which the client owns) — reviewed with the SAME canonical
// controls below, keyed on (requestId, workerId).
import { listOfferedCandidatesForRequest } from "@/lib/agency/bridge-read";
import {
  hasActiveScoutFilters,
  parseScoutFilterParams,
  type ScoutFilters,
} from "@/lib/scouting/scout-filters";
import { getScoutingContactRequestStates } from "@/lib/privacy/contact-disclosure-actions";
import { RequestContactDetailsButton } from "@/components/app/request-contact-details-button";
import { ScoutingShortlistButtons } from "@/components/app/scouting-shortlist-buttons";
import { CompanyInterestAck } from "@/components/app/company-interest-ack";
import { DemandLifecycleControls } from "@/components/app/demand-lifecycle-controls";
import { FeatureNote } from "@/components/app/feature-note";
import { RequestCommunicationButton } from "@/components/app/request-communication-button";
import { ProposeBookingButton } from "@/components/app/propose-booking-button";
import type { CompanyCandidateLabel } from "@/lib/scouting/candidate-readiness";
import {
  deriveCandidatePipelineStage,
  nextActionForStage,
  type CandidatePipelineStage,
} from "@/lib/pipeline/candidate-pipeline";
import { loadDemandPipelineFacts } from "@/lib/pipeline/candidate-pipeline-facts";

const READINESS_TONE: Record<CompanyCandidateLabel, string> = {
  can_be_considered: "border-state-success/40 bg-state-success/10 text-state-success",
  limited_information: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  not_enough_information: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/** Visual tone per canonical pipeline stage (derived, never stored — P4). */
const PIPELINE_TONE: Record<CandidatePipelineStage, string> = {
  new: "border-ink-500 bg-ink-800 text-text-secondary",
  reviewing: "border-brand-blue/40 bg-brand-blue/10 text-brand-blue",
  contacted: "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan",
  interview: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  offer: "border-state-warning/40 bg-state-warning/10 text-state-warning",
  accepted: "border-state-success/40 bg-state-success/10 text-state-success",
  rejected: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/** Honest freshness badge tone (Wagon 1) — same buckets as the visual
 *  worker-card activity dot. Dormant is demoted in ranking, never hidden. */
const FRESHNESS_TONE: Record<"active" | "recent" | "dormant", string> = {
  active: "border-state-success/40 bg-state-success/10 text-state-success",
  recent: "border-state-amber/40 bg-state-amber/10 text-state-amber",
  dormant: "border-ink-500 bg-ink-800/40 text-text-muted",
};

/**
 * Company scouting (Step 3B). The company picks one of its OWN structured
 * demands; the deterministic match-v1 engine runs over the employer-discoverable
 * worker supply; ranked candidates show status + the §19 skill-fit basis +
 * why/gaps; the company shortlists.
 *
 * VISIBILITY (Step 3A): every candidate is an anonymized, profile-safe preview
 * (toShortlistSafePreview) — no name, no contact, no bio/profile_text. Contacts
 * stay hidden (no paid unlock). Communication/booking is NOT built here: a
 * transparent status (driven by canStartCommunicationOrBooking) only explains
 * when it could open. Honest empty/needs-structuring states — no fake
 * candidates, no fake scores, no fake verification.
 */

export default async function CompanyScoutingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    request?: string;
    skill?: string;
    country?: string;
    available?: string;
  }>;
}) {
  const { locale } = await params;
  const { request, ...rawFilterParams } = await searchParams;
  // Bounded facet filters (Wagon 1): syntax-validated here, allowlisted
  // against the visible supply inside runScouting — never widening.
  const requestedFilters = parseScoutFilterParams(rawFilterParams);
  setRequestLocale(locale);
  await requireRoleOrRedirect(locale, "company");

  const t = await getTranslations("scouting");

  // W8 slice 1 — ACTING CONTEXT FIRST. Holding the company role gets you onto
  // this route; it does not say which company you are acting for. Without an
  // active company context the page renders its honest state and reads
  // NOTHING, so a personal workspace (or an organization with no company
  // binding) can never be shown another context's demands and candidates.
  const employerContext = await resolveEmployerCompanyContext();
  if (employerContext.kind !== "ok") {
    return (
      <main className="mx-auto flex w-full max-w-content flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
            {t("title")}
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
        </header>
        <EmployerContextNotice
          reason={employerContext.reason}
          activeWorkspaceName={employerContext.activeWorkspaceName}
        />
      </main>
    );
  }
  // Contract-v2 criterion vocabulary is localized ONCE, in the shared
  // opportunities.discovery namespace (same tier explanation both sides see).
  const tCrit = await getTranslations("opportunities.discovery.criterion");
  const criterionLabel = (c: string) => (tCrit.has(c) ? tCrit(c as never) : c);
  // Canonical pipeline labels (P4) — derived stage chips + one next action.
  const tPipe = await getTranslations("candidatePipeline");
  // Localized skill names for the bounded facet chips (Wagon 1).
  const tSkill = await getTranslations("skillNames");
  const demands = await listCompanyDemands();
  // Human-structured demands first; since PR4 an unstructured demand can
  // still match via offline text recognition (honestly labeled below).
  const selected = request ?? demands.find((d) => d.structured)?.id ?? demands[0]?.id ?? null;
  const result = selected ? await runScouting(selected, requestedFilters) : null;
  // Agency-proposed candidates for THIS demand (the caller owns it; the RPC
  // returns rows only to the request owner). Empty until the owner-gated bridge
  // migration is applied.
  const offeredCandidates = selected ? await listOfferedCandidatesForRequest(selected) : [];
  const tOffered = await getTranslations("scoutingAgencyOffers");

  // Contact-detail ask states for THIS demand (Wagon 1) — owner-scoped read;
  // applied:false while the draft-gated model is not applied (honest note,
  // no dead button).
  const contactRequests = selected
    ? await getScoutingContactRequestStates(selected)
    : { applied: false as const, byWorker: {} };

  // Shareable filter links: preserve the selected demand, toggle one facet.
  const filterHref = (next: Partial<ScoutFilters>): string => {
    if (!selected) return `/${locale}/dashboard/company/scouting`;
    const active = result?.kind === "ok" ? result.filters : requestedFilters;
    const merged = { ...active, ...next };
    const params = new URLSearchParams({ request: selected });
    if (merged.skill) params.set("skill", merged.skill);
    if (merged.country) params.set("country", merged.country);
    if (merged.availableNow) params.set("available", "1");
    return `/${locale}/dashboard/company/scouting?${params.toString()}`;
  };

  // The two pipeline facts the scouting result does not already carry:
  // booking status per pair + direct-conversation existence (both real,
  // RLS-scoped reads; absent tables degrade to empty facts — see the
  // candidate-pipeline-facts limitation note).
  const pipelineFacts =
    result?.kind === "ok" && result.candidates.length > 0
      ? await loadDemandPipelineFacts(
          result.demand.id,
          result.candidates.map((c) => c.workerId),
        )
      : null;

  const statusLabels = {
    strong: t("status.strong"),
    possible: t("status.possible"),
    weak: t("status.weak"),
    insufficient_data: t("status.insufficient_data"),
  } as const;
  const shortlistLabels: Record<ShortlistStatus, string> = {
    saved: t("shortlist.saved"),
    interested: t("shortlist.interested"),
    not_fit: t("shortlist.not_fit"),
    reviewed: t("shortlist.reviewed"),
  };
  const reason = (code: string): string =>
    t.has(`reason.${code}`) ? t(`reason.${code}`) : code;
  const gap = (code: string): string => (t.has(`gap.${code}`) ? t(`gap.${code}`) : code);
  const availabilityLabel = (value: string | null): string => {
    const key = `availabilityValue.${value ?? "unknown"}`;
    return t.has(key) ? t(key) : t("availabilityValue.unknown");
  };

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      {/* Honest matching status (audit P1): what works today vs what an active
          candidate stream still depends on. No guaranteed/instant/AI claims. */}
      <section
        className="flex flex-col gap-1.5 rounded-lg border border-ink-600 bg-ink-800/40 px-4 py-3"
        data-testid="scouting-status-note"
      >
        <p className="text-sm font-semibold text-text-primary">{t("statusNote.title")}</p>
        <p className="text-xs leading-relaxed text-text-secondary">{t("statusNote.signals")}</p>
        <p className="text-xs leading-relaxed text-text-secondary">{t("statusNote.stream")}</p>
        <p className="text-xs leading-relaxed text-text-secondary">{t("statusNote.fill")}</p>
        <p className="text-xs leading-relaxed text-text-muted">{t("statusNote.disclaimer")}</p>
      </section>

      {/* Privacy frame — contacts hidden, profile-safe only (Step 3A policy). */}
      <section
        className="flex flex-col gap-1.5 rounded-lg border border-brand-blue/25 bg-brand-blue/5 px-4 py-3"
        data-testid="scouting-privacy-note"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <span aria-hidden className="text-base leading-none">
            🔒
          </span>
          {t("privacy.contactsHidden")}
        </p>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("privacy.profileSafe")}
        </p>
      </section>

      {/* Honest visibility: based on readiness/trust/permissions — NOT payment.
          Paid wider access is inert while billing is disabled; no fake unlock. */}
      <FeatureNote testId="scouting-visibility-note">{t("visibilityNote")}</FeatureNote>

      {/* Trust: how matching works — deterministic, honest, no fake score. */}
      <details className="group rounded-lg border border-ink-600 bg-ink-800/40" data-testid="scouting-how">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-text-primary marker:text-text-muted">
          {t("how.title")}
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4 text-xs leading-relaxed text-text-secondary">
          <p>{t("how.intro")}</p>
          <ul className="flex flex-col gap-1.5">
            {(["strong", "possible", "weak", "insufficient_data"] as const).map((k) => (
              <li key={k} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">
                  {statusLabels[k]}
                </span>
                <span>{t(`how.legend.${k}`)}</span>
              </li>
            ))}
          </ul>
          <p>{t("how.evidence")}</p>
          <p className="text-text-primary">🔒 {t("how.contacts")}</p>
          <p>{t("how.next")}</p>
        </div>
      </details>

      {/* Demand picker */}
      {demands.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-ink-500 px-4 py-6">
          <p className="text-sm text-text-secondary">{t("noDemands")}</p>
          <Link
            href={`/${locale}/dashboard/company#demand-intake`}
            className="rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/80"
            data-testid="scouting-no-demands-cta"
          >
            {t("noDemandsCta")} →
          </Link>
        </div>
      ) : (
        <nav className="flex flex-wrap gap-2" aria-label={t("pickDemand")}>
          {demands.map((d) => (
            <Link
              key={d.id}
              href={`/${locale}/dashboard/company/scouting?request=${d.id}`}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected === d.id
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
              }`}
            >
              {d.title}
              {!d.structured ? (
                <span className="ml-1.5 font-mono text-meta uppercase tracking-label text-text-muted">
                  {t("unstructuredTag")}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
      )}

      {/* Bounded facet filters (Wagon 1): chips from the VISIBLE supply only
          (server-validated allowlist), URL-param driven (shareable), strictly
          narrowing — never widening beyond can_view_worker. */}
      {result?.kind === "ok" &&
      (result.facets.skills.length > 0 ||
        result.facets.countries.length > 0 ||
        hasActiveScoutFilters(result.filters)) ? (
        <section
          className="flex flex-col gap-2"
          data-testid="scouting-filters"
          aria-label={t("filters.title")}
        >
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("filters.title")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={filterHref({ availableNow: !result.filters.availableNow })}
              data-testid="scout-filter-available"
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                result.filters.availableNow
                  ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                  : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
              }`}
            >
              {t("filters.availableNow")}
            </Link>
            {result.facets.countries.map((cc) => (
              <Link
                key={`country-${cc}`}
                href={filterHref({
                  country: result.filters.country === cc ? null : cc,
                })}
                data-testid={`scout-filter-country-${cc}`}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  result.filters.country === cc
                    ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
                }`}
              >
                {cc}
              </Link>
            ))}
            {result.facets.skills.map((s) => (
              <Link
                key={`skill-${s}`}
                href={filterHref({
                  skill: result.filters.skill === s ? null : s,
                })}
                data-testid={`scout-filter-skill-${s}`}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  result.filters.skill === s
                    ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary"
                }`}
              >
                {tSkill.has(s as never) ? tSkill(s as never) : s.replace(/-/g, " ")}
              </Link>
            ))}
            {hasActiveScoutFilters(result.filters) ? (
              <Link
                href={filterHref({ skill: null, country: null, availableNow: false })}
                data-testid="scout-filter-clear"
                className="rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-brand-blue hover:text-brand-cyan"
              >
                {t("filters.clear")}
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Recognized-need honesty banner (PR4): the requirement set below was
          derived from the demand's own text by the offline recognizer — a
          labeled SUGGESTION, not a human-confirmed structure. Matches remain
          previews until a human confirms the requirements (§19/§7). PR10
          adds that human act right here: CONFIRM writes
          payload.structured_need.skill_slugs on the company's own row. */}
      {result?.kind === "ok" &&
      (result.demand.needSource === "recognized_from_text" ||
        result.demand.needSource === "profession_expanded") ? (
        <p
          className="rounded-md border border-state-amber/40 bg-state-amber/10 px-4 py-3 text-xs leading-relaxed text-text-secondary"
          data-testid="scouting-recognized-note"
        >
          {t("recognizedNote")}
        </p>
      ) : null}

      {/* Demand lifecycle (PR10): confirm recognized skills (§19 human act)
          + close/reopen. Closing hides the demand from the worker board
          instantly (its RPC serves submitted only) — honest visibility,
          never a delete. Internal state only. */}
      {result?.kind === "ok" ? (
        <DemandLifecycleControls
          locale={locale}
          requestId={result.demand.id}
          status={result.demand.status}
          showConfirm={
            result.demand.needSource === "recognized_from_text" ||
            result.demand.needSource === "profession_expanded"
          }
          labels={{
            confirm: t("lifecycle.confirm"),
            confirmed: t("lifecycle.confirmed"),
            close: t("lifecycle.close"),
            reopen: t("lifecycle.reopen"),
            closedNote: t("lifecycle.closedNote"),
            error: t("lifecycle.error"),
          }}
        />
      ) : null}

      {/* Results */}
      {result?.kind === "not-structured" ? (
        <p
          className="rounded-md border border-state-warning/30 bg-state-warning/5 px-4 py-6 text-sm leading-relaxed text-text-secondary"
          data-testid="scouting-not-structured"
        >
          {t("notStructured")}
        </p>
      ) : null}
      {result?.kind === "needs-migration" ? (
        <p className="rounded-md border border-ink-500 px-4 py-6 text-sm text-text-secondary">
          {t("needsSetup")}
        </p>
      ) : null}
      {result?.kind === "ok" && result.candidates.length === 0 ? (
        <div
          className="flex flex-col items-start gap-2 rounded-md border border-dashed border-ink-500 px-4 py-6"
          data-testid="scouting-empty"
        >
          <p className="text-sm text-text-secondary">
            {hasActiveScoutFilters(result.filters)
              ? t("filters.noMatches")
              : t("noCandidates")}
          </p>
          {hasActiveScoutFilters(result.filters) ? (
            <Link
              href={filterHref({ skill: null, country: null, availableNow: false })}
              className="text-xs font-medium text-brand-blue hover:text-brand-cyan"
            >
              {t("filters.clear")} →
            </Link>
          ) : null}
        </div>
      ) : null}

      {selected && offeredCandidates.length > 0 ? (
        <section className="card-border flex flex-col gap-3 p-4" data-testid="scouting-agency-offers">
          <header className="flex flex-col gap-1">
            <h2 className="font-display text-base font-semibold text-text-primary">
              {tOffered("title")}
            </h2>
            <p className="text-xs leading-relaxed text-text-secondary">{tOffered("subtitle")}</p>
          </header>
          <ul className="flex flex-col gap-3">
            {offeredCandidates.map((oc) => (
              <li key={oc.offerId} className="card-border flex flex-col gap-3 p-3" data-testid={`scout-offered-${oc.workerId}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue">
                    {anonymizedToken(anonymizedWorkerLabel(oc.workerId))}
                  </span>
                  <span className="text-xs text-text-muted">{tOffered("via")}: {oc.agencyName}</span>
                  {oc.note ? <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">{oc.note}</span> : null}
                </div>
                <div className="flex flex-col gap-2">
                  <RequestCommunicationButton
                    locale={locale}
                    requestId={selected}
                    workerId={oc.workerId}
                    labels={{
                      button: t("request.button"), opening: t("request.opening"),
                      opened: t("request.opened"), view: t("request.view"),
                      error: t("request.error"), limitReached: t("request.limitReached"),
                    }}
                  />
                  <ProposeBookingButton
                    locale={locale}
                    requestId={selected}
                    workerId={oc.workerId}
                    countryCode={null}
                    labels={{
                      open: t("booking.open"), startDate: t("booking.startDate"),
                      note: t("booking.note"), send: t("booking.send"),
                      sending: t("booking.sending"), sent: t("booking.sent"),
                      unavailable: t("booking.unavailable"), notEntitled: t("booking.notEntitled"),
                      error: t("booking.error"), cancel: t("booking.cancel"),
                    }}
                  />
                  <ScoutingShortlistButtons
                    locale={locale}
                    requestId={selected}
                    workerId={oc.workerId}
                    current={null}
                    currentNote={null}
                    labels={{
                      statuses: shortlistLabels,
                      error: t("shortlistError"),
                      note: {
                        label: t("shortlistNote.label"), internalHint: t("shortlistNote.internalHint"),
                        add: t("shortlistNote.add"), edit: t("shortlistNote.edit"),
                        placeholder: t("shortlistNote.placeholder"), reasonTitle: t("shortlistNote.reasonTitle"),
                        reasonPlaceholder: t("shortlistNote.reasonPlaceholder"), reasonRequired: t("shortlistNote.reasonRequired"),
                        save: t("shortlistNote.save"), cancel: t("shortlistNote.cancel"),
                      },
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result?.kind === "ok" && result.candidates.length > 0 ? (
        <ul className="flex flex-col gap-3" data-testid="scouting-results">
          {result.candidates.map((c) => {
            const p = c.preview;
            const fit = c.match.skillFit;
            // ONE canonical pipeline stage (P4) — DERIVED at read time from
            // the existing facts (shortlist + interest + booking +
            // conversation), never stored. One next action per stage.
            const stage = deriveCandidatePipelineStage({
              shortlistStatus: c.shortlistStatus,
              interestStatus: result.interestByWorker[c.workerId] ?? null,
              bookingStatus: pipelineFacts?.bookingByWorker.get(c.workerId) ?? null,
              conversationExists:
                pipelineFacts?.conversationByWorker.has(c.workerId) ?? false,
            });
            const nextAction = nextActionForStage(stage, {
              locale,
              requestId: result.demand.id,
            });
            return (
              <li
                key={c.workerId}
                className="card-border flex flex-col gap-3 p-4"
                data-testid={`scout-candidate-${c.workerId}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {/* Anonymized handle — never a name (Step 3A). */}
                    <span
                      aria-hidden
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink-500 bg-ink-800 font-mono text-xs font-semibold text-text-secondary"
                    >
                      {anonymizedToken(p.anonymizedLabel).slice(0, 2)}
                    </span>
                    <p className="truncate font-display text-base font-bold text-text-primary">
                      {t("candidate")}{" "}
                      <span className="font-mono text-sm text-text-secondary">
                        {anonymizedToken(p.anonymizedLabel)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Worker-initiated interest — a REAL internal signal
                        (demand_interest_signals row), never fabricated. */}
                    {result.interestByWorker[c.workerId] ? (
                      <span
                        className="rounded-full border border-state-success/40 bg-state-success/10 px-2.5 py-1 font-mono text-meta uppercase tracking-label text-state-success"
                        data-testid={`scout-interest-${c.workerId}`}
                      >
                        {t("interestBadge")}
                      </span>
                    ) : null}
                    {/* Honest profile freshness (Wagon 1) — real updated_at
                        bucket; dormant is ranked lower, never hidden. */}
                    <span
                      className={`rounded-full border px-2.5 py-1 font-mono text-meta uppercase tracking-label ${FRESHNESS_TONE[c.lastActiveBucket]}`}
                      data-testid={`scout-freshness-${c.workerId}`}
                      data-freshness={c.lastActiveBucket}
                    >
                      {t(`freshness.${c.lastActiveBucket}` as never)}
                    </span>
                    <span
                      className="rounded-full border border-ink-500 bg-ink-800 px-2.5 py-1 font-mono text-meta uppercase tracking-label text-text-secondary"
                      data-testid={`scout-status-${c.workerId}`}
                    >
                      {statusLabels[c.match.status]}
                    </span>
                  </div>
                </div>

                {/* Canonical pipeline (P4): the ONE derived stage of this
                    (demand, worker) pair + its ONE next action. Derived at
                    read time from real facts — never a stored 7th enum. */}
                <div
                  className="flex flex-wrap items-center justify-between gap-2"
                  data-testid={`scout-pipeline-${c.workerId}`}
                  data-stage={stage}
                >
                  <span
                    className={`rounded-full border px-2.5 py-1 font-mono text-meta uppercase tracking-label ${PIPELINE_TONE[stage]}`}
                  >
                    {tPipe(`stage.${stage}` as never)}
                  </span>
                  <Link
                    href={nextAction.href}
                    className="text-meta font-medium text-brand-blue hover:text-brand-cyan"
                    data-testid={`scout-pipeline-next-${c.workerId}`}
                  >
                    {tPipe(nextAction.key.replace("candidatePipeline.", "") as never)} →
                  </Link>
                </div>

                {/* Profile-safe facts (owner-approved fields only). */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <div className="min-w-0">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("fields.location")}
                    </dt>
                    <dd className="truncate text-xs text-text-primary">
                      {p.location ?? t("availabilityValue.unknown")}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("fields.availability")}
                    </dt>
                    <dd className="truncate text-xs text-text-primary">
                      {availabilityLabel(p.availability)}
                      {p.availableFrom ? (
                        <span className="text-text-secondary"> · {p.availableFrom}</span>
                      ) : null}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("fields.rate")}
                    </dt>
                    <dd className="truncate text-xs text-text-primary">
                      {p.rate.minEur != null ? t("rateFrom", { min: p.rate.minEur }) : t("noRate")}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("fields.evidence")}
                    </dt>
                    <dd className="truncate text-xs text-text-primary">{p.evidenceCount}</dd>
                  </div>
                </dl>

                {/* §19 skill-fit basis line — always with its basis, confirmed split */}
                {fit ? (
                  <p className="text-xs text-text-secondary">
                    {t("skillFit", {
                      pct: fit.pct,
                      matched: fit.matchedTotal,
                      total: fit.needTotal,
                      confirmed: fit.matchedConfirmed,
                    })}
                  </p>
                ) : null}
                {/* Evidence ladder counts for the matched skills */}
                <p className="font-mono text-meta text-text-muted">
                  {t("evidence", {
                    confirmed: c.match.evidence.matchedManagerConfirmed,
                    journal: c.match.evidence.matchedJournalSupported,
                    self: c.match.evidence.matchedSelfDeclared,
                  })}
                </p>

                {/* Stage 7 — safe readiness signal: country + availability fit
                    only. Document readiness stays consent-gated (a company can
                    never see a worker's private documents). No fake doc claim. */}
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid={`scout-readiness-${c.workerId}`}
                  data-readiness={c.readiness.label}
                >
                  <span
                    className={`rounded-md border px-2 py-0.5 text-meta ${READINESS_TONE[c.readiness.label]}`}
                  >
                    {t(`readiness.label.${c.readiness.label}` as never)}
                  </span>
                  <span className="rounded-md border border-ink-500 px-2 py-0.5 text-meta text-text-secondary">
                    {t(`readiness.country.${c.readiness.countryFit}` as never)}
                  </span>
                  <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("readiness.docsConsent")}
                  </span>
                </div>

                {/* Why */}
                {c.match.reasons.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.match.reasons
                      .filter((r) => r.code !== "skill_fit")
                      .map((r, i) => (
                        <span
                          key={`${r.code}-${i}`}
                          className="rounded-md border border-state-success/30 bg-state-success/10 px-2 py-0.5 text-meta text-state-success"
                        >
                          {reason(r.code)}
                        </span>
                      ))}
                  </div>
                ) : null}
                {/* Gaps */}
                {c.match.gaps.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.match.gaps.map((g, i) => (
                      <span
                        key={`${g.code}-${i}`}
                        className="rounded-md border border-state-warning/30 bg-state-warning/5 px-2 py-0.5 text-meta text-state-warning"
                      >
                        {gap(g.code)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Contract v2 (PR 4): discussion points — never a block,
                    never a silent boost. Same deterministic engine fields the
                    worker board renders. */}
                {c.match.negotiables.length > 0 ? (
                  <div
                    className="flex flex-col gap-1"
                    data-testid={`scout-negotiables-${c.workerId}`}
                  >
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("tiers.negotiables")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {c.match.negotiables.map((n) => (
                        <span
                          key={n.criterion}
                          className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-2 py-0.5 text-meta text-brand-blue"
                          data-criterion={n.criterion}
                          title={n.source}
                        >
                          {criterionLabel(n.criterion)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Contract v2 (PR 4): missing facts — which side has not
                    stated what. Honest absence, never an assumed outcome. */}
                {c.match.missingFacts.length > 0 ? (
                  <div
                    className="flex flex-col gap-1"
                    data-testid={`scout-missing-${c.workerId}`}
                  >
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("tiers.missing")}
                    </span>
                    <ul className="flex flex-col gap-0.5">
                      {c.match.missingFacts.map((m) => (
                        <li
                          key={`${m.criterion}-${m.side}`}
                          className="text-meta text-text-muted"
                          data-criterion={m.criterion}
                          data-side={m.side}
                          title={m.source}
                        >
                          {m.side === "worker"
                            ? t("missingSide.worker", {
                                criterion: criterionLabel(m.criterion),
                              })
                            : t("missingSide.demand", {
                                criterion: criterionLabel(m.criterion),
                              })}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* The one clear next step for this result (PR4). */}
                <p
                  className="font-mono text-meta uppercase tracking-label text-text-muted"
                  data-testid={`scout-next-${c.workerId}`}
                >
                  {t.has(`nextAction.${c.match.nextAction}`)
                    ? t(`nextAction.${c.match.nextAction}` as never)
                    : null}
                </p>

                {/* Communication — IN-APP only, contacts stay hidden. The
                    request action is gated by canStartCommunicationOrBooking
                    (Step 3A rule 6) + ownership + shortlist, re-checked
                    server-side. When not contactable, only a transparent status
                    shows (no dead/broken button). No booking persistence yet. */}
                <div
                  className="flex flex-col gap-2 rounded-md border border-ink-500/70 bg-ink-800/60 px-2.5 py-2"
                  data-testid={`scout-comms-${c.workerId}`}
                  data-can-contact={c.canContact ? "true" : "false"}
                >
                  <p className="flex items-center gap-1.5 text-meta text-text-muted">
                    <span aria-hidden>{c.canContact ? "💬" : "⏳"}</span>
                    {c.canContact ? t("comms.eligible") : t("comms.blocked")}
                  </p>
                  {c.canContact ? (
                    <div className="flex flex-col gap-2">
                      <RequestCommunicationButton
                        locale={locale}
                        requestId={result.demand.id}
                        workerId={c.workerId}
                        labels={{
                          button: t("request.button"),
                          opening: t("request.opening"),
                          opened: t("request.opened"),
                          view: t("request.view"),
                          error: t("request.error"),
                          limitReached: t("request.limitReached"),
                        }}
                      />
                      <ProposeBookingButton
                        locale={locale}
                        requestId={result.demand.id}
                        workerId={c.workerId}
                        countryCode={c.readiness.countryFit === "match" ? p.location : null}
                        labels={{
                          open: t("booking.open"),
                          startDate: t("booking.startDate"),
                          note: t("booking.note"),
                          send: t("booking.send"),
                          sending: t("booking.sending"),
                          sent: t("booking.sent"),
                          unavailable: t("booking.unavailable"),
                          notEntitled: t("booking.notEntitled"),
                          error: t("booking.error"),
                          cancel: t("booking.cancel"),
                        }}
                      />
                      {/* Contact-detail ASK (Wagon 1): the worker alone
                          answers on their privacy screen; a grant never
                          shows contact data here — server-enforced. */}
                      <RequestContactDetailsButton
                        locale={locale}
                        requestId={result.demand.id}
                        workerId={c.workerId}
                        currentStatus={
                          contactRequests.byWorker[c.workerId]?.status ?? null
                        }
                        disclosureGranted={
                          contactRequests.byWorker[c.workerId]?.disclosureGranted ??
                          false
                        }
                        modelApplied={contactRequests.applied}
                        labels={{
                          button: t("contactRequest.button"),
                          sending: t("contactRequest.sending"),
                          pending: t("contactRequest.pending"),
                          accepted: t("contactRequest.accepted"),
                          granted: t("contactRequest.granted"),
                          declined: t("contactRequest.declined"),
                          expired: t("contactRequest.expired"),
                          unavailable: t("contactRequest.unavailable"),
                          rateLimited: t("contactRequest.rateLimited"),
                          noOrganization: t("contactRequest.noOrganization"),
                          fieldsNote: t("contactRequest.fieldsNote"),
                          error: t("contactRequest.error"),
                        }}
                      />
                    </div>
                  ) : null}
                </div>

                {/* Company acknowledgement of a REAL worker interest signal
                    (PR7) — internal record only; never rendered without an
                    actual signal, nothing is sent anywhere. */}
                {result.interestByWorker[c.workerId] ? (
                  <CompanyInterestAck
                    locale={locale}
                    requestId={result.demand.id}
                    workerId={c.workerId}
                    initialStatus={result.interestByWorker[c.workerId]}
                    labels={{
                      statusLabels: Object.fromEntries(
                        ["interested", "reviewed", "contacted"]
                          .filter((s) => t.has(`ack.status.${s}`))
                          .map((s) => [s, t(`ack.status.${s}` as never)]),
                      ),
                      markReviewed: t("ack.markReviewed"),
                      markContacted: t("ack.markContacted"),
                      internalNote: t("ack.internalNote"),
                      error: t("ack.error"),
                      notAvailable: t("ack.notAvailable"),
                    }}
                  />
                ) : null}

                <ScoutingShortlistButtons
                  locale={locale}
                  requestId={result.demand.id}
                  workerId={c.workerId}
                  current={c.shortlistStatus}
                  currentNote={c.shortlistNote}
                  labels={{
                    statuses: shortlistLabels,
                    error: t("shortlistError"),
                    /* Extension B — the existing note column becomes usable:
                       optional internal note, REQUIRED reason on not_fit.
                       Internal to this company (worker never reads it). */
                    note: {
                      label: t("shortlistNote.label"),
                      internalHint: t("shortlistNote.internalHint"),
                      add: t("shortlistNote.add"),
                      edit: t("shortlistNote.edit"),
                      placeholder: t("shortlistNote.placeholder"),
                      reasonTitle: t("shortlistNote.reasonTitle"),
                      reasonPlaceholder: t("shortlistNote.reasonPlaceholder"),
                      reasonRequired: t("shortlistNote.reasonRequired"),
                      save: t("shortlistNote.save"),
                      cancel: t("shortlistNote.cancel"),
                    },
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="text-meta leading-relaxed text-text-muted">{t("footnote")}</p>
    </main>
  );
}
