import { Info } from "lucide-react";

/**
 * FeatureNote — a short, plain-language in-UI explanation of an active feature
 * (launch-completion v1). One calm line so a first-time user understands what a
 * surface does, without internal/DB/technical terms.
 *
 * Presentational only: callers pass already-localized strings (works in both
 * server and client components). Copy lives in the `featureNotes` i18n
 * namespace (LT/EN/RU).
 */
export function FeatureNote({
  title,
  children,
  testId = "feature-note",
}: {
  /** Optional short bold lead, e.g. the feature name. */
  title?: string;
  /** The explanation text (already localized). */
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <aside
      data-testid={testId}
      className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-1/60 px-3 py-2 text-xs leading-relaxed text-text-secondary"
    >
      <Info
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted"
        strokeWidth={1.75}
        aria-hidden
      />
      <span>
        {title ? (
          <strong className="font-semibold text-text-primary">{title} — </strong>
        ) : null}
        {children}
      </span>
    </aside>
  );
}
