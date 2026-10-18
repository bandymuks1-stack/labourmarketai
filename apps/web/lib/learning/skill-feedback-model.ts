/**
 * Client-safe half of the skill-feedback observation: the reason bound and
 * its normaliser. The writer (`skill-feedback-signal.ts`) is `server-only`;
 * the saved-entry card needs only these two, so they live here — a client
 * component importing a server-only module is a build error, not a runtime
 * one, and it was (#1790, first CI run).
 */
export const SKILL_FEEDBACK_REASON_MAX = 300;

/** Trim + bound the reason; empty becomes null, never "". */
export function normalizeFeedbackReason(reason: string | null | undefined): string | null {
  if (typeof reason !== "string") return null;
  const clean = reason.replace(/\s+/g, " ").trim();
  if (clean === "") return null;
  return clean.length > SKILL_FEEDBACK_REASON_MAX
    ? clean.slice(0, SKILL_FEEDBACK_REASON_MAX)
    : clean;
}
