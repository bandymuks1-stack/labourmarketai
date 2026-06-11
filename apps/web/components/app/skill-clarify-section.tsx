import { getTranslations } from "next-intl/server";

import { listOwnCandidateClarifications } from "@/lib/skills/candidate-clarifications";
import {
  SkillClarifyForm,
  type SkillClarifyLabels,
} from "@/components/app/skill-clarify-form";

/**
 * Candidate skill clarify-capture, mounted on the CANONICAL profile capability
 * surface (slice skill-clarify-capture-v1) — not a new route. A worker adds a
 * skill the catalogue may not know yet, in their own words; self-declared /
 * needs-clarification, never verified. Owner-scoped + honest empty state.
 */
export async function SkillClarifySection() {
  const t = await getTranslations("skillClarify");
  const read = await listOwnCandidateClarifications();

  const labels: SkillClarifyLabels = {
    labelLabel: t("form.labelLabel"),
    labelPlaceholder: t("form.labelPlaceholder"),
    relatedLabel: t("form.relatedLabel"),
    relatedPlaceholder: t("form.relatedPlaceholder"),
    toolsLabel: t("form.toolsLabel"),
    toolsPlaceholder: t("form.toolsPlaceholder"),
    oftenLabel: t("form.oftenLabel"),
    oftenPlaceholder: t("form.oftenPlaceholder"),
    save: t("form.save"),
    saving: t("form.saving"),
    saved: t("form.saved"),
    errorMsg: t("form.error"),
    needsMigration: t("needsMigration"),
    selfDeclaredNote: t("selfDeclaredNote"),
  };

  return (
    <section className="flex flex-col gap-3" data-testid="skill-clarify-section">
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      </header>

      <SkillClarifyForm labels={labels} />

      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("listTitle")}
      </p>
      {read.kind === "needs-migration" ? (
        <p className="card-border p-4 text-sm text-text-secondary">{t("needsMigration")}</p>
      ) : read.items.length === 0 ? (
        <p className="card-border p-4 text-sm text-text-secondary" data-testid="skill-clarify-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {read.items.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-3"
              data-testid="candidate-skill-item"
            >
              <span className="text-sm font-semibold text-text-primary">{c.label}</span>
              <span className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
                {t("candidateBadge")}
              </span>
              {c.relatedTo && (
                <span className="text-xs text-text-secondary">{t("relatedLabel")}: {c.relatedTo}</span>
              )}
              {c.toolsMaterials && (
                <span className="text-xs text-text-secondary">{t("toolsLabel")}: {c.toolsMaterials}</span>
              )}
              {c.oftenWith && (
                <span className="text-xs text-text-secondary">{t("oftenLabel")}: {c.oftenWith}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
