import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";

import { Card } from "@/components/ui/Card";
import {
  EvidenceState,
  PeriodBand,
  type EvidenceStanding,
} from "@/components/app/work-world/primitives";
import { createClient } from "@/lib/supabase/server";
import { listEvidenceRecords } from "@/lib/organization-evidence/import-core";
import { projectPeriodAggregateByMonth } from "@/lib/organization-evidence/period-projection";
import { formatUtcDate, formatUtcDateRange } from "@/lib/time/display";

/**
 * WHAT THIS ORGANIZATION HAS ON RECORD ABOUT THE PERSON — imported history
 * on the company's person page (2026-09-20).
 *
 * The page read `workers`, `worker_skills` and `engagement_contexts` and
 * nothing from `organization_evidence_records`: a manager who had just
 * imported 800 h about a worker opened that worker's page and saw none of
 * it. This composes the ONE evidence read (`listEvidenceRecords`) through
 * the person's LINKED roster row — the same row the subject's own profile
 * and the work model read through — and renders it with the shared
 * evidence primitives. No second store, no new authority: RLS on
 * `organization_people` and on the records decides what a manager sees.
 *
 * Honesty: a failed read is said (`unavailable`), never rendered as "no
 * history"; no linked roster row or no record renders NOTHING — a person
 * without imported history does not get a box saying so. A period record
 * is drawn as its PeriodBand (DERIVED monthly share, labelled), never as
 * days; a day record shows its day. Every standing comes through
 * `EvidenceState`, so an import never wears verification green.
 */
const READ_LIMIT = 50;
const MAX_LINKED_PEOPLE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: unknown): any {
  return c;
}

export async function PersonImportedHistory({
  workerId,
  locale,
}: {
  workerId: string;
  locale: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const t = await getTranslations("people");
  const tRecords = await getTranslations("evidenceImport.records");
  const tState = await getTranslations("evidenceImport.evidenceState");

  const unavailable = (
    <section className="flex flex-col gap-3" data-testid="person-history">
      <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
        <History className="h-3.5 w-3.5" aria-hidden />
        {t("historyTitle")}
      </h2>
      <Card variant="error" compact>
        <p className="text-sm text-text-secondary" data-testid="person-history-unavailable">
          {t("historyUnavailable")}
        </p>
      </Card>
    </section>
  );

  // The LINKED roster rows for this worker — identity by consent, never by
  // a matching name. RLS: the viewer's own organizations' rows only.
  const people = await db(supabase)
    .from("organization_people")
    .select("id")
    .eq("linked_worker_id", workerId)
    .eq("link_state", "linked")
    .limit(MAX_LINKED_PEOPLE);
  if (people.error) {
    // A store that is not provisioned here is an honest nothing, not a failure.
    if (people.error.code === "42P01" || people.error.code === "PGRST205") return null;
    console.error("[people] roster-link read failed:", people.error.code);
    return unavailable;
  }
  const personIds = ((people.data ?? []) as { id: string }[]).map((p) => p.id);
  if (personIds.length === 0) return null;

  const res = await listEvidenceRecords(
    { supabase, userId: user.id, locale },
    { organizationPersonIds: personIds, limit: READ_LIMIT },
  );
  if (res.kind === "needs-migration") return null;
  if (res.kind !== "ok") return unavailable;
  const records = res.records.filter((r) => !r.withdrawn);
  if (records.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" data-testid="person-history" data-count={records.length}>
      <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
        <History className="h-3.5 w-3.5" aria-hidden />
        {t("historyTitle")} · {records.length}
      </h2>
      <ul className="flex flex-col gap-2">
        {records.map((rec) => {
          const projection = projectPeriodAggregateByMonth({
            hours: rec.hours,
            periodStart: rec.periodStart,
            periodEnd: rec.periodEnd,
          });
          const standing = (
            rec.attestation
              ? rec.attestation.self
                ? "SELF_ATTESTED"
                : "ORGANIZATION_ATTESTED"
              : rec.state
          ) as EvidenceStanding;
          const when = rec.activityDate
            ? formatUtcDate(rec.activityDate, locale)
            : rec.periodStart
              ? formatUtcDateRange(rec.periodStart, rec.periodEnd ?? rec.periodStart, locale)
              : null;
          return (
            <li key={rec.id} data-testid="person-history-record" data-state={standing}>
              <Card compact className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {rec.contextLabel ? (
                    <span className="text-sm font-medium text-text-primary">{rec.contextLabel}</span>
                  ) : null}
                  {when ? <span className="font-mono text-meta text-text-muted">{when}</span> : null}
                  {rec.hours !== null && !projection ? (
                    <span className="font-mono text-meta text-text-secondary">{rec.hours} h</span>
                  ) : null}
                  <EvidenceState
                    state={standing}
                    label={
                      rec.attestation
                        ? rec.attestation.self
                          ? tRecords("selfAttested")
                          : tRecords("attested")
                        : tState(rec.state as never)
                    }
                  />
                </div>
                {rec.text ? <p className="text-sm text-text-secondary">{rec.text}</p> : null}
                {/* A period record: one figure over a span, drawn as the
                    derived band — never spread onto days. */}
                {projection ? (
                  <PeriodBand
                    totalLabel={`${projection.totalHours.toFixed(2)} h`}
                    derivedLabel={tRecords("monthlyShare")}
                    months={projection.months}
                  />
                ) : null}
                <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {tRecords("notIndependentlyVerified")}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
