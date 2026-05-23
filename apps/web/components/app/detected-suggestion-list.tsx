"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Section wrapper for a group of `DetectedSuggestionCard`s. Renders a section
 * eyebrow ("Sistema rado · {category}") and an empty-state when no parser
 * matches were found for the bucket.
 */
export function DetectedSuggestionList({
  title,
  count,
  emptyLabel,
  className,
  children,
}: {
  title: string;
  count?: number;
  emptyLabel?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("structuring");
  const isEmpty = (count ?? 0) === 0;

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-[10px] uppercase tracking-label text-text-secondary">
          <span className="text-text-muted">{t("groupEyebrow")}</span> · {title}
        </h3>
        {typeof count === "number" && (
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {count}
          </span>
        )}
      </header>
      {isEmpty ? (
        <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs text-text-muted">
          {emptyLabel ?? t("emptyBucket")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}
