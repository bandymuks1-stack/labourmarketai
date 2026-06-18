import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DemandRequestButton } from "@/components/app/demand-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { DashboardFirstUsePanel } from "@/components/app/dashboard-first-use-panel";
import { WorkerInvitationsCard } from "@/components/app/worker-invitations-card";
import { DashboardChainActions } from "@/components/app/dashboard-chain-actions";
import { DashboardNextAction } from "@/components/app/dashboard-next-action";
import { CurrentSpaceHeader } from "@/components/app/current-space-header";
import { IdentityActions } from "@/components/app/identity-actions";
import { MyWorkView } from "@/components/app/my-work-view";
import { getOwnCompany } from "@/lib/company/company-setup";
import { TodayScreen } from "@/components/app/today/today-screen";
import { WorkCard } from "@/components/app/work-card";
import { getWorkerCard } from "@/lib/worker/work-card";
import { createClient } from "@/lib/supabase/server";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
import {
  managerNextAction,
  customerNextAction,
  type NextAction,
} from "@/lib/dashboard/next-action";
import { type Role } from "@/lib/auth/actions";

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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

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
  // Real company existence (RLS-scoped) → drives the focused identity entry:
  // company actions vs an honest "create a company" CTA. Read failure / missing
  // migration falls back to "no company" (CTA shown).
  const companyRead = await getOwnCompany();
  const hasCompany = companyRead.kind === "ok" && companyRead.row !== null;
  const name =
    profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : "");

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
      empty: tReadback("empty"),
      created: tReadback("created"),
      status: {
        draft: tReqStatus("draft"),
        submitted: tReqStatus("submitted"),
        in_review: tReqStatus("in_review"),
        needs_followup: tReqStatus("needs_followup"),
        approved: tReqStatus("approved"),
        closed: tReqStatus("closed"),
      },
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
      <div className="flex flex-col gap-7">
        {Header}
        <CurrentSpaceHeader role={role} />
        {/* Active-role focus: only this role's identity actions on the first
            screen; the other identity stays reachable via Manage spaces. */}
        <IdentityActions hasCompany={hasCompany} compact focusRole={role} />

        {/* The single, clear primary action for this role/state (data-driven:
            entries waiting → review; nothing waiting → invite/open team; a
            buyer → their requests room). */}
        <DashboardNextAction
          action={nextAction}
          counts={{ pending: pendingReview }}
        />

        {/* Secondary — the role's chain entry points. */}
        <DashboardChainActions role={role} />
        <WorkerInvitationsCard />

        {/* Company / agency: create a structured work need (hire / partner).
            A buyer/customer leads with their own request room (next action
            above → /dashboard/buyer), so no hiring intake is shown to them. */}
        {role !== "customer" && (
          <>
            <p
              className="text-[11px] leading-relaxed text-text-muted"
              data-testid="journey-progress-helper"
            >
              {tw("pilot.progressHelper")}
            </p>
            <section
              className="card-border flex flex-col gap-5 p-6 sm:p-8"
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
          </>
        )}

        {demandReadback && (
          <DemandRequestsReadback result={demandReadback} labels={readbackLabels} />
        )}
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

  return (
    <div className="flex flex-col gap-7">
      {/* Space identity + the calm doorway to other spaces (My spaces). */}
      <CurrentSpaceHeader role={role} />
      {/* Active-role focus: the person's own quick actions only — no company
          create / cockpit clutter on a job-seeker's first screen. */}
      <IdentityActions hasCompany={hasCompany} compact focusRole={role} />
      {/* My Work View cockpit — the first authenticated workspace: connects
          profile, CV, skills, evidence, availability, work journal, work needs
          and the Labour Market World Map into one operational board with next
          actions (replaces the standalone market-map link). */}
      <MyWorkView />

      {/* "Šiandienos ekranas" — today's ONE action, this week's confirmed work,
          one honest growth path. Real journal-chain data only. */}
      <TodayScreen workerId={workerRow?.id ?? null} locale={locale} />

      {/* "Mano darbo kortelė" — the state-aware entry. It owns the greeting,
          the what's-clear / what's-missing summary, the ONE best next action
          (+ why it helps), the small "Ar tai vis dar galioja?" confirmation
          when data is stale, and the secondary/collapsed editor. */}
      <WorkCard data={cardData} />
      <WorkerInvitationsCard />

      {/* First-use guidance appears ONLY while the person is still starting
          (no profession or no entries yet) — a gentle path, not a permanent
          panel. The profile/journal/account doors live in the primary nav, so
          the dashboard keeps no duplicate card wall — just the work card. */}
      {isFirstUse && (
        <DashboardFirstUsePanel variant="full" showCtas={false} />
      )}
    </div>
  );
}