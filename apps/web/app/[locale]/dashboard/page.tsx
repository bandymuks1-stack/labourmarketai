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
import { ActionCard } from "@/components/app/action-card";
import { MyZone, MyZoneImproves } from "@/components/app/my-zone";
import { getOwnCompany } from "@/lib/company/company-setup";
import { getOwnAvatar } from "@/lib/profile/avatar";
import { WorkCard } from "@/components/app/work-card";
import { TelemetryView } from "@/components/app/telemetry-view";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { getWorkerCard } from "@/lib/worker/work-card";
import {
  getBookingResponsesNewCount,
  getPendingIncomingBookingCount,
} from "@/lib/booking/booking-actions";
import {
  getPendingIncomingRequestCount,
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
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import { type Role } from "@/lib/auth/actions";
import { PremiumHubScreen } from "@/components/app/premium-hub/premium-hub-screen";
import { getPremiumHubViewModel } from "@/components/app/premium-hub/premium-hub-data";

// Authenticated cockpit — must never be served from a stale cache, or a logged-in
// owner can see a pre-deploy render (e.g. missing the chain action CTAs).
export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

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

  // Consolidation v1: /dashboard now LEADS with the premium hub (the canonical
  // visual surface — the former /dashboard/hub is removed). Kick the hub's own
  // RLS-scoped reads off in parallel with the overview's reads so it adds no
  // serial latency; it is awaited once, just before the role branch.
  const hubVmPromise = getPremiumHubViewModel();

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role, full_name, email")
    .eq("id", user.id)
    .single();

  const t = await getTranslations("auth.dashboard");
  const tw = await getTranslations("auth.dashboard.wow");
  const tf = await getTranslations("auth.dashboard.wow.flow");
  const tRole = await getTranslations("auth.signup.role");
  const tProf = await getTranslations("professions");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";

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
  // Real company existence (RLS-scoped) → drives the focused identity entry:
  // company actions vs an honest "create a company" CTA. Read failure / missing
  // migration falls back to "no company" (CTA shown).
  const companyRead = await getOwnCompany();
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
  // Fetched ONCE here: the state-driven top slot needs the count and the
  // invitations card needs the rows (passed down as `preloaded`).
  const invitations = await listMyPendingWorkerInvitations();
  const pendingServiceRequests = await getPendingIncomingRequestCount();
  // "New since last seen" markers — a real OTHER-party update after this user last
  // opened /dashboard/service-requests. 0 when never opened (seen_at null) or the
  // seen RPC is not applied yet (rollout-safe). Never my own action, never faked.
  const { providerNew, buyerNew } = await getServiceRequestsNewCounts();
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
  const outgoingSummary = await getOutgoingRequestSummary();
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
  const bookingResponsesNew = await getBookingResponsesNewCount();
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

  // Always-visible marketplace access. The two halves of the service loop are
  // otherwise only reachable through the count-gated action cards above — and
  // /dashboard/services (where a provider publishes an offering) had NO UI entry
  // at all. This calm, low-emphasis block (never an urgent badge, never a fake
  // count) gives a first-time provider a path to publish and a first-time buyer a
  // path to discover, closing the loop's reachability gap. Real navigation only.
  const marketplaceAccess = (
    <section
      data-testid="dashboard-marketplace-access"
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
    >
      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {tMarket("hubTitle")}
      </span>
      {/* Shared ActionCard pattern (audit PR8) — same visual grammar as the
          MyZone grid, so "tap to go do" reads identically everywhere. */}
      <div className="grid gap-2 sm:grid-cols-2">
        <ActionCard
          href="/dashboard/services"
          testid="dashboard-marketplace-offer"
          title={tMarket("hubOffer")}
          description={tMarket("hubOfferNote")}
        />
        <ActionCard
          href="/dashboard/service-requests"
          testid="dashboard-marketplace-find"
          title={tMarket("hubFind")}
          description={tMarket("hubFindNote")}
        />
        {/* Bridge v1 (§17.2 first bridge): the demand entry point joins the
            hub so both halves of the ONE supply/demand system are reachable
            from one place. Worker-only — opportunities is the worker's
            demand-consumption surface; org roles post demand through the
            demand-intake section on their own dashboard. Labels stay
            distinct per concept-map-v1 (no naming merge — owner decision). */}
        {role === "worker" && (
          <ActionCard
            href="/dashboard/opportunities"
            testid="dashboard-marketplace-opportunities"
            title={tMarket("hubOpportunities")}
            description={tMarket("hubOpportunitiesNote")}
          />
        )}
      </div>
    </section>
  );

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
    let pendingReview = 0;
    if (role === "company" || role === "agency") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: idRows } = await (supabase as any).rpc(
        "reviewable_journal_entry_ids",
      );
      if (Array.isArray(idRows)) pendingReview = idRows.length;
    }
    const nextAction: NextAction =
      role === "company" || role === "agency"
        ? managerNextAction(role, pendingReview)
        : customerNextAction();

    const intent = role === "agency" ? "partner" : "hire_workers";
    // Intent-specific copy: a company hiring sees hiring language, an agency sees
    // candidate-supply language — never a generic buyer "need".
    const pilotKey = intent === "hire_workers" ? "hire" : "partner";
    // Demand read-back for the org's own submitted requests (company/agency
    // only; the customer/buyer role has its own detailed requests surface on
    // /dashboard/buyer). Honest status only — no matching.
    const showDemandReadback = role === "company" || role === "agency";
    const demandReadback = showDemandReadback
      ? await listOwnCustomerRequests()
      : null;
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

        {/* Canonical premium hub — the real-data snapshot leads the one
            dashboard (consolidation v1). Embedded = no competing page title;
            the greeting Header above is the page heading. The action-first
            content below keeps its audited order. */}
        <PremiumHubScreen vm={hubVm} embedded />

        {/* Audit PR6 org-branch order: the single data-driven primary action
            FIRST (entries waiting → review; nothing waiting → invite/open
            team; a buyer → their requests room), then real pending-state
            alerts, then chain actions / identity, then the demand intake
            (previously position 11), explainers last. */}
        <DashboardNextAction
          action={nextAction}
          counts={{ pending: pendingReview }}
        />

        {/* Real pending states — provider inbox, own outgoing requests,
            booking responses. Count-gated, never fake. */}
        {serviceRequestsNextAction}
        {outgoingRequestsNextAction}
        {bookingResponsesNextAction}

        {/* Secondary — the role's chain entry points. */}
        <DashboardChainActions role={role} />
        {/* Active-role focus: only this role's identity actions on the first
            screen; the other identity stays reachable via Manage spaces. */}
        <IdentityActions
          hasCompany={hasCompany}
          companyName={companyName}
          compact
          focusRole={role}
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
            </section>
            <p
              className="text-[11px] leading-relaxed text-text-muted"
              data-testid="journey-progress-helper"
            >
              {tw("pilot.progressHelper")}
            </p>
          </>
        )}

        {demandReadback && (
          <DemandRequestsReadback result={demandReadback} labels={readbackLabels} locale={locale} />
        )}

        <WorkerInvitationsCard preloaded={invitations} />

        {/* Always-on access to both halves of the service loop (publish / discover). */}
        {marketplaceAccess}

        {/* Explainers last (audit PR6): help must never render above action. */}
        <CurrentSpaceHeader role={role} />
        {/* Universal command finder (WAGON 3) — type a normal term, get the
            right EXISTING page. Registry-only results, audience-filtered. */}
        <CommandFinder />
      </div>
    );
  }

  // ── Worker: "Mano darbo kortelė" — state-aware personal entry ──
  let professionName: string | null = null;
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
    if (slug) professionName = tProf(slug);
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
  // Owner's consented avatar (existing RLS-scoped read) for the canonical Player
  // Card identity header on the dashboard work card (PR-D1 variant adoption).
  const workerAvatar = await getOwnAvatar();

  // Booking next-action: surface ONLY when there is a REAL pending incoming
  // booking count (> 0). 0 on any missing-data state → no card, no fake badge.
  // Bookings are not a primary nav item; their home is Žinutės (this card just
  // links there / to the bookings detail).
  const tBookings = await getTranslations("bookings");
  const pendingBookings = await getPendingIncomingBookingCount();

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

      {/* Canonical premium hub — the real-data snapshot leads the one
          dashboard (consolidation v1). Embedded = no competing page title.
          The action-first control room below keeps its audited order. */}
      <PremiumHubScreen vm={hubVm} embedded />

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

      {/* "Mano darbo kortelė" — the state-aware status: what's clear / what's
          missing + the ONE best next action (+ why it helps). Real data only.
          Collapses to its hero when the top slot carries a stronger card.
          Anchored so the profile hub's availability pillar can deep-link the
          ONE canonical editor (PR9) — no duplicate editing surface. */}
      <div id="work-card">
        <WorkCard
          data={cardData}
          avatarUrl={workerAvatar.signedUrl}
          compact={topSlotCard !== null}
        />
      </div>

      {/* The action-first control room: readiness + fast actions. The
          "what improves what" explainer is demoted below (help ≠ action).
          `incomplete` is the real first-use state (no profession or no
          entries yet); company actions appear only when a real company exists. */}
      <MyZone hasCompany={hasCompany} incomplete={isFirstUse} improves={false} />

      {/* Remaining real pending states — everything the top slot did NOT
          promote, same honest count-gated cards as before. */}
      {topSlot !== "invitation" && <WorkerInvitationsCard preloaded={invitations} />}
      {topSlot !== "incoming_booking" && bookingsPendingNextAction}
      {topSlot !== "incoming_service_request" && serviceRequestsNextAction}
      {topSlot !== "accepted_request" && outgoingRequestsNextAction}
      {topSlot !== "booking_response" && bookingResponsesNextAction}

      {/* Always-on access to both halves of the service loop (publish / discover). */}
      {marketplaceAccess}

      {/* ── Explainers last (audit PR6): help must never render above action. ── */}
      <MyZoneImproves />
      <CurrentSpaceHeader role={role} />

      {/* Universal command finder (WAGON 3) — type a normal term ("cv",
          "žurnalas", "kainos"), get the right EXISTING page. Registry-only
          results, audience-filtered from server-derived signals. */}
      <CommandFinder />
    </div>
  );
}