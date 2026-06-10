"use client";

import { useActionState } from "react";
import { useLocale } from "next-intl";

import {
  saveCandidateClarificationAction,
  type ClarificationActionResult,
} from "@/lib/skills/candidate-clarifications-actions";
import { EscoTypeahead } from "@/components/app/esco-typeahead";
import { ESCO_AUTOCOMPLETE_ENABLED, ESCO_ATTRIBUTION } from "@/lib/config/esco";

/**
 * Worker clarify-capture form (slice skill-clarify-capture-v1). Adds a candidate
 * skill the catalogue may not know yet, in the worker's own words. Self-declared
 * / needs-clarification — never verified. Blank clarify fields stay blank.
 *
 * ESCO wiring (flag-flip slice, design doc §9 step 3): with the flag on, the
 * label field IS the ESCO typeahead — one input, no parallel CTA. Typed free
 * text stays valid (candidate skills exist precisely for what the canon does
 * not know); a pick fills the canonical label in the viewer's locale. A pick
 * is still Level 0 self-declared input — recognition never verifies.
 */

export interface SkillClarifyLabels {
  labelLabel: string;
  labelPlaceholder: string;
  relatedLabel: string;
  relatedPlaceholder: string;
  toolsLabel: string;
  toolsPlaceholder: string;
  oftenLabel: string;
  oftenPlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  errorMsg: string;
  needsMigration: string;
  selfDeclaredNote: string;
}

const field =
  "rounded-md border border-ink-500 bg-ink-900 px-3 py-2 text-sm text-text-primary";

export function SkillClarifyForm({ labels }: { labels: SkillClarifyLabels }) {
  const locale = useLocale();
  const [state, action, pending] = useActionState<
    ClarificationActionResult | null,
    FormData
  >(saveCandidateClarificationAction, null);

  return (
    <form action={action} className="card-border flex flex-col gap-3 p-5" data-testid="skill-clarify-form">
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">{labels.labelLabel}</span>
        {ESCO_AUTOCOMPLETE_ENABLED ? (
          <EscoTypeahead
            locale={locale}
            conceptType="skill"
            placeholder={labels.labelPlaceholder}
            ariaLabel={labels.labelLabel}
            name="label"
            required
          />
        ) : (
          <input name="label" required placeholder={labels.labelPlaceholder} className={field} />
        )}
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">{labels.relatedLabel}</span>
        <input name="related_to" placeholder={labels.relatedPlaceholder} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">{labels.toolsLabel}</span>
        <input name="tools_materials" placeholder={labels.toolsPlaceholder} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-mono uppercase tracking-label text-text-muted">{labels.oftenLabel}</span>
        <input name="often_with" placeholder={labels.oftenPlaceholder} className={field} />
      </label>

      <p className="text-[11px] leading-relaxed text-text-muted" data-testid="skill-clarify-self-declared">
        {labels.selfDeclaredNote}
      </p>

      {/* Mandatory EU-licence attribution — shown wherever ESCO data
          surfaces (canonical English legal line, not translated). */}
      {ESCO_AUTOCOMPLETE_ENABLED ? (
        <p className="text-[10px] leading-relaxed text-text-muted" data-testid="esco-attribution">
          {ESCO_ATTRIBUTION}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-4 py-2 text-sm font-semibold text-ink-900 transition-transform hover:-translate-y-0.5"
        >
          {pending ? labels.saving : labels.save}
        </button>
        {state?.ok && (
          <span className="text-xs text-state-success" role="status">{labels.saved}</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-state-danger" role="status">
            {state.code === "needs_migration" ? labels.needsMigration : labels.errorMsg}
          </span>
        )}
      </div>
    </form>
  );
}
