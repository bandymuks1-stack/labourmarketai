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
import { Link } from "@/lib/i18n/navigation";
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
import { cn } from "@/lib/utils";

// Authenticated cockpit — must never be served from a stale cache, or a logged-in
// owner can see a pre-deploy render (e.g. missing the chain action CTAs).
export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

type StageState = "done" | "current" | "todo";
type Stage = { label: string; state: StageState };

/** Cinematic journey rail — connected, animated stage map (not a flat list).
 *  Reflects the user's REAL progress; the moving gradient is decorative only,
 *  never a claim of live activity (DEMO_TO_REAL_DATA_POLICY). */
function JourneyRail({ stages, label }: { stages: Stage[]; label: string }) {
  const last = stages.length - 1;
  // Mobile-first room polish: on phones a row of N labelled circles reads like
  // a compressed desktop stepper. Keep the circles, hide the per-step labels on
  // mobile, and show one clear "current step" line instead.
  const currentStage = stages.find((s) => s.state === "current") ?? stages[0];
  return (
    <div className="flex flex-col gap-2">
    <nav aria-label={label} className="flex items-start">
      {stages.map((s, i) => {
        const leftActive = i > 0 && stages[i - 1].state === "done";
        const rightActive = s.state === "done";
        return (
          <div key={s.label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i === 0
                    ? "bg-transparent"
                    : leftActive
                      ? "stage-line"
                      : "bg-ink-600",
                )}
              />
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold",
                  s.state === "done"
                    ? "border-state-success/50 bg-state-success/15 text-state-success"
                    : s.state === "current"
                      ? "stage-current border-brand-orange bg-brand-orange/15 text-brand-orange"
                      : "border-ink-500 bg-ink-800 text-text-muted",
                )}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i === last
                    ? "bg-transparent"
                    : rightActive
                      ? "stage-line"
                      : "bg-ink-600",
                )}
              />
            </div>
            <span
              className={cn(
                "mt-2 hidden px-1 text-center font-mono text-[10px] uppercase leading-tight tracking-label sm:block",
                s.state === "todo" ? "text-text-muted" : "text-text-secondary",
              )}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </nav>
      {/* Mobile-only current-step line — keeps the room focused, not crammed. */}
      <p
        className="text-center font-mono text-[10px] uppercase tracking-label text-text-secondary sm:hidden"
        data-testid="journey-current-step"
      >
        {currentStage.label}
      </p>
    </div>
  );
}

