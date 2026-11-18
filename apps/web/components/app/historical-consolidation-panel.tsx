import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { HistoricalConsolidationApplyForm } from "@/components/app/historical-consolidation-apply-form";
import { loadConsolidationProposal } from "@/lib/projects/historical-consolidation-read";

/**
 * IMPORTED PROJECT ROWS THAT ARE ONE OBJECT — for the organization's
 * governor, on the finished-projects view. The import turned every object
 * cell into a project row, so one object ("W22.073") became dozens of rows.
 * This shows the deterministic proposal (lib/projects/historical-consolidation)
 * and lets the OWNER merge a group with one deliberate press. Merging keeps
 * every row, record, hour and person; it is audited and reversible by an
 * administrator from the audit log. Never shown to anyone without
 * governance authority; renders nothing when there is nothing to propose.
 */
export async function HistoricalConsolidationPanel({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const proposal = await loadConsolidationProposal(supabase, organizationId);
  if (!proposal || proposal.groups.length === 0) return null;
  const t = await getTranslations("projects.consolidation");
  const fragments = proposal.groups.reduce((n, g) => n + g.fragmentIds.length, 0);
  const aFragments = proposal.groups.filter((g) => g.level === "A").reduce((n, g) => n + g.fragmentIds.length, 0);

  return (
    <section className="flex flex-col gap-3" data-testid="historical-consolidation" aria-label={t("title")}>
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-text-secondary" data-testid="historical-consolidation-summary">
          {t("summary", { rows: proposal.rows, fragments, after: proposal.rows - aFragments })}
        </p>
        <p className="text-meta leading-relaxed text-text-muted">{t("safety")}</p>
      </header>
      <ul className="flex flex-col gap-2">
        {proposal.groups.map((g) => (
          <li key={g.key}>
            <Card compact className="flex flex-col gap-2" data-testid="historical-consolidation-group" data-level={g.level} data-group={g.key}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  {g.canonicalTitle ?? g.basis}
                  <span className="ml-2 font-mono text-meta uppercase tracking-label text-text-muted">{g.basis}</span>
                </span>
                <span className="font-mono text-meta text-text-muted">
                  {t("counts", { rows: g.fragmentIds.length + 1, records: g.records, hours: g.hours })}
                </span>
              </span>
              {g.level === "B" ? (
                <p className="text-meta text-state-warning" data-testid="historical-consolidation-caution">
                  {t(`caution.${g.caution ?? "other"}` as never)}
                </p>
              ) : null}
              <HistoricalConsolidationApplyForm
                groupKey={g.key}
                needsDecision={g.level === "B"}
                labels={{
                  apply: t("apply", { rows: g.fragmentIds.length }),
                  decide: t("decide"),
                  pending: t("pending"),
                  done: t("done"),
                  failed: t("failed"),
                }}
              />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
