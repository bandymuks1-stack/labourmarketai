import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { listPilots } from "@/lib/admin/pilots";
import { CreatePilotForm } from "@/components/app/admin-pilots-forms";

/**
 * Pilot cohort administration — list + create (Pilot Onboarding and
 * Measurement v1).
 *
 * Server-gated via requireSuperadmin (defense-in-depth under the admin
 * layout gate); the SQL SELECT is additionally admin-only via the pilots
 * RLS policies of the DRAFT-GATED migration 20260716140000_pilots_cohort_v1.
 *
 * Honest degradation: while the owner has NOT applied that migration the
 * probe sees 42P01 and this page shows a plain "not enabled yet" note —
 * no fake list, no dead create form.
 *
 * Compact per PR #773 doctrine: the pilot list is the first screen; the
 * create form is folded unless there are no pilots yet.
 */
export default async function AdminPilotsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperadmin(locale);
  const t = await getTranslations("adminPilots");

  const data = await listPilots();

  return (
    <div className="flex flex-col gap-6" data-testid="admin-pilots-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      {!data.applied ? (
        <p
          className="rounded-md border border-dashed border-brand-blue/40 bg-brand-blue/5 p-4 text-sm text-text-secondary"
          data-testid="pilots-needs-migration"
        >
          {t("needsMigration")}
        </p>
      ) : (
        <>
          {data.error ? (
            <p
              role="alert"
              className="card-border bg-state-danger/5 p-4 text-sm text-state-danger"
            >
              {t("loadError", { msg: data.error })}
            </p>
          ) : null}

          <section className="card-border flex flex-col gap-2 p-4">
            <h2 className="font-display text-base font-semibold text-text-primary">
              {t("list.title")}
            </h2>
            {data.pilots.length === 0 ? (
              <p className="text-sm text-text-secondary">{t("list.empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-ink-700/40">
                {data.pilots.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/admin/pilots/${p.id}` as "/dashboard"}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-ink-800/40"
                      data-testid={`pilot-row-${p.id}`}
                    >
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-text-primary">
                          {p.name}
                        </span>
                        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                          {t(`kind.${p.organisationKind}`)} ·{" "}
                          {p.startsOn || p.endsOn
                            ? `${p.startsOn ?? "…"} → ${p.endsOn ?? "…"}`
                            : t("list.noDates")}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className="text-text-secondary">
                          {t("list.participants", { n: p.activeParticipants })}
                        </span>
                        <span className="text-text-secondary">
                          {t("list.outcomes", { n: p.outcomeCount })}
                        </span>
                        <span className="rounded-md border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                          {t(`status.${p.status}`)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details
            className="card-border p-4"
            open={data.pilots.length === 0}
            data-testid="pilot-create-section"
          >
            <summary className="cursor-pointer font-display text-base font-semibold text-text-primary">
              {t("create.title")}
            </summary>
            <div className="pt-3">
              <CreatePilotForm />
            </div>
          </details>
        </>
      )}

      <Link
        href="/dashboard/admin"
        className="self-start text-xs text-text-secondary hover:text-text-primary"
      >
        ← {t("back")}
      </Link>
    </div>
  );
}
