import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { getDemandDraftCounts } from "@/lib/demand/demand-drafts";
import { listRequestsForAdminReview } from "@/lib/buyer/admin-request-review";
import { getFollowUpQueue } from "@/lib/followup/follow-up-tasks";
import { getLeadIntakeOverview } from "@/lib/sales/lead-intake";
import { getLaunchSignals } from "@/lib/admin/launch-signals";
import { AdminLaunchBoard } from "@/components/app/admin-launch-board";
import { FollowUpQueuePanel } from "@/components/app/follow-up-queue-panel";
import { SalesIntakePanel } from "@/components/app/sales-intake-panel";
import type { AdminReviewPriorityStatus } from "@/lib/buyer/admin-review-priority";
import type { ExtractionReadiness } from "@/lib/buyer/attachment-readiness";

/** Stable display order for the file-readiness summary. */
const READINESS_KINDS: readonly ExtractionReadiness[] = [
  "future_readable_text_file",
  "future_pdf_reader_needed",
  "future_ocr_needed",
  "manual_review_only",
];

/** Priority-chip tone for the admin manual-review list. */
const REVIEW_PRIORITY_CHIP: Record<AdminReviewPriorityStatus, string> = {
  review_ready:
    "rounded-full bg-state-success/15 px-2 py-0.5 text-meta text-state-success",
  manual_review_needed:
    "rounded-full bg-brand-blue/15 px-2 py-0.5 text-meta text-brand-blue",
  missing_description:
    "rounded-full bg-state-warning/15 px-2 py-0.5 text-meta text-state-warning",
  missing_files:
    "rounded-full bg-ink-700/40 px-2 py-0.5 text-meta text-text-muted",
};

/**
 * Type-escape for the `profile_skill_claims` table — the generated `Database`
 * type doesn't carry it until `pnpm db:types` re-runs against prod. Same
 * pattern as `lib/profile/profile-skill-claims.ts`.
 */
function claims(supabase: SupabaseClient) {
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from("profile_skill_claims");
}

