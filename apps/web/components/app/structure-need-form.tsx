"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { EscoTypeahead } from "@/components/app/esco-typeahead";
import type { EscoSuggestion } from "@/lib/taxonomy/esco-autocomplete";
import {
  structureRequestNeed,
  type StructureNeedState,
} from "@/lib/admin/structure-need-actions";
import { Button } from "@/components/ui/Button";

/**
 * S6 — one-click HUMAN structuring of an unstructured demand request.
 * The admin picks the required ESCO skills (+ optional occupation) through
 * the existing deterministic typeahead; every pick is an explicit human
 * choice. Until this happens the request honestly shows NO fit percentage.
 */
export function StructureNeedForm({ requestId }: { requestId: string }) {
  const t = useTranslations("admin.matching.structure");
  const locale = useLocale();
  const [skills, setSkills] = useState<readonly EscoSuggestion[]>([]);
  const [occupation, setOccupation] = useState<EscoSuggestion | null>(null);
  const [state, action, pending] = useActionState<StructureNeedState, FormData>(
    structureRequestNeed,
    null,
  );

  if (state?.ok) {
    return (
      <p
        className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-2 text-xs text-state-success"
        role="status"
        data-testid="structure-need-done"
      >
        {t("done", { n: state.skillCount })}
      </p>
    );
  }

  const addSkill = (s: EscoSuggestion) =>
    setSkills((prev) =>
      prev.some((x) => x.conceptId === s.conceptId) ? prev : [...prev, s],
    );

  return (
    <form
      action={action}
      className="flex flex-col gap-2 rounded-md border border-dashed border-brand-blue/30 bg-brand-blue/5 p-3"
      data-testid="structure-need-form"
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {t("title")}
      </p>
      <p className="text-meta leading-relaxed text-text-secondary">
        {t("hint")}
      </p>

      <EscoTypeahead
        locale={locale}
        conceptType="skill"
        placeholder={t("skillPlaceholder")}
        ariaLabel={t("skillPlaceholder")}
        onPick={addSkill}
      />
      {skills.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="structure-need-skills">
          {skills.map((s) => (
            <li key={s.conceptId}>
              <Button
                type="button"
                onClick={() =>
                  setSkills((prev) =>
                    prev.filter((x) => x.conceptId !== s.conceptId),
                  )
                }
                variant="secondary" size="sm" className="min-h-11 hover:border-state-danger hover:text-state-danger"
                title={t("removeSkill")}
              >
                {s.label} ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <EscoTypeahead
        locale={locale}
        conceptType="occupation"
        placeholder={t("occupationPlaceholder")}
        ariaLabel={t("occupationPlaceholder")}
        onPick={setOccupation}
      />
      {occupation ? (
        <p className="text-meta text-text-secondary">
          {t("occupationPicked")}: {occupation.label}
        </p>
      ) : null}

      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="skill_concept_ids"
        value={JSON.stringify(skills.map((s) => s.conceptId))}
      />
      <input
        type="hidden"
        name="occupation_concept_id"
        value={occupation?.conceptId ?? ""}
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={pending || skills.length === 0}
          variant="secondary" size="sm" className="min-h-11"
          data-testid="structure-need-submit"
        >
          {pending ? t("saving") : t("submit", { n: skills.length })}
        </Button>
        {state && !state.ok ? (
          <span className="text-meta text-state-warning" role="status">
            {t(`error.${state.code}`)}
          </span>
        ) : null}
      </div>
    </form>
  );
}
