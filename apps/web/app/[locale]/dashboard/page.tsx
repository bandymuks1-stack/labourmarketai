import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PilotRequestButton } from "@/components/app/pilot-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { DashboardFirstUsePanel } from "@/components/app/dashboard-first-use-panel";
import { FeatureAvailabilityGrid } from "@/components/app/feature-availability-grid";
import { RoleCatalogueGrid } from "@/components/app/role-catalogue-card";
import { WorkerInvitationsCard } from "@/components/app/worker-invitations-card";
import { DashboardChainActions } from "@/components/app/dashboard-chain-actions";
import { CurrentSpaceHeader } from "@/components/app/current-space-header";
import { getVisibleRoleOptions } from "@/lib/config/roles";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listOwnCustomerRequests } from "@/lib/buyer/customer-requests";
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
  return (
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
                "mt-2 px-1 text-center font-mono text-[10px] uppercase leading-tight tracking-label",
                s.state === "todo" ? "text-text-muted" : "text-text-secondary",
              )}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/** Overview tab — the WOW Public Beta "operating cockpit". Honest signals only
 *  (real profession/skills/journal counts); no fake matching/metrics (PV §10,
 *  PRODUCT_CONSTITUTION §5/§9). Non-locking by design: the active role is the
 *  current workspace, not a permanent category (§1). The redesign turns the old
 *  static card list into an action path: journey rail → next move → readiness. */
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
  const tc = await getTranslations("auth.dashboard.wow.canonical");
  const tRole = await getTranslations("auth.signup.role");
  const tProf = await getTranslations("professions");

  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";
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

  const linkCls =
    "inline-flex items-center gap-1.5 rounded-md border border-ink-500 px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue";

  // ── Company / agency / customer: operating cockpit (define → submit need) ──
  if (role !== "worker") {
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
    };
    const lanes = [
      { step: tf("company.c1"), body: tw("activity.p1") },
      { step: tf("company.c2"), body: tw("activity.p2") },
      { step: tf("company.c3"), body: tw("activity.p3") },
    ];
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

        {/* TOP priority — the real next actions for the chain
            (invite worker / accept / enable review / review entries). Placed
            first so a company/agency owner always lands on a visible CTA. */}
        <DashboardChainActions role={role} />
        <WorkerInvitationsCard />

        {StartingPoint}

        <JourneyRail stages={stages} label={tf("company.eyebrow")} />
        <p className="text-[11px] leading-relaxed text-text-muted" data-testid="journey-progress-helper">
          {tw("pilot.progressHelper")}
        </p>

        {/* Cinematic cockpit panel */}
        <section className="card-border wow-card flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
              <span className="live-dot signal-dot" aria-hidden />
              {tf("company.eyebrow")} · {tw("activity.earlyAccess")}
            </span>
            <h2 className="font-display text-2xl font-semibold tracking-tightest text-text-primary">
              {tw("activity.title")}
            </h2>
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-text-secondary">
              {tw("activity.body")}
            </p>
          </div>

          {/* Action lanes — each stage is a move, not a passive bullet */}
          <ol className="grid gap-3 sm:grid-cols-3">
            {lanes.map((l, i) => (
              <li
                key={l.step}
                className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/60 p-4"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-blue/40 bg-brand-blue/10 font-mono text-[11px] font-semibold text-brand-blue">
                  {i + 1}
                </span>
                <span className="font-display text-sm font-semibold text-text-primary">
                  {l.step}
                </span>
                <span className="text-xs leading-relaxed text-text-muted">
                  {l.body}
                </span>
              </li>
            ))}
          </ol>

          {/* Terminal action — the live, real path: submits a canonical
              customer_request (status='submitted') via submit_demand_request.
              The single demand front door (§17), not the leads pre-auth funnel. */}
          <div className="flex flex-col gap-1 border-t border-ink-600 pt-5">
            <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
              {tf("company.c4")}
            </span>
            <h3 className="font-display text-base font-semibold text-text-primary">
              {tw(`pilot.${pilotKey}.title`)}
            </h3>
            <p className="mb-3 mt-1 text-sm leading-relaxed text-text-secondary">
              {tw(`pilot.${pilotKey}.body`)}
            </p>
            <PilotRequestButton intent={intent} />
          </div>
        </section>

        {demandReadback && (
          <DemandRequestsReadback result={demandReadback} labels={readbackLabels} />
        )}

        {/* Same config-driven landscape as the worker dashboard (PR #36),
            now DEMOTED into a compact "Coming later" section so the live
            cockpit above stays dominant. Preparing cards carry no primary
            open buttons (the grid gates CTAs on isFeatureActive). */}
        <FeatureAvailabilityGrid comingLater />
      </div>
    );
  }

  // ── Worker: "work cockpit" — identity → proof → opportunities ──
  let professionName: string | null = null;
  let skillsCount = 0;
  let entriesCount = 0;
  const { data: workerRow } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (workerRow?.id) {
    // The three reads (primary profession, skill count, journal count) are
    // independent of each other; run them in parallel to cut the worker
    // overview's tail latency.
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

  const steps = [
    {
      done: !!professionName,
      title: tw("nextSteps.profession.title"),
      body: professionName
        ? tw("nextSteps.profession.bodyDone", { profession: professionName })
        : tw("nextSteps.profession.body"),
      href: "/dashboard/profile" as const,
    },
    {
      done: skillsCount > 0,
      title: tw("nextSteps.skills.title"),
      body:
        skillsCount > 0
          ? tw("nextSteps.skills.bodyDone", { n: skillsCount })
          : tw("nextSteps.skills.body"),
      href: "/dashboard/profile" as const,
    },
    {
      done: entriesCount > 0,
      title: tw("nextSteps.journal.title"),
      body:
        entriesCount > 0
          ? tw("nextSteps.journal.bodyDone", { n: entriesCount })
          : tw("nextSteps.journal.body"),
      href: "/dashboard/journal" as const,
    },
  ];

  // Higher-level journey stages (identity → proof → opportunities).
  const idDone = !!professionName && skillsCount > 0;
  const proofDone = entriesCount > 0;
  const stageDone = [idDone, proofDone, false];
  const currentStage = stageDone.findIndex((d) => !d);
  const stageState = (i: number): StageState =>
    stageDone[i] ? "done" : i === currentStage ? "current" : "todo";
  const wstages: Stage[] = [
    { label: tf("worker.s1"), state: stageState(0) },
    { label: tf("worker.s2"), state: stageState(1) },
    { label: tf("worker.s3"), state: stageState(2) },
  ];

  // The single next best action.
  const nextStep = steps.find((s) => !s.done) ?? null;

  // Phase 3: a worker is in "first-use" until they have BOTH a profession set
  // AND at least one journal entry. We show the full first-use panel during
  // that window, and switch to a compact greeting card after — never both,
  // never blank.
  const isFirstUse = !professionName || entriesCount === 0;

  return (
    <div className="flex flex-col gap-7">
      {Header}
      <CurrentSpaceHeader role={role} />


      {/* TOP priority — real chain next actions + pending invitation accept,
          placed first so the next action is always visible. */}
      <DashboardChainActions role={role} />
      <WorkerInvitationsCard />

      {professionName && (
        <p className="-mt-3 font-mono text-[11px] uppercase tracking-label text-text-muted">
          {professionName}
        </p>
      )}
      {StartingPoint}

      <DashboardFirstUsePanel variant={isFirstUse ? "full" : "compact"} />

      <JourneyRail stages={wstages} label={tf("worker.eyebrow")} />
      <p className="text-[11px] leading-relaxed text-text-muted" data-testid="journey-progress-helper">
        {tw("pilot.progressHelper")}
      </p>

      {/* ── Next move — one cinematic, guided action ── */}
      <section className="card-border wow-card flex flex-col gap-3 p-6 sm:p-7">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-orange">
          <span className="live-dot signal-dot" aria-hidden />
          {tf("worker.eyebrow")} · {tf("worker.nextMove")}
        </span>
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {nextStep ? nextStep.title : tf("worker.ready")}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {nextStep ? nextStep.body : tw("journal.body")}
        </p>
        <Link
          href={nextStep ? nextStep.href : "/dashboard/journal"}
          className="mt-1 inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5"
        >
          {nextStep ? tw("nextSteps.open") : tw("journal.cta")} →
        </Link>
      </section>

      {/* ── Two canonical surfaces — ONE entry per workflow (no duplicates) ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* A. Work Identity — the single home for profession, directions, skills, CV */}
        <section className="card-border flex flex-col gap-2 p-6">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-state-success">
            <span className="live-dot signal-dot" aria-hidden />
            {tf("worker.s1")}
          </span>
          <h2 className="font-display text-base font-semibold text-text-primary">
            {tc("identity.title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {tc("identity.body")}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-label text-text-muted">
            {professionName ?? "—"} ·{" "}
            {tw("nextSteps.skills.bodyDone", { n: skillsCount })}
          </p>
          <Link
            href="/dashboard/profile"
            className={cn(linkCls, "mt-2 self-start")}
          >
            {tc("identity.cta")} →
          </Link>
        </section>
        {/* B. Work Proof / Journal — the single home for proof entries */}
        <section className="card-border flex flex-col gap-2 p-6">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
            <span className="live-dot signal-dot" aria-hidden />
            {tf("worker.s2")}
          </span>
          <h2 className="font-display text-base font-semibold text-text-primary">
            {tc("proof.title")}
          </h2>
          <p className="text-sm leading-relaxed text-text-secondary">
            {tc("proof.body")}
          </p>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-label text-text-muted">
            {tw("nextSteps.journal.bodyDone", { n: entriesCount })}
          </p>
          <Link
            href="/dashboard/journal"
            className={cn(linkCls, "mt-2 self-start")}
          >
            {tc("proof.cta")} →
          </Link>
        </section>
      </div>

      {/* ── Activity Setup Hub link (Stage 2) ──
          Direct path into /dashboard/start where the owner can see
          real Agency / Company / Buyer state and start the first
          two end-to-end. Surfaced above the role-catalogue grid so
          it does not get buried under the "preparing" chips. */}
      <Link
        href="/dashboard/start"
        className="card-border flex items-center justify-between gap-3 px-4 py-3 hover:border-brand-blue"
        data-testid="dashboard-activity-setup-link"
      >
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
            VEIKLOS PRADŽIA
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {tw("activitySetup.title")}
          </p>
          <p className="text-xs text-text-secondary">
            {tw("activitySetup.body")}
          </p>
        </div>
        <span className="shrink-0 text-sm text-brand-blue">
          {tw("activitySetup.cta")} →
        </span>
      </Link>

      {/* ── Role expansion (non-locking, catalogue-driven) ──
          The card list is generated from `lib/config/roles.ts` via
          `getVisibleRoleOptions()`. Active roles render a navigating
          link; preparing roles render the `RUOŠIAMA` chip + reason
          and never a broken CTA. Adding a future role is a one-row
          change in the role catalogue. The small <Link> below stays
          as the explicit "go manage roles" handle into account. */}
      <RoleCatalogueGrid roles={getVisibleRoleOptions()} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-ink-500 px-4 py-3">
        <p className="text-xs leading-relaxed text-text-muted">
          {tw("addMore.body")}
        </p>
        <Link
          href="/dashboard/account"
          className={cn(linkCls, "shrink-0")}
        >
          {tw("addMore.cta")} →
        </Link>
      </div>

      {/*  Config-driven "Coming later" surface (PR #36, demoted in the
          ready-today cleanup): the central feature catalogue renders the
          PREPARING features as a compact lower section with no primary
          open buttons (the grid gates CTAs on isFeatureActive). Adding a
          future feature is a one-row change in
          lib/config/feature-availability.ts — no edits here. The active
          surfaces (profile / journal / roles) already lead the page as
          their own cards above, so they are not repeated here. */}
      <FeatureAvailabilityGrid
        comingLater
        excludeKeys={["profile_text_first", "journal_text_first"]}
      />
    </div>
  );
}
