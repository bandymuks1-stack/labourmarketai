"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LifeBuoy } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import { submitHelpRequestAction } from "@/lib/help/help-request-actions";
import {
  HELP_NOTE_MAX,
  HELP_REQUEST_TYPES,
  type HelpRequestType,
} from "@/lib/help/help-request-model";
import { HELP_EXPLANATIONS_LT } from "@/lib/help/help-explanations-lt";
import { cn } from "@/lib/utils";

/**
 * Typed internal help-request panel on the company workspace (CR train
 * WAGON 10, area 18). Five REAL CTAs — recruiter / accounting / legal /
 * document check / demand-filling help — each creating one INTERNAL
 * customer_requests row through the gated RPC. Honesty rules:
 *   - the success state says a HUMAN will review it and that no specialist
 *     is assigned automatically — never a fake "expert assigned" claim;
 *   - legal/accounting/document explanations are LT-master only (owner
 *     LT-first rule): non-LT locales see the short pending notice instead;
 *   - nothing is sent anywhere (no email/SMS/Telegram/webhook) — the record
 *     appears on the operator's existing admin intake queue;
 *   - while the owner-gated migration is not applied the panel reports the
 *     truthful "not available yet" state.
 */
export function HelpRequestPanel({
  demandOptions,
}: {
  /** The company's OWN submitted demands (id + title) for optional context. */
  demandOptions: readonly { id: string; title: string }[];
}) {
  const t = useTranslations("helpRequests");
  const locale = useLocale();
  const [selected, setSelected] = useState<HelpRequestType | null>(null);
  const [note, setNote] = useState("");
  const [demandId, setDemandId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<
    | { kind: "sent" }
    | { kind: "error"; message: string }
    | null
  >(null);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setOutcome(null);
    try {
      const res = await submitHelpRequestAction(
        selected,
        note,
        demandId || null,
      );
      if (res.ok) {
        setOutcome({ kind: "sent" });
        setSelected(null);
        setNote("");
        setDemandId("");
      } else {
        setOutcome({
          kind: "error",
          message:
            res.code === "not_ready"
              ? t("notReady")
              : res.code === "too_many_open"
                ? t("tooManyOpen")
                : res.code === "note_too_long"
                  ? t("noteTooLong")
                  : t("errorGeneric"),
        });
      }
    } catch {
      setOutcome({ kind: "error", message: t("errorGeneric") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="card-border flex flex-col gap-4 p-4 sm:p-6"
      id="help"
      data-testid="help-request-panel"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="inline-flex items-center gap-2 font-display text-lg font-semibold text-text-primary">
          <LifeBuoy className="h-4 w-4 text-text-muted" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
      </div>

      {outcome?.kind === "sent" ? (
        <div
          role="status"
          className="flex flex-col gap-1.5 rounded-md border border-state-success/40 bg-state-success/5 px-3 py-3"
          data-testid="help-request-sent"
        >
          <p className="text-sm font-semibold text-state-success">
            ✓ {t("sentTitle")}
          </p>
          {/* Honest expectation: a person reviews it inside the platform;
              no specialist is assigned automatically. */}
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("sentBody")}
          </p>
        </div>
      ) : null}

      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        role="group"
        aria-label={t("title")}
      >
        {HELP_REQUEST_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={selected === type}
            data-testid={`help-request-type-${type}`}
            onClick={() => {
              setSelected(selected === type ? null : type);
              setOutcome(null);
            }}
            className={cn(
              "flex min-h-[3.25rem] flex-col items-start justify-center rounded-md border px-3 py-2 text-left text-sm font-semibold transition-colors",
              selected === type
                ? "border-brand-blue bg-brand-blue/10 text-brand-blue"
                : "border-ink-500 text-text-secondary hover:border-brand-blue hover:text-text-primary",
            )}
          >
            {t(`types.${type}` as never)}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="flex flex-col gap-3" data-testid="help-request-form">
          {locale === "lt" ? (
            // LT master explanation (draft, owner LT-first rule) — the only
            // locale that renders explanation wording.
            <p
              className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-xs leading-relaxed text-text-secondary"
              data-testid="help-request-explanation"
            >
              {HELP_EXPLANATIONS_LT[selected]}
            </p>
          ) : (
            <p
              className="rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-xs leading-relaxed text-text-secondary"
              data-testid="help-request-explanation-pending"
            >
              {t("explanationPending")}
            </p>
          )}

          <label className="flex flex-col gap-1.5">
            <Label>{t("noteLabel")}</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={HELP_NOTE_MAX}
              placeholder={t("notePlaceholder")}
              data-testid="help-request-note"
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
            />
          </label>

          {demandOptions.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <Label>{t("demandContextLabel")}</Label>
              <DarkListbox
                value={demandId}
                onChange={setDemandId}
                options={[
                  { value: "", label: t("demandContextNone") },
                  ...demandOptions.map((d) => ({
                    value: d.id,
                    label: d.title,
                  })),
                ]}
                ariaLabel={t("demandContextLabel")}
                testId="help-request-demand-context"
              />
            </label>
          ) : null}

          {outcome?.kind === "error" ? (
            <p
              className="rounded-md border border-state-warning/40 bg-state-warning/5 px-3 py-2 text-xs text-state-warning"
              role="alert"
              data-testid="help-request-error"
            >
              {outcome.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              data-testid="help-request-submit"
            >
              {submitting ? t("submitting") : t("submit")}
            </Button>
            <span className="text-meta leading-relaxed text-text-muted">
              {t("internalNote")}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
