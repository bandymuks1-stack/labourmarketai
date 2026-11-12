import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageBack } from "@/components/app/premium/page-back";

import { requireSuperadmin } from "@/lib/auth/superadmin";
import { listCompanyVerificationRequests } from "@/lib/admin/company-verification";
import type { CompanyVerificationStatus } from "@/lib/company/company-setup";
import {
  CompanyVerificationReview,
  type CompanyVerificationReviewLabels,
} from "@/components/app/company-verification-review";
import { PageTitle } from "@/components/app/premium/page-title";
import { dashboardPageMetadata } from "@/lib/navigation/dashboard-metadata";
import { listNeedPublicReviewQueue } from "@/lib/admin/need-public-review";
import { NeedPublicReviewControls } from "@/components/app/need-public-review-controls";

// The document title names this page (WCAG 2.4.2) — lib/navigation/dashboard-metadata.ts.
export const generateMetadata = dashboardPageMetadata("/dashboard/admin/company-verification");


/**
 * Admin-only company verification review surface.
 *
 * Server-side gate: requireSuperadmin(locale) is the FIRST awaited call — a
 * non-admin is redirected to /<locale>/dashboard before any data loads. Reads
 * via the user-scoped client (admin RLS); writes go through the admin-only
 * SECURITY DEFINER RPC via the row action component. No direct companies
 * UPDATE grant, no fake verified badge.
 */

const STATUS_TONE: Record<CompanyVerificationStatus, string> = {
  draft: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  active_unverified: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  needs_checks: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  pending_verification: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  unverified: "border-state-warning/40 bg-state-warning/5 text-state-warning",
  verified: "border-state-success/40 bg-state-success/5 text-state-success",
};

const KNOWN_REQUESTER_ROLES = ["owner", "director", "manager", "hr", "other"];

