"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DraftType, DemandDraftRow } from "@/lib/demand/demand-drafts";
import { recordEvent, trackFunnel } from "@/lib/telemetry/task";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import {
  saveDemandDraftAction,
  deleteDemandDraftAction,
} from "@/lib/demand/demand-drafts-actions";
import { OptionCards } from "@/components/ui/OptionCards";

/**
 * Generic demand draft form. One form per draft_type — the caller
 * passes the field schema + i18n namespace; the form handles save +
 * delete + the loading states.
 *
 * Honesty:
 *   - Save button is hidden when nothing changed AND nothing is filled.
 *   - Delete button only renders when an existing draft is present.
 *   - The "Išsaugota privačiai" success line is shown after save and
 *     explicitly states the draft stays private — no auto-publish.
 *   - No matching / verified / confirmed wording reachable from
 *     this component.
 */
export type FormField = {
  /** Key in the payload object (e.g. `title`). Broad `string` here
   *  because `keyof DemandDraftPayload` narrows to the intersection
   *  of the three payload unions; the server action validates the
   *  per-type allowlist before any DB write. */
  key: string;
  /** i18n key under the form's namespace (e.g. `field.title.label`). */
  labelKey: string;
  placeholderKey: string;
  /** "text" (input) | "textarea" | "select" | "optioncards" (radio cards for
   *  a small finite set — replaces the clumsy mobile <select>). */
  variant: "text" | "textarea" | "select" | "optioncards";
  /** For variant=select / optioncards. */
  selectOptionsKey?: string;
  /** Optional grid columns for variant=optioncards (default 2). */
  optionColumns?: 1 | 2 | 3;
  /** Optional i18n key for a one-line helper under an optioncards field. */
  helpKey?: string;
};

export function DemandDraftForm({
  draftType,
  fields,
  i18nNamespace,
  initialDraft,
  selectOptions = {},
}: {
  draftType: DraftType;
  fields: readonly FormField[];
  /** e.g. "roleDashboards.company.draftForm" */
  i18nNamespace: string;
  initialDraft: DemandDraftRow | null;
  /** For each `select` field, the options keyed by `selectOptionsKey`.
   *  Each option is `{ value, labelKey }`. */
  selectOptions?: Record<
    string,
    readonly { value: string; labelKey: string }[]
  >;
}) {
  const t = useTranslations(i18nNamespace);
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const payload = (initialDraft?.payload ?? {}) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = payload[f.key as string];
      out[f.key as string] = typeof v === "string" ? v : "";
    }
    return out;
  });
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  // Activation funnel (P0-A): demand form became visible to the user.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackFunnel(FUNNEL_EVENTS.demandFormViewed, { entity_type: draftType });
  }, [draftType]);

  function setValue(key: string, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onSave(): void {
    setError(null);
    const payload: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key as string] ?? "";
      if (v.trim().length === 0) continue;
      payload[f.key as string] = v;
    }
    startSave(() => {
      saveDemandDraftAction(draftType, payload)
        .then(() => {
          setSavedAt(new Date().toISOString());
          // Telemetry — event name per draft type so the admin
          // dashboard can split funnels.
          recordEvent(`${draftType.replace("_request", "_draft").replace("_offer", "_draft")}_saved`, {
            draft_type: draftType,
          });
          // Activation funnel (P0-A) — canonical demand-created signal.
          trackFunnel(FUNNEL_EVENTS.demandSaved, {
            entity_type: draftType,
            success: true,
          });
          router.refresh();
        })
        .catch((e: unknown) => {
          console.error("[demand-draft-form] save failed", e);
          setError(t("saveError"));
          recordEvent("task_error", {
            draft_type: draftType,
            result_kind: e instanceof Error ? e.name : "unknown",
          });
        });
    });
  }

  function onDelete(): void {
    setError(null);
    startDelete(() => {
      deleteDemandDraftAction(draftType)
        .then(() => {
          // Reset visible state so the user sees a fresh form.
          const empty: Record<string, string> = {};
          for (const f of fields) empty[f.key as string] = "";
          setValues(empty);
          setSavedAt(null);
          router.refresh();
        })
        .catch((e: unknown) => {
          console.error("[demand-draft-form] delete failed", e);
          setError(t("deleteError"));
        });
    });
  }

  const hasAnyValue = Object.values(values).some(
    (v) => v.trim().length > 0,
  );
  const hasExistingDraft = initialDraft !== null;

  return (
    <form
      className="flex flex-col gap-4"
      data-testid={`pilot-draft-form-${draftType}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `${draftType}-${String(f.key)}`;
          const label = t(f.labelKey);
          const placeholder = t(f.placeholderKey);
          if (f.variant === "textarea") {
            return (
              <label key={id} className="sm:col-span-2 flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {label}
                </span>
                <textarea
                  id={id}
                  rows={4}
                  value={values[f.key as string] ?? ""}
                  onChange={(e) =>
                    setValue(f.key as string, e.target.value)
                  }
                  placeholder={placeholder}
                  className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  disabled={isSaving || isDeleting}
                />
              </label>
            );
          }
          if (f.variant === "optioncards" && f.selectOptionsKey) {
            const opts = selectOptions[f.selectOptionsKey] ?? [];
            return (
              <div key={id} className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {label}
                </span>
                <OptionCards
                  name={id}
                  ariaLabel={label}
                  value={values[f.key as string] ?? ""}
                  onChange={(v) => setValue(f.key as string, v)}
                  columns={f.optionColumns ?? 2}
                  testId={`pilot-draft-${draftType}-${String(f.key)}`}
                  disabled={isSaving || isDeleting}
                  options={opts.map((opt) => ({
                    value: opt.value,
                    label: t(opt.labelKey),
                  }))}
                />
                {f.helpKey ? (
                  <span className="text-[11px] leading-snug text-text-muted">
                    {t(f.helpKey)}
                  </span>
                ) : null}
              </div>
            );
          }
          if (f.variant === "select" && f.selectOptionsKey) {
            const opts = selectOptions[f.selectOptionsKey] ?? [];
            return (
              <label key={id} className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {label}
                </span>
                <select
                  id={id}
                  value={values[f.key as string] ?? ""}
                  onChange={(e) =>
                    setValue(f.key as string, e.target.value)
                  }
                  className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                  disabled={isSaving || isDeleting}
                >
                  <option value="">{placeholder}</option>
                  {opts.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label key={id} className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {label}
              </span>
              <input
                id={id}
                type="text"
                value={values[f.key as string] ?? ""}
                onChange={(e) =>
                  setValue(f.key as string, e.target.value)
                }
                placeholder={placeholder}
                className="rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                disabled={isSaving || isDeleting}
                maxLength={1000}
              />
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSaving || isDeleting || !hasAnyValue}
          className="rounded-md border border-state-success/40 bg-state-success/5 px-4 py-2 text-sm font-semibold text-state-success hover:border-state-success disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`pilot-draft-save-${draftType}`}
        >
          {isSaving ? t("saving") : t("saveButton")}
        </button>
        {hasExistingDraft && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isSaving || isDeleting}
            className="rounded-md border border-ink-500 px-4 py-2 text-sm text-text-secondary hover:border-state-danger hover:text-state-danger disabled:opacity-50"
            data-testid={`pilot-draft-delete-${draftType}`}
          >
            {isDeleting ? t("deleting") : t("deleteButton")}
          </button>
        )}
        {savedAt && (
          <span
            className="text-xs text-state-success"
            data-testid={`pilot-draft-saved-${draftType}`}
          >
            ✓ {t("savedPrivate")}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-state-danger">
          {error}
        </p>
      )}
    </form>
  );
}
