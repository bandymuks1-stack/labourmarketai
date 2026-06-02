/**
 * Profile "one next action" — deterministic, real-signal helper (v1).
 *
 * The single source of truth for the profile hub's ONE primary action. Pure:
 * same signals → same action. No AI, no network, no randomness — just a fixed
 * priority over real saved-profile signals. This unifies the "what should I do
 * next?" logic into one tested function so the hub never grows competing CTAs.
 *
 * Priority:
 *   1. Missing the basics (no CV/about, or no declared skills) → finish the
 *      profile (anchors to the in-page editor).
 *   2. A worker who HAS declared skills but none are yet backed by work-journal
 *      evidence → go add work-journal evidence (the canonical journal route).
 *   3. Otherwise → keep refining the profile.
 */

export type ProfileNextAction = {
  /** i18n key under `profileHub` for the action label. */
  labelKey: "primaryAction" | "primaryActionJournal";
  /** Existing canonical destination — in-page editor anchor or journal route. */
  href: "#profile-edit" | "/dashboard/journal";
};

export type ProfileNextActionSignals = {
  cvProvided: boolean;
  selfDeclaredCount: number;
  hasWorker: boolean;
  /** Declared skills with no work-journal evidence backing yet. */
  unsupportedSkillCount: number;
};

const COMPLETE: ProfileNextAction = {
  labelKey: "primaryAction",
  href: "#profile-edit",
};
const ADD_JOURNAL: ProfileNextAction = {
  labelKey: "primaryActionJournal",
  href: "/dashboard/journal",
};

export function deriveProfileNextAction(
  s: ProfileNextActionSignals,
): ProfileNextAction {
  // 1. Basics first.
  if (!s.cvProvided || s.selfDeclaredCount === 0) return COMPLETE;
  // 2. Skills exist but lack work-journal evidence → point to the journal.
  if (s.hasWorker && s.unsupportedSkillCount > 0) return ADD_JOURNAL;
  // 3. Otherwise keep refining the profile.
  return COMPLETE;
}
