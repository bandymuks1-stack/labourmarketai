import { getTranslations } from "next-intl/server";
import { History } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Link } from "@/lib/i18n/navigation";
import { peopleInRecords } from "@/lib/organization-evidence/company-work-history";
import { nf, span } from "@/components/app/organization/company-work-history";
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
/** Cards rendered at once; the rest are DISCLOSED ("shown N of M"), never dropped silently. */
const RENDER_LIMIT = 200;

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
  const tDisclose = await getTranslations("companyPerson");

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

  const total = read.records.length;
  const visible = read.records.slice(0, RENDER_LIMIT);
  // WHO worked here, from the records — each person opens their historical
  // card (`/dashboard/company/people/[personId]`), which links back here.
  const people = peopleInRecords(read.records);

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="project-history"
      data-status="ready"
      data-count={total}
    >
      {heading(` · ${total}`)}
      <p className="text-xs leading-relaxed text-text-secondary" data-testid="project-history-provenance">
        {t("provenance")}
      </p>
      {people.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="project-history-people">
          <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
            {t("people.title", { count: people.length })}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <li key={p.personId}>
                <Card compact className="flex flex-col gap-1" data-testid="project-history-person" data-person={p.personId}>
                  <span className="flex items-start justify-between gap-3">
                    <Link
                      href={`/dashboard/company/people/${p.personId}` as "/dashboard"}
                      className="min-w-0 truncate text-sm font-medium text-brand-blue hover:underline"
                      data-testid="project-history-person-link"
                    >
                      {displayPersonName(p.name) ?? t("personUnknown")} →
                    </Link>
                    <span className="shrink-0 font-mono text-sm text-text-primary">{nf(p.dayHours)} h</span>
                  </span>
                  <span className="text-meta text-text-muted">
                    {p.firstDate ? span(p.firstDate, p.lastDate, locale) : null}
                    {p.firstDate ? " · " : ""}
                    {t("people.days", { count: p.recordedDays })}
                    {p.periodHours > 0 ? ` · ${t("people.periodHours", { hours: nf(p.periodHours) })}` : ""}
                  </span>
                  {p.work.length > 0 ? (
                    <span className="text-meta leading-relaxed text-text-secondary">
                      {p.work.map((w) => w.text).join(" · ")}
                    </span>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {total > visible.length ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="project-history-shown">
          {tDisclose("shown", { shown: visible.length, total })}
        </p>
      ) : null}
      {read.truncated ? (
        <p className="text-xs leading-relaxed text-text-muted" data-testid="project-history-truncated">
          {tDisclose("truncated", { count: total })}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {visible.map((rec) => {
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
                  <Link
                    href={`/dashboard/company/people/${rec.personId}` as "/dashboard"}
                    className="text-sm font-medium text-brand-blue hover:underline"
                    data-testid="project-history-record-person"
                  >
                    {person ?? t("personUnknown")}
                  </Link>
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
