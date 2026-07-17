import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CommandFinder } from "@/components/app/command-finder";
import { DemandRequestButton } from "@/components/app/demand-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { WorkerInvitationsCard } from "@/components/app/worker-invitations-card";
import { DashboardChainActions } from "@/components/app/dashboard-chain-actions";
import { DashboardNextAction } from "@/components/app/dashboard-next-action";
import { CurrentSpaceHeader } from "@/components/app/current-space-header";
import { IdentityActions } from "@/components/app/identity-actions";
import { DashboardModuleGrid } from "@/components/app/dashboard/dashboard-module-grid";
import { DashboardMoreSection } from "@/components/app/dashboard/dashboard-more-section";
import { DashboardStatusStrip } from "@/components/app/dashboard/dashboard-status-strip";
import { JobRecommendationsCard } from "@/components/app/dashboard/job-recommendations-card";
import {
  OpportunityDirectionsCard,
  type DirectionView,
} from "@/components/app/dashboard/opportunity-directions-card";
import {
  loadAdjacentDirectionsForWorker,
  type AdjacentDirectionLimitation,
} from "@/lib/opportunities/adjacent-directions";
import { MyZone } from "@/components/app/my-zone";
import { PrivacyStatusCard } from "@/components/app/privacy-status-card";
import { getOwnCompany } from "@/lib/company/company-setup";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { getWorkerCard } from "@/lib/worker/work-card";
import { deriveWorkCardState } from "@/lib/worker/work-card-state";
import {
  getOutgoingRequestSummary,
  getServiceRequestsNewCounts,
} from "@/lib/marketplace/service-requests";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import {
  managerNextAction,
  customerNextAction,
  type NextAction,
} from "@/lib/dashboard/next-action";
import { decideTopSlot } from "@/lib/dashboard/top-slot";
import { buildControlRoomViewModel } from "@/lib/dashboard/control-room-view-model";
import { getDashboardCardPreferences } from "@/lib/dashboard/preferences";
import { EMPTY_CARD_PREFS } from "@/lib/dashboard/dashboard-preferences-shared";
import { getSpineCounts } from "@/lib/notifications/spine";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import { getSessionProfile } from "@/lib/auth/session-profile";
import { type Role } from "@/lib/auth/actions";
import { PremiumHubScreen } from "@/components/app/premium-hub/premium-hub-screen";
import { PremiumHubCompanyCard } from "@/components/app/premium-hub/premium-hub-company-card";
import { PremiumHubMarketMap } from "@/components/app/premium-hub/premium-hub-market-map";
import { PremiumHubProjectCard } from "@/components/app/premium-hub/premium-hub-project-card";
import { getPremiumHubViewModel } from "@/components/app/premium-hub/premium-hub-data";
import { TrustInsightCard } from "@/components/intelligence/trust-insight-card";
import {
  getCompanyDemandIntelligence,
  getWorkerSalaryIntelligence,
} from "@/lib/intelligence/intelligence-read";
import {
  buildCompanyDemandTrustCard,
  buildWorkerSalaryTrustCard,
} from "@/lib/intelligence/trust-card-model";

// Authenticated cockpit — must never be served from a stale cache, or a logged-in
// owner can see a pre-deploy render (e.g. missing the chain action CTAs).
export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

/**
 * Hub market-context cards (Contextual Intelligence UI v1) — async server
 * components so the RLS-scoped intelligence reads STREAM alongside the
 * hub's main parallel batch (P0 latency doctrine: no new waterfall). Both
 * render the ONE trust-card engine: a deterministic figure with its full
 * trust report, or the honest unavailable state — never a fabricated
 * number (§18).
 */
async function HubWorkerIntelligence({ locale }: { locale: string }) {
  const salaryIntel = await getWorkerSalaryIntelligence();
  if (salaryIntel.kind === "no_viewer") return null;
  const card = buildWorkerSalaryTrustCard(
    salaryIntel.kind === "ok"
      ? {
          benchmark: salaryIntel.benchmark,
          comparison: salaryIntel.comparison,
        }
      : null,
    Date.now(),
  );
  return <TrustInsightCard card={card} locale={locale} linkToWorkspace />;
}

async function HubCompanyIntelligence({ locale }: { locale: string }) {
  const demandIntel = await getCompanyDemandIntelligence();
  if (demandIntel.kind === "no_viewer") return null;
  const card = buildCompanyDemandTrustCard(
    demandIntel.kind === "ok"
      ? {
          demandAggregates: demandIntel.demandAggregates,
          windowStart: demandIntel.windowStart,
          windowEnd: demandIntel.windowEnd,
        }
      : null,
    Date.now(),
  );
  return <TrustInsightCard card={card} locale={locale} linkToWorkspace />;
}