/**
 * Owner / Operations Control Room.
 *
 * One coherent control surface, not a flat grid of equal tiles. The screen
 * answers the owner's 30-second question — what is the state of the system,
 * what needs action now, and where do I go to act — in three bands:
 *   1. Overview KPIs (real aggregate counts, status-framed).
 *   2. Action queues (the live operational signals that need a decision).
 *   3. Control areas (grouped navigation by real purpose: People, Companies,
 *      Demand, Matching, Market signals, Quality & risk, Operations).
 *
 * Server-side gate: the admin layout runs `requireSuperadmin` for the whole
 * subtree; the per-page call here is defense-in-depth. All reads use the
 * user-scoped client — admin RLS (`is_admin()`) allows the broad SELECTs.
 * No mutations from this surface; every count is real or shown as "—".
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireSuperadmin(locale);

  const t = await getTranslations("admin");
  const tReview = await getTranslations("admin.requestReview");
  const tNeed = await getTranslations("needStructuring");
  const tPool = await getTranslations("candidatePool");
  const tLaunchReadiness = await getTranslations("adminLaunchReadiness");
  const tPipeline = await getTranslations("crmPipeline");
  const tPilots = await getTranslations("adminPilots");
  const supabase = await createClient();

  // Aggregate counts. Single head queries; admin RLS allows broad SELECT.
  const { count: profileCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  // Honest "incomplete" proxy: profiles with no profile_text yet.
  const { count: incompleteCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("profile_text", null);

  // Companies count — defensive: if the read is unavailable, render "—".
  const { count: companyCount, error: companyErr } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true });

  const { count: claimsTotal } = await claims(supabase).select("id", {
    count: "exact",
    head: true,
  });

  // Launch band signals (PR12) — real counts, unknown → null → "—".
  const launchSignals = await getLaunchSignals(supabase);

  const draftCounts = await getDemandDraftCounts();
  const draftsTotal =
    draftCounts.company_request +
    draftCounts.agency_offer +
    draftCounts.buyer_request;

  // Buyer requests needing manual review (deterministic priority).
  const adminReview = await listRequestsForAdminReview();
  const reviewRows = adminReview.kind === "ok" ? adminReview.rows : [];
  const reviewMigrationNeeded = adminReview.kind === "needs-migration";

  // Internal follow-up task queue (§8.13, branch 24). INTERNAL ONLY —
  // nothing here sends anything; pre-apply it degrades to an honest
  // "not yet available" state.
  const followUpQueue = await getFollowUpQueue();

  // Read-only sales / lead-intake overview (§8.14, branch 23). Surfaces the
  // EXISTING intake rows (leads / waitlist / customer_requests in review
  // states) — read-only, honest per-source availability, no CRM writes.
  const leadIntake = await getLeadIntakeOverview();

  // 10 most recent profile rows.
  const { data: recent } = await supabase
    .from("profiles")
    .select("id, email, full_name, active_role, profile_text, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const recentIds = (recent ?? []).map((p) => p.id);
  const claimsByProfile = new Map<string, number>();
  if (recentIds.length > 0) {
    const { data: claimRows } = await claims(supabase)
      .select("profile_id")
      .in("profile_id", recentIds);
    for (const row of (claimRows ?? []) as { profile_id: string }[]) {
      const pid = row.profile_id;
      claimsByProfile.set(pid, (claimsByProfile.get(pid) ?? 0) + 1);
    }
  }

  // Mask emails so a shared screenshot doesn't leak full addresses.
  function maskEmail(email: string | null): string {
    if (!email) return "—";
    const [name = "", domain = ""] = email.split("@");
    if (!domain) return email;
    const visible = name.slice(0, 2);
    return `${visible}${name.length > 2 ? "***" : ""}@${domain}`;
  }

  const num = (n: number | null | undefined) =>
    typeof n === "number" ? n.toLocaleString() : "—";

  type KpiTone = "neutral" | "risk";
  // Dead-UI rule D (owner smoke, 2026-07-05): every numeric card either
  // navigates to what it counts (href) or is covered by the explicit
  // monitoring-only caption under the band.
  const kpis: {
    key: string;
    label: string;
    value: string;
    tone: KpiTone;
    href?: string;
  }[] = [
    {
      key: "people",
      label: t("room.kpi.people"),
      value: num(profileCount),
      tone: "neutral",
    },
    {
      key: "peopleIncomplete",
      label: t("room.kpi.peopleIncomplete"),
      value: num(incompleteCount),
      tone: (incompleteCount ?? 0) > 0 ? "risk" : "neutral",
    },
    {
      key: "companies",
      label: t("room.kpi.companies"),
      value: companyErr ? "—" : num(companyCount),
      tone: "neutral",
    },
    {
      key: "demand",
      label: t("room.kpi.demand"),
      value: num(draftsTotal),
      tone: "neutral",
      href: "/dashboard/admin/need-structuring",
    },
    {
      key: "reviewQueue",
      label: t("room.kpi.reviewQueue"),
      value: reviewMigrationNeeded ? "—" : num(reviewRows.length),
      tone: reviewRows.length > 0 ? "risk" : "neutral",
      href: "#request-review",
    },
    {
      key: "claims",
      label: t("room.kpi.claims"),
      value: num(claimsTotal),
      tone: "neutral",
    },
  ];

  // Control-area navigation grouped by real purpose. Each link resolves to a
  // real admin (or operations) page; nothing is a decorative tile.
  type GroupLink = { href: string; label: string; testId?: string; internal?: boolean };
  const groups: {
    key: string;
    title: string;
    purpose: string;
    links: GroupLink[];
  }[] = [
    {
      key: "companies",
      title: t("room.groups.companies.title"),
      purpose: t("room.groups.companies.purpose"),
      links: [
        {
          href: "/dashboard/admin/company-verification",
          label: t("hub.companyVerification"),
          testId: "admin-tools-hub-company-verification",
        },
      ],
    },
    {
      key: "demand",
      title: t("room.groups.demand.title"),
      purpose: t("room.groups.demand.purpose"),
      links: [
        {
          href: "/dashboard/admin/need-structuring",
          label: tNeed("pageTitle"),
          testId: "admin-tools-hub-need-structuring",
        },
        {
          href: "/dashboard/admin/company-need-intakes",
          label: t("companyNeedIntakes.title"),
          testId: "admin-tools-hub-company-need-intakes",
        },
        {
          // CRM / demand pipeline (control room PR F) — one read queue over
          // every existing demand source; statuses verbatim, no mutation.
          href: "/dashboard/admin/pipeline",
          label: tPipeline("title"),
          testId: "admin-tools-hub-pipeline",
        },
      ],
    },
    {
      key: "matching",
      title: t("room.groups.matching.title"),
      purpose: t("room.groups.matching.purpose"),
      links: [
        {
          href: "/dashboard/admin/matching",
          label: t("hub.matching"),
          testId: "admin-tools-hub-matching",
        },
        {
          href: "/dashboard/admin/candidate-pool",
          label: tPool("title"),
          testId: "admin-tools-hub-candidate-pool",
        },
      ],
    },
    {
      key: "marketSignals",
      title: t("room.groups.marketSignals.title"),
      purpose: t("room.groups.marketSignals.purpose"),
      links: [
        {
          href: "/dashboard/admin/market",
          label: t("hub.market"),
          testId: "admin-tools-hub-market",
        },
        {
          href: "/dashboard/admin/league",
          label: t("hub.league"),
          testId: "admin-tools-hub-league",
        },
      ],
    },
    {
      key: "quality",
      title: t("room.groups.quality.title"),
      purpose: t("room.groups.quality.purpose"),
      links: [
        {
          href: "/dashboard/admin/launch-readiness",
          label: tLaunchReadiness("title"),
          testId: "admin-tools-hub-launch-readiness",
        },
        {
          href: "/dashboard/admin/readiness",
          label: t("hub.readiness"),
          testId: "admin-tools-hub-readiness",
        },
        {
          href: "/dashboard/admin/telemetry",
          label: t("hub.telemetry"),
          internal: true,
        },
        {
          href: "/dashboard/admin/pilots",
          label: tPilots("title"),
          testId: "admin-tools-hub-pilots",
          internal: true,
        },
        {
          href: "/dashboard/admin/language-feedback",
          label: t("hub.languageFeedback"),
        },
        {
          href: "/dashboard/admin/project-truth",
          label: t("hub.projectTruth"),
          testId: "admin-tools-hub-project-truth",
          internal: true,
        },
      ],
    },
    {
      key: "operations",
      title: t("room.groups.operations.title"),
      purpose: t("room.groups.operations.purpose"),
      links: [
        {
          href: "/dashboard/admin/support",
          label: t("hub.support"),
        },
        {
          href: "/dashboard/admin/billing",
          label: t("hub.billing"),
          testId: "admin-tools-hub-billing",
        },
        {
          href: "/dashboard/admin/agent-os",
          label: t("hub.agentOs"),
          internal: true,
        },
        {
          href: "/dashboard/communication",
          label: t("hub.communication"),
        },
        {
          // WAGON 7 — source-backed role × surface permission matrix (public
          // explanation page; the matrix section is anchored at #matrix).
          href: "/legal/data-access#matrix",
          label: t("hub.permissionMatrix"),
          testId: "admin-tools-hub-permission-matrix",
        },
      ],
    },
  ];

  // Decision-first landing (owner UX recovery v1): the queue previews the
  // TOP rows; the rest stay one tap away in a disclosure — the control
  // room summarises, it does not scroll.
  const REVIEW_PREVIEW_COUNT = 5;
  const renderReviewRow = (r: (typeof reviewRows)[number]) => {
              const hasDescription = Boolean(r.needSummary?.trim());
              const fileSummary =
                r.attachmentCount === 0
                  ? tReview("noFiles")
                  : READINESS_KINDS.filter((k) => r.fileReadiness[k] > 0)
                      .map(
                        (k) =>
                          `${tReview(`fileKinds.${k}`)}: ${r.fileReadiness[k]}`,
                      )
                      .join(" · ");
              return (
                <li
                  key={r.id}
                  className="card-border flex flex-col gap-2 p-3"
                  data-testid={`admin-request-review-row-${r.id}`}
                  data-priority={r.priority}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-text-primary">
                        {r.title}
                      </span>
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {tReview("created")}: {r.createdAt.slice(0, 10)} ·{" "}
                        {tReview("filesLabel")}: {r.attachmentCount}
                      </span>
                    </div>
                    <span className={REVIEW_PRIORITY_CHIP[r.priority]}>
                      {tReview(`priority.${r.priority}`)}
                    </span>
                  </div>
                  <p
                    className={
                      hasDescription
                        ? "line-clamp-2 text-xs text-text-secondary"
                        : "text-xs italic text-text-muted"
                    }
                  >
                    {hasDescription ? r.needSummary : tReview("noDescription")}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
                    <span className="text-text-muted">
                      {tReview("descriptionSignalHeading")}:
                    </span>
                    <span
                      className={
                        r.hasUsefulDescription
                          ? "text-state-success"
                          : "text-state-warning"
                      }
                    >
                      {r.hasUsefulDescription
                        ? tReview("descriptionSignal.present")
                        : tReview("descriptionSignal.thin")}
                    </span>
                    <span className="text-text-muted">
                      · {tReview("fileReadinessHeading")}:
                    </span>
                    <span className="text-text-secondary">{fileSummary}</span>
                  </div>
                  <p className="text-meta font-medium text-text-primary">
                    {tReview(`action.${r.priority}`)}
                  </p>
                  {/* Dead-UI P0 fix: the action queue must give a click
                      path — id-only pointer to the existing inspect page. */}
                  {r.profileId ? (
                    <Link
                      href={`/dashboard/admin/users/${r.profileId}`}
                      className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10"
                      data-testid={`admin-request-review-open-${r.id}`}
                    >
                      {tReview("openRequester")} →
                    </Link>
                  ) : null}
                </li>
              );
  };

  const renderRecentPerson = (p: NonNullable<typeof recent>[number]) => {
            const hasText = (p.profile_text ?? "").length > 0;
            const claimCount = claimsByProfile.get(p.id) ?? 0;
            return (
              <li key={p.id} className="card-border flex flex-col gap-1 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">
                    {maskEmail(p.email)}
                  </p>
                  <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {p.active_role ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  <span>
                    {t("recent.profileText")}:{" "}
                    <span
                      className={
                        hasText ? "text-state-success" : "text-text-muted"
                      }
                    >
                      {hasText ? t("recent.yes") : t("recent.no")}
                    </span>
                  </span>
                  <span>
                    {t("recent.claims")}: {claimCount}
                  </span>
                  <Link
                    href={`/dashboard/admin/users/${p.id}`}
                    className="text-brand-blue hover:underline"
                  >
                    {t("recent.inspect")}
                  </Link>
                </div>
              </li>
            );
  };

  return (
    <div className="flex flex-col gap-6" data-testid="admin-dashboard">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* BAND 1 — Overview KPIs. Real aggregate counts, status-framed. */}
      <section className="flex flex-col gap-3" data-testid="admin-overview-kpis">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("room.groups.overview.title")}
          </h2>
          <p className="text-xs text-text-secondary">
            {t("room.groups.overview.purpose")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => {
            const body = (
              <>
                <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {k.label}
                </p>
                <p
                  className={`mt-1 font-display text-2xl font-bold ${
                    k.tone === "risk"
                      ? "text-state-warning"
                      : "text-text-primary"
                  }`}
                >
                  {k.value}
                </p>
              </>
            );
            return k.href ? (
              <a
                key={k.key}
                href={k.href.startsWith("#") ? k.href : `/${locale}${k.href}`}
                className={`card-border block p-4 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${
                  k.tone === "risk" ? "border-state-warning/40" : ""
                }`}
                data-testid={`admin-kpi-${k.key}`}
                data-tone={k.tone}
              >
                {body}
              </a>
            ) : (
              <div
                key={k.key}
                className={`rounded-md border border-ink-700 bg-ink-800/20 p-4 ${
                  k.tone === "risk" ? "border-state-warning/40" : ""
                }`}
                data-testid={`admin-kpi-${k.key}`}
                data-tone={k.tone}
              >
                {body}
              </div>
            );
          })}
        </div>
        {/* Rule D: counters without a queue page are explicitly
            monitoring-only — no pretend clickability. */}
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="admin-kpi-monitoring-note"
        >
          {t("room.kpi.monitoringNote")}
        </p>
      </section>

      {/* BAND 2 — Action queues. The live operational signals that need a
          decision now (real rows; honest empty/unavailable states). */}
      <section
        id="request-review"
        className="flex flex-col gap-3 scroll-mt-20"
        data-testid="admin-request-review"
      >
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {tReview("title")}
          </h2>
          <p className="text-xs text-text-secondary">{tReview("help")}</p>
        </div>
        {reviewMigrationNeeded ? (
          <p
            className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
            data-testid="admin-request-review-migration-blocker"
          >
            {tReview("migrationBlocker")}
          </p>
        ) : reviewRows.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-500 p-3 text-xs text-text-muted">
            {tReview("empty")}
          </p>
        ) : (
            <>
            <ul
              className="flex flex-col gap-2"
              data-testid="admin-request-review-list"
            >
            {reviewRows.slice(0, REVIEW_PREVIEW_COUNT).map(renderReviewRow)}
            </ul>
            {reviewRows.length > REVIEW_PREVIEW_COUNT && (
              <details data-testid="admin-request-review-more">
                <summary className="cursor-pointer list-none py-1 text-xs font-medium text-brand-blue hover:underline">
                  {tReview("showAll", { n: reviewRows.length })}
                </summary>
                <ul className="flex flex-col gap-2 pt-2">
                  {reviewRows.slice(REVIEW_PREVIEW_COUNT).map(renderReviewRow)}
                </ul>
              </details>
            )}
            </>
        )}
      </section>

      {/* BAND 2b — Internal follow-up task queue (§8.13, branch 24). The
          platform's memory of next actions: internal only, contacts nobody. */}
      <FollowUpQueuePanel data={followUpQueue} />

      {/* BAND 2c — Read-only sales / lead-intake panel (§8.14, branch 23).
          Existing intake rows only; the only action is the reused internal
          follow-up task — nothing here contacts anyone. */}
      <SalesIntakePanel data={leadIntake} />

      <section className="flex flex-col gap-3" data-testid="admin-pilot-drafts">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("drafts.title")}
          </h2>
          <p className="text-xs text-text-secondary">{t("drafts.help")}</p>
          {/* Rule D: these are monitoring-only counts (drafts live on the
              company/buyer dashboards; no admin drafts queue exists). */}
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="admin-drafts-monitoring-note"
          >
            {t("room.kpi.monitoringNote")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card-border p-3">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("drafts.total")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftsTotal}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("drafts.byType.company")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.company_request}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("drafts.byType.agency")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.agency_offer}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("drafts.byType.buyer")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.buyer_request}
            </p>
          </div>
        </div>
      </section>

      {/* People — the recent profiles surface with inspect links. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {t("room.groups.people.title")}
          </h2>
          <p className="text-xs text-text-secondary">{t("recent.help")}</p>
        </div>
        <ul className="flex flex-col gap-2" data-testid="admin-recent-users">
          {(recent ?? []).slice(0, REVIEW_PREVIEW_COUNT).map(renderRecentPerson)}
        </ul>
        {(recent ?? []).length > REVIEW_PREVIEW_COUNT && (
          <details data-testid="admin-recent-users-more">
            <summary className="cursor-pointer list-none py-1 text-xs font-medium text-brand-blue hover:underline">
              {tReview("showAll", { n: (recent ?? []).length })}
            </summary>
            <ul className="flex flex-col gap-2 pt-2">
              {(recent ?? []).slice(REVIEW_PREVIEW_COUNT).map(renderRecentPerson)}
            </ul>
          </details>
        )}
      </section>

      {/* BAND 3 — Control areas. Grouped navigation by real purpose. Replaces
          the old flat tile grid: each area carries a one-line purpose and the
          real pages that belong to it. */}
      {/* Launch band (PR12): real launch signals + the 15-item launch board
          with proof-cited statuses (CI-guarded — no fake launch readiness). */}
      <AdminLaunchBoard signals={launchSignals} />

      <section className="flex flex-col gap-3" data-testid="admin-control-areas">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.key}
              className="card-border flex flex-col gap-3 p-4"
              data-testid={`admin-area-${g.key}`}
            >
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display text-sm font-semibold text-text-primary">
                  {g.title}
                </h3>
                <p className="text-meta text-text-muted">{g.purpose}</p>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href as "/dashboard"}
                      className="flex items-center justify-between gap-2 rounded-md border border-ink-700/60 px-3 py-2 text-xs text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
                      data-testid={l.testId}
                    >
                      <span>{l.label}</span>
                      {l.internal ? (
                        <span className="rounded-full bg-ink-700/60 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                          {t("room.internalBadge")}
                        </span>
                      ) : (
                        <span aria-hidden className="text-text-muted">
                          →
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
