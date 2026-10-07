import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { EvidenceState, type EvidenceStanding } from "@/components/app/work-world/primitives";
import { createClient } from "@/lib/supabase/server";
import { formatHoursAsStated, recordWhen } from "@/lib/organization-evidence/period-provenance";
import {
  displayPersonName,
  readEvidenceForProject,
} from "@/lib/organization-evidence/work-object-evidence-read";

/**
 * HISTORICAL WORK ON THIS PROJECT — organization-provided history imported
 * against the project's work objects, read through the viewer's own RLS
 * session (`readEvidenceForProject`). A failed read is said, never rendered
 * as "none recorded". Only the hours a record states are shown (never summed,
 * never spread onto days); every standing comes through `EvidenceState`, so an
 * import never wears verification green.
 */
export async function ProjectHistoricalWork({
  projectId,
  locale,
}: {
  projectId: string;
  locale: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const t = await getTranslations("projectOps.stadium.history");
  const tRecords = await getTranslations("evidenceImport.records");
  const tState = await getTranslations("evidenceImport.evidenceState");

  const read = await readEvidenceForProject({ supabase, userId: user.id, locale }, projectId);
  if (read.kind === "unprovisioned") return null;

  const heading = (suffix = "") => (
    <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
      <History className="h-3.5 w-3.5" aria-hidden />
      {t("title")}
      {suffix}
    </h2>
  );

  if (read.kind === "unavailable") {
    return (
      <section className="flex flex-col gap-3" data-testid="project-history" data-status="unavailable">
        {heading()}
        <Card variant="error" compact>
          <p className="text-sm text-text-secondary" data-testid="project-history-unavailable">
            {t("unavailable")}
          </p>
        </Card>
      </section>
    );
  }

  if (read.records.length === 0) {
    return (
      <section className="flex flex-col gap-3" data-testid="project-history" data-status="empty">
        {heading()}
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted"
          data-testid="project-history-empty"
        >
          {t("empty")}
        </p>
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="project-history"
      data-status="ready"
      data-count={read.records.length}
    >
      {heading(` · ${read.records.length}`)}
      <p className="text-xs leading-relaxed text-text-secondary" data-testid="project-history-provenance">
        {t("provenance")}
      </p>
      <ul className="flex flex-col gap-2">
        {read.records.map((rec) => {
          const standing = (
            rec.attestation
              ? rec.attestation.self
                ? "SELF_ATTESTED"
                : "ORGANIZATION_ATTESTED"
              : rec.state
          ) as EvidenceStanding;
          const when = recordWhen(rec, locale);
          const person = displayPersonName(rec.personName);
          return (
            <li key={rec.id} data-testid="project-history-record" data-state={standing}>
              <Card compact className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-text-primary">
                    {person ?? t("personUnknown")}
                  </span>
                  {when ? <span className="font-mono text-meta text-text-muted">{when}</span> : null}
                  <span className="font-mono text-meta text-text-secondary">
                    {rec.hours !== null && Number.isFinite(rec.hours)
                      ? `${formatHoursAsStated(rec.hours)} h`
                      : t("hoursUnknown")}
                  </span>
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
                {rec.contextLabel ? (
                  <p className="text-meta text-text-muted">{rec.contextLabel}</p>
                ) : null}
                {rec.text ? <p className="text-sm text-text-secondary">{rec.text}</p> : null}
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
