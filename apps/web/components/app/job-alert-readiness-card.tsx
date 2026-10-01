import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { buttonLinkClassName } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/server";
import { buildOwnWorkerContext } from "@/lib/opportunities/worker-subject";
import { missingJobAlertCriteria } from "@/lib/opportunities/job-alert-model";

/**
 * JOB ALERT READINESS (stream N) — one honest line on the opportunities board:
 * either "new real jobs that fit you reach your notifications" or exactly which
 * of the two required facts (profession, preferred countries) the person has
 * not yet said, with the door to the EXISTING work-card editor on the profile.
 * Salary is optional and never listed as missing: nothing is excluded on pay
 * the person has not stated.
 *
 * Reads the person's OWN context (RLS) — the same subject the board matches
 * with, so the card and the alerts can never disagree about what is missing.
 */
export async function JobAlertReadinessCard({ locale }: { locale: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return null;

  const professions = ctx.subject.professionSlugs?.length
    ? [...ctx.subject.professionSlugs]
    : ctx.subject.professionSlug
      ? [ctx.subject.professionSlug]
      : [];
  const missing = missingJobAlertCriteria({
    professionSlugs: professions,
    preferredCountries: [...(ctx.subject.preferredCountries ?? [])],
    salaryMinEur: ctx.subject.salaryMinEur ?? null,
  });

  const t = await getTranslations("opportunities.jobAlerts");
  return (
    <Card data-testid="job-alert-readiness">
      <div className="flex flex-col gap-2 p-4">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        {missing.length === 0 ? (
          <p className="text-sm text-text-secondary" data-testid="job-alert-ready">
            {t("ready")}
          </p>
        ) : (
          <>
            <p className="text-sm text-text-secondary">{t("missing")}</p>
            <ul
              className="list-disc pl-5 text-sm text-text-primary"
              data-testid="job-alert-missing"
            >
              {missing.map((m) => (
                <li key={m}>{t(m)}</li>
              ))}
            </ul>
            <Link
              href={`/${locale}/dashboard/profile#work-card-editor-section`}
              data-testid="job-alert-fill-cta"
              className={`mt-1 self-start ${buttonLinkClassName("secondary", "sm")}`}
            >
              {t("cta")} →
            </Link>
          </>
        )}
      </div>
    </Card>
  );
}
