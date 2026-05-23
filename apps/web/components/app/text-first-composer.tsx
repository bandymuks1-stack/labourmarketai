"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * Text-first composer (PLATFORM_DOCTRINE: free text or CV BEFORE the worker is
 * forced into a taxonomy). The user writes a paragraph in their own words OR
 * pastes a CV; pressing analyse routes the text to the rule-based parser
 * (lib/structuring) and the caller renders the suggestion list.
 *
 * Honest framing: this is NOT AI extraction (no fake AI claim) — it's a small
 * lexicon + regex pass, and every suggestion still needs a human confirm.
 */
export function TextFirstComposer({
  title,
  placeholder,
  helper,
  submitLabel,
  manualLabel,
  onSubmit,
  onManual,
  className,
  initial = "",
  busy = false,
}: {
  title: string;
  placeholder: string;
  helper?: string;
  submitLabel: string;
  manualLabel?: string;
  onSubmit: (text: string) => void;
  onManual?: () => void;
  className?: string;
  initial?: string;
  busy?: boolean;
}) {
  const t = useTranslations("structuring");
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  const canSubmit = value.trim().length > 0 && !busy;

  return (
    <section
      className={cn(
        "card-border flex flex-col gap-3 p-5 sm:p-6",
        className,
      )}
      aria-labelledby={`${id}-title`}
    >
      <h2
        id={`${id}-title`}
        className="font-display text-lg font-semibold text-text-primary"
      >
        {title}
      </h2>
      {helper && (
        <p className="text-xs leading-relaxed text-text-secondary">{helper}</p>
      )}
      <label className="sr-only" htmlFor={`${id}-textarea`}>
        {title}
      </label>
      <textarea
        ref={ref}
        id={`${id}-textarea`}
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
      />

      {/* Honesty banner — parser is rule-based, suggestions are not facts */}
      <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("ruleBasedNotice")}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => onSubmit(value)}
          disabled={!canSubmit}
        >
          {submitLabel}
        </Button>
        {onManual && manualLabel && (
          <button
            type="button"
            onClick={onManual}
            className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            {manualLabel}
          </button>
        )}
      </div>
    </section>
  );
}
