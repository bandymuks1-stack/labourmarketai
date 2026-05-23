"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type SuggestionStatus = "pending" | "confirmed" | "edited" | "discarded";

/**
 * One detected suggestion (a skill, a duration, a work direction, a CV entry).
 * The card is honest about state: pending suggestions look neutral; the user
 * must confirm before the platform treats the value as a fact (§7).
 *
 * Editing is optional: pass `editable` to surface an inline text field that
 * fires `onEdit(value)` with the new text. Some payloads (durations, units)
 * are non-textual; their parent can swap the editor by passing children.
 */
export function DetectedSuggestionCard({
  label,
  hint,
  status,
  editable,
  editValue,
  onEdit,
  onConfirm,
  onDiscard,
  className,
  children,
}: {
  label: string;
  hint?: string;
  status: SuggestionStatus;
  editable?: boolean;
  editValue?: string;
  onEdit?: (next: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("structuring");

  const stateClass =
    status === "confirmed"
      ? "border-state-success/40 bg-state-success/5"
      : status === "discarded"
        ? "border-ink-600 bg-ink-800/40 opacity-60"
        : status === "edited"
          ? "border-brand-blue/40 bg-brand-blue/5"
          : "border-ink-600 bg-ink-800/40";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-md border p-3 transition-colors",
        stateClass,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-text-primary">
            {label}
          </span>
          {hint && (
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {hint}
            </span>
          )}
        </div>
        {status !== "pending" && (
          <span
            className={cn(
              "shrink-0 font-mono text-[10px] uppercase tracking-label",
              status === "confirmed" && "text-state-success",
              status === "edited" && "text-brand-blue",
              status === "discarded" && "text-text-muted",
            )}
          >
            {t(`status.${status}`)}
          </span>
        )}
      </div>

      {editable && status !== "discarded" && (
        <input
          type="text"
          value={editValue ?? ""}
          onChange={(e) => onEdit?.(e.target.value)}
          className="w-full rounded-md border border-ink-500 bg-ink-700 px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-brand-blue"
        />
      )}
      {children}

      {status !== "confirmed" && status !== "discarded" && (
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md border border-state-success/40 px-2.5 py-1 text-[11px] font-semibold text-state-success hover:border-state-success"
          >
            {t("actions.confirm")}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md border border-ink-500 px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:border-state-danger hover:text-state-danger"
          >
            {t("actions.discard")}
          </button>
        </div>
      )}
    </li>
  );
}
