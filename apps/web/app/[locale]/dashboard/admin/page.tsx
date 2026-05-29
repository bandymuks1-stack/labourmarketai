import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";
import { getPilotDraftCounts } from "@/lib/pilot/pilot-drafts";
import { listRequestsForAdminReview } from "@/lib/buyer/admin-request-review";
import type { AdminReviewPriorityStatus } from "@/lib/buyer/admin-review-priority";

/** Priority-chip tone for the admin manual-review list (PR B). */
const REVIEW_PRIORITY_CHIP: Record<AdminReviewPriorityStatus, string> = {
  review_ready:
    "rounded-full bg-state-success/15 px-2 py-0.5 text-[11px] text-state-success",
  manual_review_needed:
    "rounded-full bg-brand-blue/15 px-2 py-0.5 text-[11px] text-brand-blue",
  missing_description:
    "rounded-full bg-state-warning/15 px-2 py-0.5 text-[11px] text-state-warning",
  missing_files:
    "rounded-full bg-ink-700/40 px-2 py-0.5 text-[11px] text-text-muted",
};

/**
 * Type-escape for the `profile_skill_claims` table — the generated
 * `Database` type in `lib/supabase/types.ts` doesn't include the
 * table until `pnpm db:types` is re-run against prod (migration 0015
 * was applied via MCP under a timestamp version; remote and local
 * schemas drift on naming only). Same pattern used in
 * `lib/profile/profile-skill-claims.ts`.
 */
function claims(supabase: SupabaseClient) {
  return (
    supabase as unknown as {
      from: (name: string) => ReturnType<SupabaseClient["from"]>;
    }
  ).from("profile_skill_claims");
}

/**
 * Minimal pilot control surface (Work Package A4 of the controlled
 * real-user pilot readiness sprint).
 *
 * Server-side gate: `requireSuperadmin(locale)` is the first awaited
 * call; non-admins get redirected to /<locale>/dashboard before any
 * data is loaded. The page itself uses the user-scoped supabase
 * client — admin reads succeed because the `is_admin()` RLS helper
 * on `profiles` and `profile_skill_claims` returns true for users
 * with `active_role = 'admin'`.
 *
 * Surface intentionally small:
 *   - total user count;
 *   - 10 most recent profiles (anonymised to "<email mask>");
 *   - profile_text presence + profile_skill_claims count per row;
 *   - link to per-user inspect page (next iteration).
 *
 * No mutations from this surface in this PR. Deletes/edits require
 * an explicit follow-up slice with confirmation prompts + audit log.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // SECURITY: server-side gate. Returns the admin's own user.id; we
  // ignore it here (no need for it) but the call still runs and
  // redirects non-admins.
  await requireSuperadmin(locale);

  const t = await getTranslations("admin");
  const supabase = await createClient();

  // Aggregate counts. Single queries; admin RLS allows broad SELECT.
  const { count: profileCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  const { count: claimsTotal } = await claims(supabase).select("id", {
    count: "exact",
    head: true,
  });

  // Pilot-drafts metrics (added in feat/cc/pilot-draft-flows). Admin
  // RLS allows the broad SELECT via is_admin() on pilot_drafts.
  const draftCounts = await getPilotDraftCounts();
  const draftsTotal =
    draftCounts.company_request +
    draftCounts.agency_offer +
    draftCounts.buyer_request;

  // Buyer requests needing manual review (deterministic priority, PR B).
  const tReview = await getTranslations("admin.requestReview");
  const adminReview = await listRequestsForAdminReview();
  const reviewRows = adminReview.kind === "ok" ? adminReview.rows : [];
  const reviewMigrationNeeded = adminReview.kind === "needs-migration";

  // 10 most recent profile rows. Admin RLS allows SELECT on all rows.
  const { data: recent } = await supabase
    .from("profiles")
    .select("id, email, full_name, active_role, profile_text, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  // Claims-per-profile lookup for the same 10 rows.
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

  // Mask emails so the admin sees identity but the page screenshot
  // doesn't leak full addresses if shared. Format: jo***@example.com.
  function maskEmail(email: string | null): string {
    if (!email) return "—";
    const [name = "", domain = ""] = email.split("@");
    if (!domain) return email;
    const visible = name.slice(0, 2);
    return `${visible}${name.length > 2 ? "***" : ""}@${domain}`;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="admin-dashboard">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {/* Agent OS + telemetry + language-feedback hub (v1). The pages
          themselves are gated by requireSuperadmin AND admin-only RLS. */}
      <section className="flex flex-wrap gap-3" data-testid="admin-tools-hub">
        <Link
          href="/dashboard/admin/project-truth"
          className="rounded-md border border-brand-orange/60 px-4 py-2 text-xs font-medium text-brand-orange hover:border-brand-orange hover:text-text-primary"
          data-testid="admin-tools-hub-project-truth"
        >
          Project truth · P0
        </Link>
        <Link
          href="/dashboard/admin/agent-os"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("hub.agentOs")}
        </Link>
        <Link
          href="/dashboard/admin/pilot-telemetry"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("hub.telemetry")}
        </Link>
        <Link
          href="/dashboard/admin/language-feedback"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("hub.languageFeedback")}
        </Link>
        <Link
          href="/dashboard/communication"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("hub.communication")}
        </Link>
        <Link
          href="/dashboard/admin/support"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("hub.support")}
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("metric.totalUsers")}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">
            {profileCount ?? 0}
          </p>
        </div>
        <div className="card-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("metric.totalClaims")}
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">
            {claimsTotal ?? 0}
          </p>
        </div>
      </section>

      <section
        className="flex flex-col gap-3"
        data-testid="admin-pilot-drafts"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("drafts.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("drafts.help")}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("drafts.total")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftsTotal}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("drafts.byType.company")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.company_request}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("drafts.byType.agency")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.agency_offer}
            </p>
          </div>
          <div className="card-border p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("drafts.byType.buyer")}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-text-primary">
              {draftCounts.buyer_request}
            </p>
          </div>
        </div>
      </section>

      <section
        className="flex flex-col gap-3"
        data-testid="admin-request-review"
      >
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {tReview("title")}
        </h2>
        <p className="text-xs text-text-secondary">{tReview("help")}</p>
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
          <ul className="flex flex-col gap-2" data-testid="admin-request-review-list">
            {reviewRows.map((r) => {
              const hasDescription = Boolean(r.needSummary?.trim());
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
                      <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
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
                  <p className="text-[11px] text-text-secondary">
                    {tReview(`action.${r.priority}`)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("recent.title")}
        </h2>
        <p className="text-xs text-text-secondary">{t("recent.help")}</p>
        <ul className="flex flex-col gap-2" data-testid="admin-recent-users">
          {(recent ?? []).map((p) => {
            const hasText = (p.profile_text ?? "").length > 0;
            const claims = claimsByProfile.get(p.id) ?? 0;
            return (
              <li key={p.id} className="card-border flex flex-col gap-1 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">
                    {maskEmail(p.email)}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {p.active_role ?? "—"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  <span>
                    {t("recent.profileText")}:{" "}
                    <span
                      className={
                        hasText
                          ? "text-state-success"
                          : "text-text-muted"
                      }
                    >
                      {hasText ? t("recent.yes") : t("recent.no")}
                    </span>
                  </span>
                  <span>
                    {t("recent.claims")}: {claims}
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
          })}
        </ul>
      </section>
    </div>
  );
}