export default async function AdminCompanyVerificationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin.companyVerification");
  const tReq = await getTranslations("roleDashboards.company.setup");
  const [result, needsQueue] = await Promise.all([
    listCompanyVerificationRequests(),
    listNeedPublicReviewQueue(),
  ]);
  const tQueue = await getTranslations("admin.companyVerification.needsQueue");
  const tReadbackQ = await getTranslations("demandReadback");
  const rows = result.kind === "ok" ? result.rows : [];
  const migrationNeeded = result.kind === "needs-migration";
  const pendingCount = rows.filter(
    (r) => r.verificationStatus === "pending_verification",
  ).length;

  const reviewLabels: CompanyVerificationReviewLabels = {
    approve: t("actions.approve"),
    keepUnverified: t("actions.keepUnverified"),
    returnToPending: t("actions.returnToPending"),
    noteLabel: t("noteLabel"),
    notePlaceholder: t("notePlaceholder"),
    statusSaved: t("result.saved"),
    statusNotAdmin: t("result.notAdmin"),
    statusInvalid: t("result.invalid"),
    statusNotFound: t("result.notFound"),
    statusNeedsMigration: t("result.needsMigration"),
    statusError: t("result.error"),
    saving: t("result.saving"),
  };

  const requesterRoleLabel = (role: string | null): string => {
    if (!role) return "—";
    return KNOWN_REQUESTER_ROLES.includes(role)
      ? tReq(`requesterRoleOptions.${role}`)
      : role;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="admin-company-verification">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </p>
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        <PageBack href={"/dashboard/admin" as "/dashboard"}>{t("back")}</PageBack>
      </header>

      {/* OWNER DECISION V-1 (2026-11-12): needs of companies that are not
          verified, held by the database's one rule (need_public_state_v1).
          Approving shows a need marked "Company not confirmed" — it never
          verifies the company; verifying stays the list below. */}
      {/* Always rendered: before the V-1 migration is applied its reader
          fails and the section says it could not be read (never "empty"). */}
        <section className="flex flex-col gap-3" aria-labelledby="need-public-review-title" data-testid="need-public-review-queue">
          <h2 id="need-public-review-title" className="font-display text-base font-semibold text-text-primary">
            {tQueue("title")}
          </h2>
          <p className="text-sm text-text-secondary">{tQueue("subtitle")}</p>
          {needsQueue.kind === "error" ? (
            <p role="status" className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning">
              {tQueue("unavailable")}
            </p>
          ) : needsQueue.rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted" data-testid="need-public-review-empty">
              {tQueue("empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {needsQueue.rows.map((n) => (
                <li
                  key={n.requestId}
                  className="flex flex-col gap-2 rounded-md border border-border-default p-4"
                  data-testid={`need-public-review-row-${n.requestId}`}
                  data-state={n.state}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-text-primary">{n.roleText ?? n.title ?? "—"}</span>
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {n.companyName ?? "—"} · {[n.locationLabel, n.country].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                    <span className="rounded-sm border border-state-warning/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning">
                      {n.state === "held_incomplete" || n.state === "held_review" || n.state === "rejected"
                        ? tReadbackQ(`publicState.${n.state}`)
                        : n.state}
                    </span>
                  </div>
                  {n.reasons.length > 0 ? (
                    <p className="text-meta text-text-secondary">
                      <span className="font-mono uppercase tracking-label text-text-muted">{tQueue("reasonsLabel")}:</span>{" "}
                      {n.reasons.map((code) => tReadbackQ(`publicReason.${code}` as never)).join(", ")}
                    </p>
                  ) : null}
                  <NeedPublicReviewControls
                    requestId={n.requestId}
                    labels={{
                      approve: tQueue("approve"),
                      reject: tQueue("reject"),
                      noteLabel: t("noteLabel"),
                      saved: tQueue("saved"),
                      failed: tQueue("failed"),
                      saving: t("result.saving"),
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

      {migrationNeeded ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="admin-company-verification-migration-blocker"
        >
          {t("migrationBlocker")}
        </p>
      ) : rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="admin-company-verification-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <>
          <p className="text-xs text-text-secondary" data-testid="admin-company-verification-count">
            {t("pendingCount", { count: pendingCount })}
          </p>
          <ul className="flex flex-col gap-3" data-testid="admin-company-verification-list">
            {rows.map((r) => (
              <li
                key={r.id}
                className="card-border flex flex-col gap-3 p-4"
                data-testid={`company-verification-row-${r.id}`}
                data-status={r.verificationStatus}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {r.legalName ?? "—"}
                    </span>
                    <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("user")}: {r.userEmail ?? r.userName ?? "—"}
                    </span>
                  </div>
                  <span
                    className={`rounded-sm border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${STATUS_TONE[r.verificationStatus]}`}
                    data-testid={`company-verification-status-${r.id}`}
                  >
                    {t(`status.${r.verificationStatus}`)}
                  </span>
                </div>

                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <Field label={t("fields.country")} value={r.country} />
                  <Field label={t("fields.registrationCode")} value={r.registrationCode} />
                  <Field label={t("fields.address")} value={r.address} />
                  <Field label={t("fields.website")} value={r.website} />
                  <Field label={t("fields.contactEmail")} value={r.contactEmail} />
                  <Field label={t("fields.contactPhone")} value={r.contactPhone} />
                  <Field label={t("fields.requesterRole")} value={requesterRoleLabel(r.requesterRole)} />
                  <Field
                    label={t("fields.requestedAt")}
                    value={r.requestedAt ? r.requestedAt.slice(0, 16).replace("T", " ") : null}
                  />
                </dl>

                {r.verificationNote ? (
                  <p className="rounded-md border border-ink-600 bg-ink-800/30 px-2 py-1 text-meta text-text-secondary">
                    <span className="font-mono uppercase tracking-label text-text-muted">
                      {t("fields.note")}:
                    </span>{" "}
                    {r.verificationNote}
                  </p>
                ) : null}

                <CompanyVerificationReview
                  companyId={r.id}
                  defaultNote={r.verificationNote}
                  labels={reviewLabels}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value && value.length > 0 ? value : "—"}</dd>
    </div>
  );
}
