import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { listCompanyVerificationRequests } from "@/lib/admin/company-verification";
import type { CompanyVerificationStatus } from "@/lib/company/company-setup";
import {
  CompanyVerificationReview,
  type CompanyVerificationReviewLabels,
} from "@/components/app/company-verification-review";

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
  const result = await listCompanyVerificationRequests();
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
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
        <Link
          href={"/dashboard/admin" as "/dashboard"}
          className="mt-1 self-start text-xs text-text-secondary hover:underline"
        >
          ← {t("back")}
        </Link>
      </header>

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
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t("user")}: {r.userEmail ?? r.userName ?? "—"}
                    </span>
                  </div>
                  <span
                    className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[r.verificationStatus]}`}
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
                  <p className="rounded-md border border-ink-600 bg-ink-800/30 px-2 py-1 text-[11px] text-text-secondary">
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
