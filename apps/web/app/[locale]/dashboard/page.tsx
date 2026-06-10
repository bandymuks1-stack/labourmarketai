import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DemandRequestButton } from "@/components/app/demand-request-button";
import { DemandRequestsReadback } from "@/components/app/demand-requests-readback";
import { DashboardFirstUsePanel } from "@/components/app/dashboard-first-use-panel";
import { WorkerInvitationsCard } from "@/components/app/worker-invitations-card";
import { DashboardChainActions } from "@/components/app/dashboard-chain-actions";
import { DashboardNextAction } from "@/components/app/dashboard-next-action";
import { CurrentSpaceHeader } from "@/components/app/current-space-header";
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
  const tw = await getTranslations("auth.dashboard.wow");
  const tf = await getTranslations("auth.dashboard.wow.flow");
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
            <DemandRequestButton intent={intent} />
          </div>
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
