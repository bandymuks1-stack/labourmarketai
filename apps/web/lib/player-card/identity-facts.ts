import type { IdentityFact } from "@/components/app/player-card/identity-stage";
import type { WorkPeriodTotals } from "@/lib/journal/work-intelligence";

/**
 * THE IDENTITY STAGE'S FACT STRIP — one rule for every surface that shows a
 * person's identity (the Player Card, the Profile hub).
 *
 * Only the journal's OWN all-time figures (`WorkIntelligence.periods`, key
 * "all"): recorded hours, hours on entries a manager/client approved, and
 * distinct days worked — each in its own unit, never combined into a score.
 * A truncated read is stated as "≥ n" (it counted at least that much), and a
 * person with nothing recorded gets no strip at all rather than three zeros.
 */
export function buildIdentityFacts({
  allTime,
  truncated,
  locale,
  t,
}: {
  readonly allTime: WorkPeriodTotals | null | undefined;
  readonly truncated: boolean;
  readonly locale: string;
  /** Translator bound to the `playerCard.identity` namespace. */
  readonly t: (key: "recorded" | "confirmed" | "days", values?: { count: number }) => string;
}): IdentityFact[] {
  if (!allTime || (allTime.hours <= 0 && allTime.daysWorked <= 0)) return [];
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const atLeast = truncated ? "≥ " : "";
  return [
    {
      value: atLeast + n.format(allTime.hours),
      label: t("recorded"),
      tone: "evidence",
      testid: "player-card-fact-recorded",
    },
    {
      value: atLeast + n.format(allTime.confirmedHours),
      label: t("confirmed"),
      tone: allTime.confirmedHours > 0 ? "confirmed" : "neutral",
      testid: "player-card-fact-confirmed",
    },
    {
      value: atLeast + n.format(allTime.daysWorked),
      label: t("days", { count: allTime.daysWorked }),
      tone: "neutral",
      testid: "player-card-fact-days",
    },
  ];
}