/** Overview tab — the WOW Public Beta "operating cockpit". Honest signals only
 *  (real profession/skills/journal counts); no fake matching/metrics (PV §10,
 *  PRODUCT_CONSTITUTION §5/§9). Non-locking by design: the active role is the
 *  current workspace, not a permanent category (§1). The redesign turns the old
 *  static card list into an action path: journey rail → next move → readiness.
 *
 *  Personal command center: dokumentuotas pirmas sluoksnis — vizualiai bus
 *  pakeistas TASK 07 (living-arena UI po owner vizualinio užrakto); logika,
 *  sąžiningi signalai ir next-action principas lieka. */
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
  const tMap = await getTranslations("marketMap");
  const tw = await getTranslations("auth.dashboard.wow");
  const tf = await getTranslations("auth.dashboard.wow.flow");
  const tRole = await getTranslations("auth.signup.role");
  const tProf = await getTranslations("professions");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";
  // Real company existence (RLS-scoped) → drives the compact identity/action
  // entry block: company actions vs an honest "create a company" CTA. Read
  // failure / missing migration falls back to "no company" (CTA shown).
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

  // Non-locking banner — present on every role's overview.
  const StartingPoint = (
    <p className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm leading-relaxed text-text-secondary">
      {tw("startingPoint")}
    </p>
  );

  // ── Company / agency / customer: operating cockpit (define → submit need) ──
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
    // Intent-specific pilot copy: a company hiring sees hiring language, an
    // agency sees candidate-supply language — never a generic buyer "need".
    const pilotKey = intent === "hire_workers" ? "hire" : "partner";
    // Slice 1 — demand read-back for the org's own submitted requests
    // (company/agency only; the customer/buyer role has its own detailed
    // requests surface on /dashboard/buyer). Honest status only — no matching.
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
      // Submitted-detail read-back (what the owner entered, echoed from the
      // request's need_summary + payload). Honest read-back only — no matching.
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
    const stages: Stage[] = [
      { label: tf("company.c1"), state: "current" },
      { label: tf("company.c2"), state: "todo" },
      { label: tf("company.c3"), state: "todo" },
      { label: tf("company.c4"), state: "todo" },
    ];
    return (
      <div className="flex flex-col gap-7">
        {Header}
        <CurrentSpaceHeader role={role} />
        {/* Compact identity/action entry — the same Asmuo/Įmonė model from
            /dashboard/account, surfaced on the main dashboard so the user
            doesn't have to dig into account settings. */}
        <IdentityActions hasCompany={hasCompany} compact />
        {/* Entry into the live labour-market map (foundation). */}
        <Link
          href="/dashboard/market-map"
          data-testid="dashboard-market-map-link"
          className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue"
        >
          {tMap("title")}
          <span aria-hidden className="text-brand-blue">→</span>
        </Link>

        {/* G — company/agency calming pass: a single calm, human framing line
            (copy-only, no structural change), mirroring the worker foundationNote.
            One clear next step at a time; honest status, never fabricated demand. */}
        <p
          className="-mt-3 text-[11px] leading-relaxed text-text-muted"
          data-testid="company-calm-note"
        >
          {tf("company.calmNote")}
        </p>

        {/* The single, clear primary action for this role/state (data-driven:
            entries waiting → review; nothing waiting → invite/open team). The
            chain-actions grid below is the secondary "all steps" index. */}
        <DashboardNextAction
          action={nextAction}
          counts={{ pending: pendingReview }}
        />

        {/* Secondary — the full set of chain entry points
            (invite worker / enable review / review entries). */}
        <DashboardChainActions role={role} />
        <WorkerInvitationsCard />

        {StartingPoint}

        <JourneyRail stages={stages} label={tf("company.eyebrow")} />
        <p className="text-[11px] leading-relaxed text-text-muted" data-testid="journey-progress-helper">
          {tw("pilot.progressHelper")}
        </p>

        {/* Demand intake — one clear purpose: create a structured work need
            (a canonical customer_request, status='submitted'). The title +
            body are intent-specific (hiring company vs agency offer) so the
            screen never reads as a vague "activity space". No sweeping overlay
            (the wow-card sheen was removed — it read as a broken band over the
            form on mobile). The numbered steps are a REAL form wizard below. */}
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

        {demandReadback && (
          <DemandRequestsReadback result={demandReadback} labels={readbackLabels} />
        )}

        {/* Room-based IA (PR #204 review): the all-roles catalogue and the
            cross-space "coming later" module grid no longer live in the active
            space. They moved to /dashboard/account → "Mano erdvės / My spaces",
            so this room shows only what belongs to the current space. */}
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

  // ── "Mano darbo kortelė" — state-aware continuity (slice
  // work-card-state-aware-v1). The card decides new/returning/stale from the
  // worker's REAL saved data and shows ONE best next action; it never re-asks a
  // saved dimension and never restarts onboarding on a returning login. ──
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
      {/* Compact identity/action entry — same Asmuo/Įmonė model as
          /dashboard/account, surfaced on the main dashboard. */}
      <IdentityActions hasCompany={hasCompany} compact />
      {/* Entry into the live labour-market map (foundation). */}
      <Link
        href="/dashboard/market-map"
        data-testid="dashboard-market-map-link"
        className="flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue"
      >
        {tMap("title")}
        <span aria-hidden className="text-brand-blue">→</span>
      </Link>

      {/* "Šiandienos ekranas" (TASK 07 / DESIGN_SOUL) — today's ONE action,
          this week's confirmed work, one honest growth path, and the premium
          scouting player card. Real journal-chain data only. */}
      <TodayScreen workerId={workerRow?.id ?? null} locale={locale} />

      {/* "Mano darbo kortelė" — the state-aware entry. It owns the greeting,
          the what's-clear / what's-missing summary, the ONE best next action
          (+ why it helps), the small "Ar tai vis dar galioja?" confirmation
          when data is stale, and the secondary/collapsed editor. */}
      <WorkCard data={cardData} />
      <WorkerInvitationsCard />

      {/* First-use guidance appears ONLY while the person is still starting
          (no profession or no entries yet) — a gentle path, not a permanent
          panel. The profile/journal/account doors live in the primary nav
          (Mano erdvė / Darbo kortelė / Įrodymai / Mano paskyra), so the
          dashboard keeps no duplicate card wall — just the work card itself. */}
      {isFirstUse && (
        <DashboardFirstUsePanel variant="full" showCtas={false} />
      )}
    </div>
  );
}
