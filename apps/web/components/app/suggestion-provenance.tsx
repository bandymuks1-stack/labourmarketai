"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Honest provenance label for an auto-surfaced skill / evidence suggestion in
 * the journal structuring flow (foundation v1).
 *
 * It renders three plain-language facts that never over-state what the platform
 * knows about a suggested skill:
 *   · suggested from this entry — the system surfaced it from the worker's own
 *     free text (a small dictionary + rules, not AI, not matching);
 *   · self-declared — confirming it records the worker's OWN statement, not an
 *     external fact;
 *   · not verified — no human, manager, or document confirmation exists yet.
 *
 * There is deliberately NO "verified", "AI", "automatic", or "matched" claim
 * here. The honest triad is pinned by
 * `lib/guards/suggestion-provenance-honesty.test.ts` so it cannot drift into a
 * fake-trust badge.
 */
export function SuggestionProvenanceLabel({
  className,
}: {
  className?: string;
}) {
  const t = useTranslations("structuring.provenance");
  const labels = [
    t("suggestedFromEntry"),
    t("selfDeclared"),
    t("notVerified"),
  ];
  return (
    <ul
      className={cn("flex flex-wrap gap-1.5", className)}
      data-testid="suggestion-provenance"
    >
      {labels.map((label) => (
        <li
          key={label}
          className="rounded-full border border-ink-500 bg-ink-800/60 px-2 py-0.5 font-mono text-[9px] uppercase leading-none tracking-label text-text-muted"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}
