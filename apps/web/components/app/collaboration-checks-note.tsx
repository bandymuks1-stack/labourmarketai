import { getTranslations } from "next-intl/server";

import {
  collaborationChecks,
  type CollaborationContext,
} from "@/lib/collaboration/collaboration-checks";

/**
 * The mutual, neutral pre-agreement recommendation (owner correction
 * 2026-10-24, decision 0021 extension). Shown to BOTH parties where a
 * concrete collaboration is being considered — bookings, scouting / offers,
 * project operations, service requests, commercial proposals.
 *
 * It is advice, not a gate: no button depends on it, nothing is uploaded,
 * nothing is disclosed, nothing is called verified. Each topic names its
 * basis (required by law · required by law in some cases · for the parties to
 * agree) so external legal duties are said plainly and never overstated.
 *
 * A disclosure (<details>) so it stays one calm line until opened.
 */
export async function CollaborationChecksNote({
  context,
  countryName,
  testId = "collaboration-checks-note",
}: {
  context: CollaborationContext;
  /** Localised name of the country where the work happens, if known. */
  countryName?: string | null;
  testId?: string;
}) {
  const t = await getTranslations("collaborationChecks");
  const checks = collaborationChecks(context);
  return (
    <details
      className="rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2 text-sm text-text-secondary"
      data-testid={testId}
    >
      <summary className="cursor-pointer font-medium text-text-primary">{t("title")}</summary>
      <div className="mt-2 flex flex-col gap-2">
        <p className="leading-relaxed" data-testid={`${testId}-lead`}>
          {t("lead")}
        </p>
        <p className="text-meta leading-relaxed text-text-muted">
          {t("context")}
          {countryName ? ` ${t("countryRules", { country: countryName })}` : ""}
        </p>
        <ul className="flex flex-col gap-1.5">
          {checks.map((c) => (
            <li key={c.topic} className="flex flex-col gap-0.5" data-testid={`${testId}-topic-${c.topic}`}>
              <span className="text-meta leading-relaxed text-text-primary">{t(`topic.${c.topic}`)}</span>
              <span
                className={
                  c.basis === "agreement"
                    ? "font-mono text-meta uppercase tracking-label text-text-muted"
                    : "font-mono text-meta uppercase tracking-label text-state-warning"
                }
              >
                {t(`basis.${c.basis}`)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-meta leading-relaxed text-text-muted">{t("privacy")}</p>
      </div>
    </details>
  );
}
