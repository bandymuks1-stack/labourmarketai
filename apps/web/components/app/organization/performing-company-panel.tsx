import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMemberships, withSessionWorkspacePointer } from "@/lib/company/active-organization";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import { listAllEvidenceRecords } from "@/lib/organization-evidence/evidence-pagination";
import { attributePersonToPerformingCompanyAction } from "@/lib/organization-evidence/import-actions";
import { formatHoursAsStated } from "@/lib/organization-evidence/period-provenance";
import { personHoursOf } from "@/lib/organization-evidence/person-hours";
import { PerformingCompanyForm } from "@/components/app/organization/performing-company-form";

/**
 * WHO PERFORMED THIS WORK? — for an organization whose books hold historical
 * work that another organization of the SAME caller performed.
 *
 * Per roster person: how many records and hours the books hold, how many of
 * them already name another organization as performing company, and one form
 * to attribute that person's records to one of the caller's OTHER
 * organizations. Nothing is moved or copied (see
 * `attributeRecordsToPerformingOrganization`); the other organization simply
 * gains read access through the existing party policy. Rendered only when the
 * caller manages this organization AND belongs to at least one other, and only
 * when there are records. Honest degradation: any failed read renders nothing
 * rather than a partial list.
 */
export async function PerformingCompanyPanel({ locale }: { locale: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const caller = await withSessionWorkspacePointer({ supabase, userId: user.id, locale });

  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) return null;
  let memberships: Awaited<ReturnType<typeof listWorkspaceMemberships>>;
  try {
    memberships = await listWorkspaceMemberships(caller);
  } catch {
    return null;
  }
  const options = memberships
    .filter((w) => w.kind === "organization" && w.id !== org.organizationId)
    .map((w) => ({ id: w.id, name: w.name?.trim() || w.id }));
  if (options.length === 0) return null;

  // PAGED to the end (the server answers 1000 rows at most); a safety ceiling is disclosed below.
  const recs = await listAllEvidenceRecords(caller, { organizationId: org.organizationId });
  if (recs.kind !== "ok") return null;
  const live = recs.records.filter((r) => !r.withdrawn);
  if (live.length === 0) return null;

  // Day hours and period aggregates are NEVER summed (see lib/organization-evidence/person-hours.ts).
  const byPerson = new Map<string, { name: string | null; recs: typeof live; named: Map<string, number> }>();
  for (const r of live) {
    const e = byPerson.get(r.personId) ?? { name: r.personName, recs: [], named: new Map() };
    e.recs = [...e.recs, r];
    for (const p of r.parties) {
      if (p.role === "employer" && p.organizationId) e.named.set(p.organizationId, (e.named.get(p.organizationId) ?? 0) + 1);
    }
    byPerson.set(r.personId, e);
  }

  const t = await getTranslations("companyWorkHistory.attribution");
  const labels = {
    performedBy: t("performedBy"),
    note: t("note"),
    button: t("button"),
    done: t("done", { count: "{count}", skipped: "{skipped}" }),
    refused: t("refused"),
  };
  const tHistory = await getTranslations("companyWorkHistory");
  const nameOf = new Map(options.map((o) => [o.id, o.name]));

  return (
    <section className="flex flex-col gap-3" data-testid="performing-company-panel" aria-label={t("title")}>
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-bold tracking-tightest text-text-primary">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
        {recs.truncated ? (
          <p className="text-meta text-text-muted" data-testid="performing-company-truncated">
            {tHistory("truncated", { count: recs.records.length })}
          </p>
        ) : null}
      </header>
      <ul className="flex flex-col gap-2">
        {[...byPerson.entries()]
          .map(([personId, e]) => ({ personId, e, h: personHoursOf(e.recs) }))
          .sort((a, b) => b.h.dayHours - a.h.dayHours || b.h.periodHours - a.h.periodHours)
          .map(({ personId, e, h }) => (
            <li key={personId}>
              <Card compact className="flex flex-col gap-2" data-testid="performing-company-person">
                <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="font-medium text-text-primary">{e.name ?? "—"}</span>
                  <span className="font-mono text-meta text-text-muted">
                    {t("person", { hours: formatHoursAsStated(h.dayHours), count: h.count })}
                  </span>
                  {h.periodHours > 0 ? (
                    <span className="font-mono text-meta text-text-muted" data-testid="performing-company-period">
                      {t("personPeriod", { hours: formatHoursAsStated(h.periodHours) })}
                    </span>
                  ) : null}
                  {[...e.named.entries()].map(([id, n]) => (
                    <span key={id} className="text-meta text-text-secondary" data-testid="performing-company-progress">
                      {t("progress", { attributed: n, total: h.count, name: nameOf.get(id) ?? "—" })}
                    </span>
                  ))}
                </p>
                <PerformingCompanyForm
                  action={attributePersonToPerformingCompanyAction}
                  labels={labels}
                  personId={personId}
                  options={options}
                />
              </Card>
            </li>
          ))}
      </ul>
    </section>
  );
}
