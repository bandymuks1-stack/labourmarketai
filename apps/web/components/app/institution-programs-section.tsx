import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { readInstitutionPrograms } from "@/lib/education/programs";
import { PROFESSION_SLUGS } from "@/lib/taxonomy/profession-skills";
import { EDUCATION_TYPE_SLUGS } from "@/lib/worker/worker-education-model";

import {
  AssignLearnerForm,
  CreateCohortForm,
  CreateProgramForm,
  RemoveMemberButton,
  type ProgramFormLabels,
} from "./institution-program-forms";

/**
 * Institution programmes & cohorts (Track C slice 2, RED batch B). The
 * institution → programme (pointed at a labour-market direction) → cohort →
 * learner chain, with REAL demand per programme from the public vacancy pool.
 * Learners are assigned from the institution's own accepted invitations —
 * names it typed itself; no learner data is read (least-privilege ruling).
 * Until the batch is applied the section says so and offers nothing fake.
 */
export async function InstitutionProgramsSection({ organizationId }: { readonly organizationId: string }) {
  const t = await getTranslations("roleDashboards.company.programs");
  const tProf = await getTranslations("professions");
  const tEdu = await getTranslations("cvSections.educationTypes");
  const read = await readInstitutionPrograms(organizationId);

  const labels: ProgramFormLabels = {
    programName: t("form.programName"),
    targetProfession: t("form.targetProfession"),
    noProfession: t("form.noProfession"),
    educationType: t("form.educationType"),
    noType: t("form.noType"),
    description: t("form.description"),
    createProgram: t("form.createProgram"),
    cohortName: t("form.cohortName"),
    startsOn: t("form.startsOn"),
    endsOn: t("form.endsOn"),
    createCohort: t("form.createCohort"),
    assignLearner: t("form.assignLearner"),
    chooseLearner: t("form.chooseLearner"),
    assign: t("form.assign"),
    remove: t("form.remove"),
    saving: t("form.saving"),
    saved: t("form.saved"),
    notReady: t("form.notReady"),
    forbidden: t("form.forbidden"),
    invalid: t("form.invalid"),
    error: t("form.error"),
  };
  const professions = PROFESSION_SLUGS.map((slug) => ({
    slug,
    label: tProf.has(slug as never) ? tProf(slug as never) : slug.replace(/-/g, " "),
  })).sort((a, b) => a.label.localeCompare(b.label));
  const educationTypes = EDUCATION_TYPE_SLUGS.map((slug) => ({ slug, label: tEdu(slug) }));
  const profLabel = (slug: string | null) =>
    slug ? (tProf.has(slug as never) ? tProf(slug as never) : slug.replace(/-/g, " ")) : null;

  return (
    <Card compact>
      <section className="flex flex-col gap-4" data-testid="institution-programs" aria-labelledby="institution-programs-title">
        <header className="flex flex-col gap-1">
          <h2 id="institution-programs-title" className="font-display text-base font-semibold text-text-primary">
            {t("title")}
          </h2>
          <p className="text-xs leading-relaxed text-text-secondary">{t("subtitle")}</p>
        </header>

        {read.status === "needs-migration" ? (
          <p className="text-xs text-text-muted" data-testid="institution-programs-not-ready">{t("notReady")}</p>
        ) : read.status === "unavailable" ? (
          <p className="text-xs text-text-muted" data-testid="institution-programs-unavailable">—</p>
        ) : (
          <>
            {read.programs.length === 0 ? (
              <p className="text-xs leading-relaxed text-text-muted" data-testid="institution-programs-empty">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col gap-4" data-testid="institution-programs-list">
                {read.programs.map((p) => {
                  const memberIds = new Set(p.cohorts.flatMap((c) => c.members.filter((m) => m.status === "active").map((m) => m.profileId)));
                  return (
                    <li key={p.id} className="flex flex-col gap-3 rounded-md border border-ink-600 p-3" data-testid={`program-${p.id}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="font-display text-sm font-semibold text-text-primary">{p.name}</span>
                          <span className="text-xs text-text-secondary">
                            {profLabel(p.targetProfessionSlug) ?? t("noDirection")}
                            {p.educationTypeSlug ? ` · ${tEdu(p.educationTypeSlug as never)}` : ""}
                          </span>
                        </div>
                        {p.targetProfessionSlug ? (
                          <span
                            className="rounded-full border border-brand-blue/40 bg-brand-blue/10 px-2.5 py-1 text-xs text-text-primary"
                            data-testid={`program-demand-${p.id}`}
                          >
                            {p.demandCount === null ? t("demandUnknown") : t("demand", { count: p.demandCount })}
                          </span>
                        ) : null}
                      </div>

                      {p.cohorts.length > 0 ? (
                        <ul className="flex flex-col gap-2">
                          {p.cohorts.map((c) => (
                            <li key={c.id} className="flex flex-col gap-2 rounded-md bg-ink-800/60 p-2" data-testid={`cohort-${c.id}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-text-primary">{c.name}</span>
                                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                                  {t("members", { count: c.members.filter((m) => m.status === "active").length })}
                                  {c.startsOn ? ` · ${c.startsOn}` : ""}
                                  {c.endsOn ? ` → ${c.endsOn}` : ""}
                                </span>
                              </div>
                              {c.members.filter((m) => m.status === "active").length > 0 ? (
                                <ul className="flex flex-wrap gap-1.5">
                                  {c.members
                                    .filter((m) => m.status === "active")
                                    .map((m) => (
                                      <li key={m.profileId} className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 text-xs text-text-primary">
                                        {m.label}
                                        <RemoveMemberButton cohortId={c.id} profileId={m.profileId} labels={labels} />
                                      </li>
                                    ))}
                                </ul>
                              ) : null}
                              <AssignLearnerForm
                                cohortId={c.id}
                                learners={read.assignable.filter((l) => !c.members.some((m) => m.profileId === l.profileId && m.status === "active"))}
                                labels={labels}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <CreateCohortForm programId={p.id} labels={labels} />
                      {memberIds.size === 0 && read.assignable.length === 0 ? (
                        <p className="text-meta text-text-muted">{t("noLearnersYet")}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <details className="rounded-md border border-ink-600 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-text-primary">{t("addProgram")}</summary>
              <div className="mt-3">
                <CreateProgramForm organizationId={organizationId} professions={professions} educationTypes={educationTypes} labels={labels} />
              </div>
            </details>
          </>
        )}
      </section>
    </Card>
  );
}
