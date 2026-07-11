import { setRequestLocale, getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import {
  listCompanyNeedIntakes,
  type CompanyNeedIntakeStatus,
} from "@/lib/admin/company-need-intakes";
import {
  CompanyNeedIntakeStatusControl,
  type CompanyNeedIntakeStatusLabels,
} from "@/components/app/company-need-intake-status";

/**
 * Public Intake Owner Queue v1.
 *
 * Minimal owner/internal surface for the anonymous public `/company-need`
 * submissions persisted in `company_need_public_intakes` (PR #678). Lists the
 * submitted needs, shows every core field, and lets an operator move each one
 * through new → contacted → qualified → rejected.
 *
 * Server-side gate: the admin layout runs `requireSuperadmin` for the whole
 * `/dashboard/admin/*` subtree; the per-page call here is defense-in-depth.
 * The data service adds a THIRD gate (isSuperadmin) because it reads via the
 * service role. Public/anonymous users cannot read, list, update, or delete
 * intakes — nothing in this feature adds an anon/authenticated policy or grant.
 * No outbound send of any kind.
 */

const STATUS_TONE: Record<CompanyNeedIntakeStatus, string> = {
  new: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  contacted: "border-brand-blue/40 bg-brand-blue/5 text-brand-blue",
  qualified: "border-state-success/40 bg-state-success/5 text-state-success",
  rejected: "border-state-warning/40 bg-state-warning/5 text-state-warning",
};

export default async function AdminCompanyNeedIntakesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);

  const t = await getTranslations("admin.companyNeedIntakes");
  const tPipeline = await getTranslations("crmPipeline");
  const result = await listCompanyNeedIntakes();
  const rows = result.kind === "ok" ? result.rows : [];
  const newCount = rows.filter((r) => r.status === "new").length;

  const statusLabels: CompanyNeedIntakeStatusLabels = {
    actions: {
      new: t("actions.new"),
      contacted: t("actions.contacted"),
      qualified: t("actions.qualified"),
      rejected: t("actions.rejected"),
    },
    statusSaved: t("result.saved"),
    statusNotAdmin: t("result.notAdmin"),
    statusInvalid: t("result.invalid"),
    statusNotFound: t("result.notFound"),
    statusNeedsMigration: t("result.needsMigration"),
    statusError: t("result.error"),
  };

  const urgencyLabel = (v: string | null): string | null =>
    v && ["asap", "weeks", "flexible"].includes(v)
      ? t(`urgencyValue.${v}`)
      : v;
  const accommodationLabel = (v: string | null): string | null =>
    v &&
    ["provided_free", "provided_paid", "provided_deducted", "not_provided"].includes(
      v,
    )
      ? t(`accommodationValue.${v}`)
      : v;
  const engagementLabel = (v: string | null): string | null =>
    v && ["employment", "subcontracting", "agency_supply"].includes(v)
      ? t(`engagementValue.${v}`)
      : v;

  return (
    <div className="flex flex-col gap-6" data-testid="admin-company-need-intakes">
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
        {/* Control room PR F — these rows also appear in the consolidated
            demand pipeline read view (read-only; statuses change here). */}
        <Link
          href={"/dashboard/admin/pipeline" as "/dashboard"}
          className="self-start text-xs text-brand-blue hover:underline"
          data-testid="company-need-intakes-view-pipeline"
        >
          {tPipeline("viewPipeline")} →
        </Link>
      </header>

      {result.kind === "not-admin" ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="admin-company-need-intakes-not-admin"
        >
          {t("notAdmin")}
        </p>
      ) : result.kind === "needs-migration" ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="admin-company-need-intakes-migration-blocker"
        >
          {t("migrationBlocker")}
        </p>
      ) : result.kind === "error" ? (
        <p
          className="rounded-md border border-state-warning bg-state-warning/10 px-3 py-2 text-xs text-state-warning"
          data-testid="admin-company-need-intakes-error"
        >
          {t("migrationBlocker")}
        </p>
      ) : rows.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-muted"
          data-testid="admin-company-need-intakes-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <>
          <p
            className="text-xs text-text-secondary"
            data-testid="admin-company-need-intakes-count"
          >
            {t("newCount", { count: newCount })}
          </p>
          <ul
            className="flex flex-col gap-3"
            data-testid="admin-company-need-intakes-list"
          >
            {rows.map((r) => (
              <li
                key={r.id}
                className="card-border flex flex-col gap-3 p-4"
                data-testid={`company-need-intake-row-${r.id}`}
                data-status={r.status}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {r.companyName ?? "—"}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {t("fields.created")}:{" "}
                      {r.createdAt.slice(0, 16).replace("T", " ")}
                      {r.locale ? ` · ${r.locale.toUpperCase()}` : ""}
                    </span>
                  </div>
                  <span
                    className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-label ${STATUS_TONE[r.status]}`}
                    data-testid={`company-need-intake-status-chip-${r.id}`}
                  >
                    {t(`status.${r.status}`)}
                  </span>
                </div>

                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <Field label={t("fields.contactName")} value={r.contactName} />
                  <Field label={t("fields.email")} value={r.contactEmail} />
                  <Field label={t("fields.phone")} value={r.contactPhone} />
                  <Field label={t("fields.country")} value={r.country} />
                  <Field label={t("fields.cityRegion")} value={r.cityOrRegion} />
                  <Field label={t("fields.sector")} value={r.sector} />
                  <Field
                    label={t("fields.headcount")}
                    value={r.headcount != null ? String(r.headcount) : null}
                  />
                  <Field label={t("fields.startWindow")} value={r.startWindow} />
                  <Field
                    label={t("fields.duration")}
                    value={r.expectedDuration}
                  />
                  <Field
                    label={t("fields.urgency")}
                    value={urgencyLabel(r.urgency)}
                  />
                  <Field
                    label={t("fields.accommodation")}
                    value={accommodationLabel(r.accommodation)}
                  />
                  <Field
                    label={t("fields.transport")}
                    value={
                      r.transportNeeded == null
                        ? null
                        : r.transportNeeded
                          ? t("transportValue.yes")
                          : t("transportValue.no")
                    }
                  />
                  <Field label={t("fields.languages")} value={r.languages} />
                  <Field
                    label={t("fields.engagement")}
                    value={engagementLabel(r.engagementType)}
                  />
                  <Field label={t("fields.sourcePath")} value={r.sourcePath} />
                </dl>

                {r.description ? (
                  <p className="whitespace-pre-wrap rounded-md border border-ink-600 bg-ink-800/30 px-2 py-1 text-[11px] leading-relaxed text-text-secondary">
                    <span className="font-mono uppercase tracking-label text-text-muted">
                      {t("fields.description")}:
                    </span>{" "}
                    {r.description}
                  </p>
                ) : null}

                <CompanyNeedIntakeStatusControl
                  intakeId={r.id}
                  current={r.status}
                  labels={statusLabels}
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
      <dd className="text-text-primary">
        {value && value.length > 0 ? value : "—"}
      </dd>
    </div>
  );
}