/** Overview tab — active-role overview (slice dashboard-active-role-overview-v1).
 *  Honest signals only (real profession/skills/journal counts); no fake
 *  matching/metrics (PV §10, PRODUCT_CONSTITUTION §5/§9). Non-locking by design:
 *  the active role is the current workspace, not a permanent category (§1).
 *
 *  First-screen clarity: each role sees ONLY its own primary path. Identity
 *  actions are focused to the active role (the other identity stays one tap away
 *  via "Switch role / Manage spaces"). The heavy explanation surfaces (journey
 *  stage-rail, "starting point" banner, calm explanation note) are gone — the
 *  overview leads with one clear next action, not a product explainer. */
export default async function DashboardOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Honest landing surface for the role gate (audit PR4): a cross-role link
  // (e.g. "Opportunities" from a company-only account) redirects here with
  // ?notice=needs_<role>_role instead of bouncing silently.
  const { notice } = await searchParams;
  const ROLE_NOTICES = new Set([
    "needs_worker_role",
    "needs_company_role",
    "needs_agency_role",
    "needs_customer_role",
  ]);
  const roleNotice = notice && ROLE_NOTICES.has(notice) ? notice : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Wagon 2 (nav performance): ONE live company read for the whole page
  // render — the hub view model consumes this same promise instead of
  // re-calling getOwnCompany() (which stays deliberately UNCACHED; sharing
  // the promise dedupes within this render without adding any caching).
  const companyReadPromise = getOwnCompany();

  // Consolidation v1: /dashboard now LEADS with the premium hub (the canonical
  // visual surface — the former /dashboard/hub is removed). Kick the hub's own
  // RLS-scoped reads off in parallel with the overview's reads so it adds no
  // serial latency; it is awaited once, just before the role branch.
  const hubVmPromise = getPremiumHubViewModel({
    companyRead: companyReadPromise,
  });

  // Server-side card layout (company architecture v1) — needs the role, which
  // needs the profile; chain off the request-cached session-profile reader so
  // the prefs round-trip OVERLAPS the main batch below instead of blocking
  // serially after it (Wagon 2).
  const cardPrefsPromise = getSessionProfile().then((s) => {
    const prefsRole: Role = ROLES.has(s.profile?.active_role as Role)
      ? (s.profile!.active_role as Role)
      : "worker";
    return getDashboardCardPreferences(
      prefsRole === "worker" ? "person" : "company",
    );
  });

  // ONE parallel read batch (P0 latency audit). These reads are mutually
  // independent; the prior sequential awaits stacked ~8 network round-trips
  // into the overview's TTFB. getSpineCounts() is request-cached and shared
  // with the auth-shell layout, and it already carries the pending-service-
  // request / booking counts, so those helpers are not re-queried here. The
  // profile row comes from the request-cached session-profile reader shared
  // with the layout and the hub (was: a third independent profiles SELECT).
  const [
    session,
    companyRead,
    invitations,
    { providerNew, buyerNew },
    outgoingSummary,
    spineCounts,
  ] = await Promise.all([
    getSessionProfile(),
    companyReadPromise,
    listMyPendingWorkerInvitations(),
    getServiceRequestsNewCounts(),
    getOutgoingRequestSummary(),
    getSpineCounts(),
  ]);
  const profile = session.profile;
  const pendingServiceRequests = spineCounts.pendingIncomingServiceRequests;
  const bookingResponsesNew = spineCounts.bookingResponsesNew;

  const t = await getTranslations("auth.dashboard");
  const tw = await getTranslations("auth.dashboard.wow");
  const tf = await getTranslations("auth.dashboard.wow.flow");
  const tRole = await getTranslations("auth.signup.role");
  const tProf = await getTranslations("professions");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";

  // Server-side card layout (company architecture v1): the grid layout is a
  // per-(profile, context) preference — the person and the company workspace
  // keep separate layouts (§20). "unavailable" (owner-gated migration not
  // applied) → null → the grid keeps the device-local behaviour honestly.
  // The read itself was started before the main batch (Wagon 2) — this only
  // awaits the already-in-flight promise.
  const prefsContext = role === "worker" ? ("person" as const) : ("company" as const);
  const cardPrefsRead = await cardPrefsPromise;
  const serverCardPrefs =
    cardPrefsRead.kind === "ok" ? (cardPrefsRead.prefs ?? EMPTY_CARD_PREFS) : null;

  // Role-gate landing banner (audit PR4) — explains the bounce + one connected
  // next action (the spaces hub), shown in BOTH branch layouts.
  const RoleNoticeBanner = roleNotice ? (
    <div
      data-testid="dashboard-role-notice"
      className="flex flex-col gap-2 rounded-md border border-brand-orange/40 bg-brand-orange/5 p-4"
    >
      <p className="text-sm text-text-primary">{t(`roleNotice.${roleNotice}`)}</p>
      <Link
        href={"/dashboard/start" as "/dashboard"}
        className="w-fit text-sm font-medium text-brand-blue hover:underline"
      >
        {t("roleNotice.cta")} →
      </Link>
    </div>
  ) : null;
  // Real company existence (RLS-scoped, read in the parallel batch above) →
  // drives the focused identity entry: company actions vs an honest "create a
  // company" CTA. Read failure / missing migration falls back to "no company".
  const hasCompany = companyRead.kind === "ok" && companyRead.row !== null;
  // Owner smoke 2026-07-05: the home card must name the ACTIVE company.
  const companyName =
    companyRead.kind === "ok" ? (companyRead.row?.legalName ?? null) : null;
  const name =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

  // Provider next-action: surface ONLY when there are REAL open ('sent') incoming
  // service requests (> 0). Role-agnostic — anyone who offers a service is a
  // provider — so the same compact card appears in every role's overview, linking
  // into the real request loop. 0 on any missing-data / needs-migration state →
  // no card, no fake badge (honest degradation).
  const tMarket = await getTranslations("marketplace");
  // Invitations rows + counts all come from the parallel batch above. The
  // "new since last seen" markers are a real OTHER-party update after this
  // user last opened /dashboard/service-requests — 0 when never opened or the
  // seen RPC is not applied yet (rollout-safe). Never my own action, never faked.
  const serviceRequestsNextAction =
    pendingServiceRequests > 0 ? (
      <Link
        href={"/dashboard/service-requests" as "/dashboard"}
        data-testid="dashboard-service-requests-next-action"
        className="flex items-center justify-between gap-3 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-4 py-3 text-sm text-text-primary hover:border-brand-blue"
      >
        <span className="flex flex-col">
          <span className="font-semibold">{tMarket("dashboardIncomingTitle")}</span>
          <span className="text-xs text-text-muted">{tMarket("dashboardIncomingNote")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {providerNew > 0 && (
            <span
              data-testid="dashboard-service-requests-new"
              className="inline-flex items-center rounded-full bg-brand-cyan/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-label text-brand-cyan tabular-nums"
            >
              {providerNew} {tMarket("newBadge")}
            </span>
          )}
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-bold text-white">
            {pendingServiceRequests}
          </span>
        </span>
      </Link>
    ) : null;

  // Buyer next-action: a single compact card summarising the caller's OWN
  // outgoing requests, from real statuses only. Priority is action-first —
  // an accepted request is the strongest next step; otherwise a still-waiting
  // ('sent') request; otherwise an answered ('declined') one shown calmly, no
  // panic copy. No outgoing requests → no card (no fake urgency). All counts are
  // 0 on any needs-migration / not-authed state (honest degradation).
  const outgoingState: "accepted" | "waiting" | "declined" | null =
    outgoingSummary.accepted > 0
      ? "accepted"
      : outgoingSummary.sent > 0
        ? "waiting"
        : outgoingSummary.declined > 0
          ? "declined"
          : null;
  const outgoingCount =
    outgoingState === "accepted"
      ? outgoingSummary.accepted
      : outgoingState === "waiting"
        ? outgoingSummary.sent
        : outgoingState === "declined"
          ? outgoingSummary.declined
          : 0;
  const outgoingRequestsNextAction = outgoingState ? (
    <Link
      href={"/dashboard/service-requests" as "/dashboard"}
      data-testid="dashboard-outgoing-requests-next-action"
      data-state={outgoingState}
      className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm text-text-primary ${
        outgoingState === "accepted"
          ? "border-state-success/40 bg-state-success/5 hover:border-state-success"
          : "border-ink-500 bg-ink-800/30 hover:border-brand-blue"
      }`}
    >
      <span className="flex flex-col">
        <span className="font-semibold">{tMarket(`dashboardOutgoing.${outgoingState}.title`)}</span>
        <span className="text-xs text-text-muted">
          {tMarket(`dashboardOutgoing.${outgoingState}.note`)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {buyerNew > 0 && (
          <span
            data-testid="dashboard-outgoing-requests-new"
            className="inline-flex items-center rounded-full bg-brand-cyan/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-label text-brand-cyan tabular-nums"
          >
            {buyerNew} {tMarket("newBadge")}
          </span>
        )}
        <span
          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums ${
            outgoingState === "accepted"
              ? "bg-state-success text-ink-900"
              : "bg-ink-700 text-text-primary"
          }`}
        >
          {outgoingCount}
        </span>
      </span>
    </Link>
  ) : null;

  // Booking-responses next-action (audit PR5): a worker's accept/decline on
  // the caller's OWN proposal was previously visible only if the proposer
  // happened to reopen /dashboard/bookings. Real "responses since last seen"
  // count (seen model mirrors the marketplace loop; 0 while the owner-gated
  // seen migration is unapplied — never a fake badge). Opens the exact
  // surface that shows the response.
  const tBookingsShared = await getTranslations("bookings");
  const bookingResponsesNextAction =
    bookingResponsesNew > 0 ? (
      <Link
        href={"/dashboard/bookings" as "/dashboard"}
        data-testid="dashboard-booking-responses-next-action"
        className="flex items-center justify-between gap-3 rounded-md border border-state-success/40 bg-state-success/5 px-4 py-3 text-sm text-text-primary hover:border-state-success"
      >
        <span className="flex flex-col">
          <span className="font-semibold">{tBookingsShared("dashboardResponses.title")}</span>
          <span className="text-xs text-text-muted">
            {tBookingsShared("dashboardResponses.note")}
          </span>
        </span>
        <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-state-success px-1.5 text-xs font-bold text-ink-900 tabular-nums">
          {bookingResponsesNew}
        </span>
      </Link>
    ) : null;

  // Control room v1 (PR B): ONE registry-driven view model feeds the status
  // strip + the role-specific grid. The former hard-coded marketplaceAccess
  // cards (services / service-requests / worker-gated opportunities) are now
  // registry entries rendered by the grid — same real destinations, one
  // source of truth. getSpineCounts() is request-cached, so this REUSES the
  // layout's bell/badge read instead of issuing a second set of count
  // queries; every badge and strip count traces to those spine counts.
  const controlRoom = buildControlRoomViewModel({
    role,
    counts: spineCounts,
    hasCompany,
  });

  // Shared header (role chip + greeting). The chip names the CURRENT workspace,
  // never a permanent label.
  const Header = (
    <header className="flex flex-col gap-2">
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
        <span className="live-dot" aria-hidden />
        {tRole(role)}
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
        {t("greeting", { name })}
      </h1>
    </header>
  );

  // The premium hub view model (real RLS-scoped snapshot) — awaited once; its
  // reads already overlapped the overview reads above.
  const hubVm = await hubVmPromise;

  // ── Company / agency / customer: active-role overview (one clear next move) ──
  if (role !== "worker") {
    // Role-based single Next Action. For an org reviewer we read the SAME gated
    // pending-review set the inbox uses (RPC), so the priority is data-driven:
    // entries waiting → review; nothing waiting → invite/open team (real route).
    // Degrades to 0 (honest "nothing waiting") if the RPC isn't applied (42883).
    // The reviewable-entries RPC and the demand read-back are independent
    // reads — run them in parallel (P0 latency audit) instead of stacking
    // two more round-trips onto the org overview.
    const isManagerRole = role === "company" || role === "agency";
    const [reviewableRes, demandReadback] = await Promise.all([
      isManagerRole
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).rpc("reviewable_journal_entry_ids")
        : Promise.resolve(null),
      // Demand read-back for the org's own submitted requests (company/agency
      // only; the customer/buyer role has its own detailed requests surface on
      // /dashboard/buyer). Honest status only — no matching.
      isManagerRole ? listOwnCustomerRequests() : Promise.resolve(null),
    ]);
    let pendingReview = 0;
    if (Array.isArray(reviewableRes?.data)) pendingReview = reviewableRes.data.length;
    const nextAction: NextAction = isManagerRole
      ? managerNextAction(role, pendingReview)
      : customerNextAction();

    const intent = role === "agency" ? "partner" : "hire_workers";
    // Intent-specific copy: a company hiring sees hiring language, an agency sees
    // candidate-supply language — never a generic buyer "need".
    const pilotKey = intent === "hire_workers" ? "hire" : "partner";
    const tReadback = await getTranslations("demandReadback");
    const tReqStatus = await getTranslations(
      "roleDashboards.buyer.requests.understanding.requestStatus",
    );
    const readbackLabels = {
      heading: tReadback("heading"),
      note: tReadback("note"),
      workerVisibilityNote: tReadback("workerVisibilityNote"),
      empty: tReadback("empty"),
      created: tReadback("created"),
      manageHelp: tReadback("manageHelp"),
      scoutLink: tReadback("scoutLink"),
      status: {
        draft: tReqStatus("draft"),
        submitted: tReqStatus("submitted"),
        in_review: tReqStatus("in_review"),
        needs_followup: tReqStatus("needs_followup"),
        approved: tReqStatus("approved"),
        closed: tReqStatus("closed"),
      },
      statusOther: tReadback("statusOther"),
      detailsLabel: tReadback("detailsLabel"),
      fields: {
        description: tReadback("fields.description"),
        role: tReadback("fields.role"),
        location: tReadback("fields.location"),
        skills: tReadback("fields.skills"),
        urgency: tReadback("fields.urgency"),
        notes: tReadback("fields.notes"),
      },
      urgencyValues: {
        flexible: tw("demand.form.urgencyFlexible"),
        this_week: tw("demand.form.urgencyThisWeek"),
        urgent: tw("demand.form.urgencyUrgent"),
      },
    };
    return (
      <div className="flex flex-col gap-6">
        <TelemetryView
          event={FUNNEL_EVENTS.dashboardViewed}
          metadata={{ surface: "dashboard", role_context: role }}
        />
        {RoleNoticeBanner}
        {Header}

        {/* Compact home v1 (owner directive 2026-07-16, supersedes the
            Wagon 3 readback-first order): the first screen carries ONLY
            what the owner acts on in a second —
              1. real pending states (count-gated, never fake),
              2. the single data-driven next action,
              3. compact planning status (spine strip chips),
              4. the "Veiksmai" module grid (the one workspace).
            Everything informational folds into the collapsed "more"
            section below. Nothing was removed — sections only moved. */}
        {serviceRequestsNextAction}
        {outgoingRequestsNextAction}
        {bookingResponsesNextAction}

        <DashboardNextAction
          action={nextAction}
          counts={{ pending: pendingReview }}
        />

        {/* Control room v1: compact spine-driven status strip — the same
            counts as the bell, each chip linking its clearing surface. */}
        <DashboardStatusStrip entries={controlRoom.statusEntries} />

        {/* The role's configurable card workspace (registry-driven): always-on
            access to the service loop, planning, map, messages, documents and
            the company workspace — real destinations only, badges from the
            spine. Reorder / hide / restore is device-local display state. */}
        <DashboardModuleGrid
          modules={controlRoom.modules}
          context={prefsContext}
          serverPrefs={serverCardPrefs}
        />

        {/* Company / agency: create a structured work need (hire / partner).
            A buyer/customer leads with their own request room (next action
            above → /dashboard/buyer), so no hiring intake is shown to them. */}
        {role !== "customer" && (
          <>
            <section
              id="demand-intake"
              className="card-border flex flex-col gap-5 p-6 scroll-mt-20 sm:p-8"
              data-testid="demand-intake-section"
            >
              <div className="flex flex-col gap-1">
                <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
                  <span className="live-dot" aria-hidden />
                  {tf("company.eyebrow")}
                </span>
                <h2 className="font-display text-2xl font-semibold tracking-tightest text-text-primary">
                  {tw(`demand.${pilotKey}.title`)}
                </h2>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
                  {tw(`demand.${pilotKey}.body`)}
                </p>
              </div>

              <DemandRequestButton
                intent={intent}
                stepTitles={[tf("company.c1"), tf("company.c2"), tf("company.c3")]}
              />
              {/* Static-stepper honesty note (guarded): the steps show
                  progress, they are not live modules. Kept inside the
                  section so it reads as the intake's own fine print. */}
              <p
                className="text-[11px] leading-relaxed text-text-muted"
                data-testid="journey-progress-helper"
              >
                {tw("demand.progressHelper")}
              </p>
            </section>
          </>
        )}

        {/* Everything informational, collapsed by default (compact home v1).
            All sections still server-render with real data — the fold is
            presentation only. The anchored #demand-intake section stays
            OUTSIDE (fragment deep-links cannot open a closed details). */}
        <DashboardMoreSection>
          {/* Canonical premium hub — the real-data snapshot (consolidation
              v1). Embedded = no competing page title. */}
          <PremiumHubScreen vm={hubVm} embedded />

          {/* The honest readback of what the org already asked for. */}
          {demandReadback && (
            <DemandRequestsReadback result={demandReadback} labels={readbackLabels} locale={locale} />
          )}

          {/* Market context (Contextual Intelligence UI v1): the org's own
              demand trust card — company/agency workspaces only. Suspense so
              the RLS-scoped intelligence read actually STREAMS (Wagon 2). */}
          {role === "company" || role === "agency" ? (
            <Suspense
              fallback={
                <div
                  className="card-border h-36 animate-pulse"
                  data-testid="hub-intelligence-loading"
                  aria-hidden
                />
              }
            >
              <HubCompanyIntelligence locale={locale} />
            </Suspense>
          ) : null}

          {/* Secondary — the role's chain entry points. */}
          <DashboardChainActions role={role} />
          {/* Active-role focus: only this role's identity actions; the other
              identity stays reachable via Manage spaces. */}
          <IdentityActions
            hasCompany={hasCompany}
            companyName={companyName}
            compact
            focusRole={role}
          />

          <WorkerInvitationsCard preloaded={invitations} />
        </DashboardMoreSection>

        {/* Universal command finder (WAGON 3) — type a normal term, get the
            right EXISTING page. Registry-only results, audience-filtered. */}
        <CommandFinder />
        {/* Compact space chip last — one line naming the active workspace. */}
        <CurrentSpaceHeader role={role} />
      </div>
    );
  }

  // ── Worker: "Mano darbo kortelė" — state-aware personal entry ──
  let professionName: string | null = null;
  let primaryProfessionSlug: string | null = null;
  let skillsCount = 0;
  let entriesCount = 0;
  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (workerRow?.id) {
    // The three reads (primary profession, skill count, journal entry count)
    // are independent; run them in parallel to cut the overview's tail latency.
    const [wpRes, scRes, ecRes] = await Promise.all([
      supabase
        .from("worker_professions")
        .select("professions(slug)")
        .eq("worker_id", workerRow.id)
        .eq("is_primary", true)
        .maybeSingle(),
      supabase
        .from("worker_skills")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerRow.id),
      supabase
        .from("journal_entries")
        .select("*", { count: "exact", head: true })
        .eq("worker_id", workerRow.id),
    ]);
    const slug =
      (wpRes.data?.professions as { slug: string } | null)?.slug ?? null;
    if (slug) {
      primaryProfessionSlug = slug;
      professionName = tProf(slug);
    }
    skillsCount = scRes.count ?? 0;
    entriesCount = ecRes.count ?? 0;
  }

  // A worker is in "first-use" until they have BOTH a profession set AND at
  // least one journal entry. The gentle first-use guidance shows only during
  // that window, then disappears — it never nags a settled person.
  const isFirstUse = !professionName || entriesCount === 0;

  // ── "Mano darbo kortelė" — state-aware continuity. The card decides
  // new/returning/stale from the worker's REAL saved data and shows ONE best
  // next action; it never re-asks a saved dimension and never restarts
  // onboarding on a returning login. ──
  const cardData = await getWorkerCard({
    workerId: workerRow?.id ?? null,
    name,
    professionName,
    skillsCount,
    evidenceCount: entriesCount,
  });
  // Folded into the hub person block (no separate WorkCard): the state-aware
  // next action + the inline availability/location/pay editor. Derived from the
  // worker's REAL saved card data; the client WorkCardEditor still writes via the
  // real save/confirm RPCs. The worker's consented avatar is read by the hub
  // adapter (getOwnAvatar) for the person block — no separate read here.
  const workDerived = deriveWorkCardState(cardData.signals, Date.now());
  const workEditor = {
    state: workDerived.state,
    next: workDerived.next,
    values: cardData.values,
  };

  // ── Opportunity Discovery v1: REAL adjacent professional directions derived
  // from the worker's held skills over the SINGLE canonical adjacency map
  // (lib/opportunities/adjacent-directions → lib/taxonomy/profession-skills).
  // Localized here (server) so the client card never sees a raw slug or a
  // locale key; honest limitation state when the profile is too thin. Only for
  // workers who have started a profile (>=1 skill) — first-use is covered by
  // MyZone above, so we don't nag a brand-new empty profile.
  let opportunityDirections: {
    directions: DirectionView[];
    limitationState: AdjacentDirectionLimitation;
  } | null = null;
  if (workerRow?.id && skillsCount >= 1) {
    const adj = await loadAdjacentDirectionsForWorker(
      supabase,
      workerRow.id,
      primaryProfessionSlug,
    );
    const tSkill = await getTranslations("skillNames");
    const profLabel = (s: string) =>
      tProf.has(s) ? tProf(s) : s.replace(/-/g, " ");
    const skillLabel = (s: string) =>
      tSkill.has(s as never) ? tSkill(s as never) : s.replace(/-/g, " ");
    opportunityDirections = {
      limitationState: adj.limitationState,
      directions: adj.directions.map((d) => ({
        professionId: d.professionId,
        professionName: profLabel(d.professionId),
        sharedSkills: d.sharedSkills.map(skillLabel),
        missingSkills: d.missingSkills.map(skillLabel),
      })),
    };
  }

  // Booking next-action: surface ONLY when there is a REAL pending incoming
  // booking count (> 0). 0 on any missing-data state → no card, no fake badge.
  // Bookings are not a primary nav item; their home is Žinutės (this card just
  // links there / to the bookings detail).
  const tBookings = await getTranslations("bookings");
  // From the request-cached spine (P0 latency audit) — the spine's
  // pendingIncomingBookings IS getPendingIncomingBookingCount(), so this is
  // the same real count without a second round-trip.
  const pendingBookings = spineCounts.pendingIncomingBookings;

  // Real booking next-action — only when there are pending incoming
  // proposals (> 0). Not a generic nav tile; a true action-needed card
  // that links to the bookings detail (home = Žinutės). No fake count.
  const bookingsPendingNextAction =
    pendingBookings > 0 ? (
      <Link
        href={"/dashboard/bookings" as "/dashboard"}
        data-testid="dashboard-bookings-next-action"
        className="flex items-center justify-between gap-3 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-4 py-3 text-sm text-text-primary hover:border-brand-blue"
      >
        <span className="flex flex-col">
          <span className="font-semibold">{tBookings("pendingLink")}</span>
          <span className="text-xs text-text-muted">{tBookings("pendingNote")}</span>
        </span>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-orange px-1.5 text-xs font-bold text-white">
          {pendingBookings}
        </span>
      </Link>
    ) : null;

  // ── State-driven top slot (audit PR6): exactly ONE card above the fold,
  // chosen by the pure priority ladder from REAL loaded counts. `new_user`
  // and `null` render no separate card — the full work card IS the next
  // action then. When a stronger card claims the slot, the work card
  // collapses to its hero so the action grid stays within one swipe. ──
  const topSlot = decideTopSlot({
    pendingInvitations: invitations.length,
    acceptedOutgoing: outgoingSummary.accepted,
    pendingIncomingServiceRequests: pendingServiceRequests,
    pendingIncomingBookings: pendingBookings,
    bookingResponsesNew,
    isFirstUse,
  });
  const topSlotCard =
    topSlot === "invitation" ? (
      <WorkerInvitationsCard preloaded={invitations} />
    ) : topSlot === "accepted_request" ? (
      outgoingRequestsNextAction
    ) : topSlot === "incoming_service_request" ? (
      serviceRequestsNextAction
    ) : topSlot === "incoming_booking" ? (
      bookingsPendingNextAction
    ) : topSlot === "booking_response" ? (
      bookingResponsesNextAction
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Action-first control room (Mano erdvė), audit-PR6 hierarchy:
          (1) the state-driven top slot — the ONE most important real next
          action; (2) "Mano darbo kortelė" (collapsed when the slot is
          occupied); (3) "Ką galite padaryti dabar" fast actions within one
          swipe; (4) remaining real pending states; (5) marketplace access;
          (6) explainers LAST — help never renders above action. */}
      <TelemetryView
        event={FUNNEL_EVENTS.dashboardViewed}
        metadata={{ surface: "dashboard", role_context: "worker" }}
      />
      <TelemetryView
        event={FUNNEL_EVENTS.firstActionCardViewed}
        metadata={{ surface: "work_card" }}
      />
      {RoleNoticeBanner}

      {/* The single most important next action for THIS user state. */}
      {topSlotCard && (
        <section
          data-testid="dashboard-top-slot"
          data-top-slot={topSlot}
          className="flex flex-col gap-2"
        >
          <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
            {t("topSlot.eyebrow")}
          </span>
          {topSlotCard}
        </section>
      )}

      {/* Control room v1: compact spine-driven status strip — the same
          counts as the bell, each chip linking its clearing surface. */}
      <DashboardStatusStrip entries={controlRoom.statusEntries} />

      {/* The action-first control room: readiness status, then the ONE
          registry-driven grid ("Ką galite padaryti dabar" — journal,
          profile, opportunities, planning, map, messages, documents, the
          service loop; the company door only when a real company exists via
          the view model's hasCompany flag). The "what improves what"
          explainer is demoted below (help ≠ action). `incomplete` is the
          real first-use state (no profession or no entries yet). */}
      <MyZone
        incomplete={isFirstUse}
        improves={false}
        // The exact missing items behind the first-use state, each deep-linking
        // to the precise section that completes it (user-journey repair v1):
        // profession → the profile edit block; first entry → the journal composer.
        missingItems={[
          ...(!professionName
            ? [{ key: "profession" as const, href: "/dashboard/profile#profile-edit" }]
            : []),
          ...(entriesCount === 0
            ? [{ key: "firstEntry" as const, href: "/dashboard/journal#journal-composer" }]
            : []),
        ]}
      />
      <DashboardModuleGrid
        modules={controlRoom.modules}
        context={prefsContext}
        serverPrefs={serverCardPrefs}
      />

      {/* Canonical premium hub — the real-data person snapshot. Its person
          block ("Asmens kortelė") carries the worker's ONE state-aware next
          action + inline availability/location/pay editor (folded from the
          former WorkCard). Anchored id="work-card" so the profile hub's
          availability pillar deep-links the ONE canonical editor — kept
          OUTSIDE the collapsed section (fragment deep-links cannot open a
          closed details). Embedded = no competing title. */}
      <div id="work-card">
        <PremiumHubScreen vm={hubVm} embedded contextual workEditor={workEditor} />
      </div>

      {/* D-01 duplicate removal (Wave 3, owner-approved): the repeated
          pending-card set is gone. Every non-promoted pending state keeps
          its canonical presentation on the status strip above — the SAME
          spineCounts numbers as these cards used, each chip linking the
          surface where the action really lives (bookings, service
          requests). The invitations repeat was provably dead: a pending
          invitation always wins the top slot, and the card renders null
          when the list is empty. The ONE non-duplicate stays below —
          outgoing service-request states (waiting / declined, and accepted
          whenever an invitation occupies the slot) have no chip equivalent,
          so this card is their only dashboard presentation. */}
      {topSlot !== "accepted_request" && outgoingRequestsNextAction}

      {/* Opportunity Discovery v1 — "Kur dar gali pritaikyti savo įgūdžius":
          real adjacent professional directions from the worker's held skills,
          in the main flow after the profile/readiness block and before the
          (folded) job-opportunity stream. Server-computed + localized; honest
          limitation state; no fake list. */}
      {opportunityDirections ? (
        <OpportunityDirectionsCard
          directions={opportunityDirections.directions}
          limitationState={opportunityDirections.limitationState}
        />
      ) : null}

      {/* Everything informational, collapsed by default (compact home v1).
          All sections still server-render with real data — the fold is
          presentation only. */}
      <DashboardMoreSection>
        {/* "Man tinkantys darbai" — top 3 recommendations from the ONE
            request-cached read model (same PR4 engine as the board). §19
            basis form on every row; honest empty state; renders nothing
            while the gated worker-visibility RPC is unapplied. The module
            grid above carries the new-job-matches badge from the spine. */}
        <JobRecommendationsCard locale={locale} />

        {/* Market context (Contextual Intelligence UI v1): the worker's own
            salary-vs-benchmark trust card, or its honest unavailable state.
            Suspense so the intelligence read STREAMS instead of blocking the
            whole overview flush (Wagon 2). */}
        <Suspense
          fallback={
            <div
              className="card-border h-36 animate-pulse"
              data-testid="hub-intelligence-loading"
              aria-hidden
            />
          }
        >
          <HubWorkerIntelligence locale={locale} />
        </Suspense>

        {/* Privacy status — always rendered, never blocking (consent v1):
            shows whether employers can find this profile + the one link to
            the canonical privacy screen. Default state = not visible. */}
        <PrivacyStatusCard />

        {/* Secondary hub cards (primary-action hierarchy v1): the SAME card
            components the hub renders, moved here by REAL state — a company
            or project card without real data (status !== "ready") and the
            market-map preview (three other doors exist: nav Žemėlapis, the
            grid tile, the map page itself). Every door and honest empty
            state survives, one tap away — nothing is deleted. */}
        {hubVm.company.status !== "ready" ? (
          <PremiumHubCompanyCard company={hubVm.company} />
        ) : null}
        {hubVm.project.status !== "ready" ? (
          <PremiumHubProjectCard project={hubVm.project} />
        ) : null}
        <PremiumHubMarketMap market={hubVm.market} />
      </DashboardMoreSection>

      {/* Universal command finder (WAGON 3) — type a normal term ("cv",
          "žurnalas", "kainos"), get the right EXISTING page. Registry-only
          results, audience-filtered from server-derived signals. */}
      <CommandFinder />
      {/* Compact space chip last — one line naming the active workspace.
          The "Kas ką gerina" explainer block is retired from the home
          (owner UX recovery v1: explanation noise out, actions stay). */}
      <CurrentSpaceHeader role={role} />
    </div>
  );
}