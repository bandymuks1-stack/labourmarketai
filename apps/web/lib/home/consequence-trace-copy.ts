import type { TraceSkill, TraceStep } from "./consequence-trace";

/**
 * The ONE wording of a consequence-trace step — shared by the home's
 * "Kas pasikeitė" region and the conversation's "what changed" answer, so
 * the two surfaces can never describe the same fact differently.
 *
 * Pure: the caller hands in its translators (`homeTrace`, `homeRegions.chain`)
 * and the name resolvers; nothing here reads a catalog or a locale.
 */
export type TraceTranslator = (key: string, values?: Record<string, string | number>) => string;

export type TraceCopyDeps = {
  /** Scoped to `homeTrace`. */
  readonly t: TraceTranslator;
  /** Scoped to `homeRegions.chain`. */
  readonly chain: TraceTranslator;
  readonly role: (role: string | null) => string;
  readonly skill: (slug: string) => string;
  readonly number: (n: number) => string;
};

const skillList = (skills: readonly TraceSkill[], deps: TraceCopyDeps) =>
  skills.map((s) => deps.skill(s.slug)).join(", ");

export function traceStepText(step: TraceStep, deps: TraceCopyDeps): string {
  const { t } = deps;
  switch (step.kind) {
    case "recorded":
      return step.hours !== null
        ? t("step.recordedHours", { hours: deps.number(step.hours) })
        : step.dayUnits !== null
          ? t("step.recordedDays", { days: deps.number(step.dayUnits) })
          : t("step.recordedUntimed");
    case "awaiting_review":
      return t("step.awaiting");
    case "reviewed":
      if (step.decision === "approved") {
        if (step.selfOnly) return t("step.selfApproved");
        return step.automatic ? t("step.approvedAutomatic") : t("step.approvedBy", { role: deps.role(step.role) });
      }
      return step.decision === "rejected" ? t("step.rejected") : t("step.changesRequested");
    case "living_cv":
      if (step.skills === null) return t("step.cvUnknown");
      if (step.unlinked) return t("step.cvUnlinked");
      return t("step.cv", {
        skills: skillList(step.skills, deps),
        entries: step.skills[0]?.confirmedEntries ?? 0,
        count: step.skills.length,
      });
    case "matching":
      return step.skills.some((s) => s.tier === "repeated_confirmed")
        ? t("step.matchingRepeated", { skills: skillList(step.skills, deps) })
        : t("step.matching", { skills: skillList(step.skills, deps) });
    case "state_change":
      return `${deps.chain(`consequence.${step.consequenceKey}`)} · ${deps.chain(`state.${step.stateKey}`)}`;
  }
}

/** What shape a step is drawn with — the same on every surface. */
export type TraceStepTone = "fact" | "confirmed" | "negative" | "pending" | "derived";

export function traceStepTone(step: TraceStep): TraceStepTone {
  switch (step.kind) {
    case "awaiting_review":
      return "pending";
    case "living_cv":
    case "matching":
      return "derived";
    case "reviewed":
      if (step.decision !== "approved") return "negative";
      return step.selfOnly ? "fact" : "confirmed";
    default:
      return "fact";
  }
}
