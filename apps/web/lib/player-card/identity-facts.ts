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
  organizationHistoryHours = null,
  professionalExperienceHours = null,
}: {
  readonly allTime: WorkPeriodTotals | null | undefined;
  readonly truncated: boolean;
  readonly locale: string;
  /** Translator bound to the `playerCard.identity` namespace. */
  readonly t: (
    key:
      | "recorded"
      | "confirmed"
      | "days"
      | "noRecords"
      | "noManagerRecord"
      | "organizationHistory"
      | "experienceTotal",
    values?: { count: number },
  ) => string;
  /** All-time hours organizations recorded about the person (day + period
   *  records, lib/journal/organization-all-time.ts) — imported history counts
   *  as work experience without an invoice or a confirmation (#2169). A fact
   *  of its own beside the journal figures, never added to them HERE: the
   *  one addition is `professionalExperienceHours`. */
  readonly organizationHistoryHours?: number | null;
  /** The ONE continuous professional history's total (decision 0025,
   *  `deriveProfessionalExperience(...).hours.total`): every work hour once
   *  over the journal and the organization history. Shown first when the
   *  organization history adds to the journal; otherwise the journal figure
   *  already IS the total. */
  readonly professionalExperienceHours?: number | null;
}): IdentityFact[] {
  const n0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  // A journal read that hit its ceiling makes the TOTAL unknown, not a lower
  // bound: an organization allocation linked to an entry outside the read is
  // counted in that entry's place, so loading the entry can LOWER the sum.
  // The total is withheld rather than shown with a false "≥".
  const historyFact: IdentityFact[] =
    organizationHistoryHours !== null && organizationHistoryHours > 0
      ? [
          {
            value: n0.format(organizationHistoryHours),
            label: t("organizationHistory"),
            tone: "evidence",
            testid: "player-card-fact-organization-history",
          },
        ]
      : [];
  const totalFact: IdentityFact[] =
    !truncated &&
    professionalExperienceHours !== null &&
    professionalExperienceHours > 0 &&
    organizationHistoryHours !== null &&
    organizationHistoryHours > 0
      ? [
          {
            value: n0.format(professionalExperienceHours),
            label: t("experienceTotal"),
            tone: "evidence",
            testid: "player-card-fact-experience-total",
          },
        ]
      : [];
  // UNKNOWN is not zero (SEP-7): nothing recorded is said in words as an
  // absent state — never three zeros, and never a silent gap that makes the
  // person look empty.
  if (!allTime || (allTime.hours <= 0 && allTime.daysWorked <= 0)) {
    return historyFact.length > 0
      ? [...totalFact, ...historyFact]
      : [{ value: null, label: t("noRecords"), tone: "neutral", testid: "player-card-fact-none" }];
  }
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const atLeast = truncated ? "≥ " : "";
  return [
    ...totalFact,
    {
      value: atLeast + n.format(allTime.hours),
      label: t("recorded"),
      tone: "evidence",
      testid: "player-card-fact-recorded",
    },
    // Recorded but not yet confirmed is a PENDING state, not "0 confirmed"
    // (which reads as a failed verification).
    allTime.confirmedHours > 0
      ? {
          value: atLeast + n.format(allTime.confirmedHours),
          label: t("confirmed"),
          tone: "confirmed",
          testid: "player-card-fact-confirmed",
        }
      : {
          value: null,
          label: t("noManagerRecord"),
          tone: "neutral",
          testid: "player-card-fact-confirmed",
        },
    {
      value: atLeast + n.format(allTime.daysWorked),
      label: t("days", { count: allTime.daysWorked }),
      tone: "neutral",
      testid: "player-card-fact-days",
    },
    ...historyFact,
  ];
}
