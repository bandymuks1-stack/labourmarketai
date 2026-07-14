/**
 * Journal AI suggestions — PURE envelope→suggestion mapping (Journal Proof
 * Engine v1, Sprint v2 §3).
 *
 * Maps the work_journal agent's v1.1 envelope `data` into the bounded
 * suggestion shape the composer's review surface renders. Doctrine §7.1: every
 * item here is a CANDIDATE the worker must explicitly confirm — the mapping
 * never persists anything and never raises trust. Everything is re-bounded
 * here (lengths, counts, year ranges) so a schema drift upstream can never
 * flood the UI or smuggle an oversized claim into a confirm action.
 *
 * Pure. No server-only, no env, no IO — unit-tested directly.
 */

export interface JournalAiAchievementSuggestion {
  title: string;
  year: number | null;
}

export interface JournalAiExperienceSuggestion {
  title: string;
  startYear: number | null;
  endYear: number | null;
  isCurrent: boolean;
}

export interface JournalAiSuggestions {
  /** Skill claim LABELS — fed into the SAME self-declared-claim chip flow the
   *  deterministic recognizers use (saveProfileSkillClaimsAction). */
  skillLabels: string[];
  achievements: JournalAiAchievementSuggestion[];
  experiencePeriods: JournalAiExperienceSuggestion[];
  /** Project/site NAMES the entry text mentions — the CALLER matches them
   *  against the worker's own engagement contexts; an unmatched name renders
   *  nothing (no invented project may become a link target). */
  projectNames: string[];
}

/** Raw (already schema-validated) work_journal v1.1 envelope data subset. */
export interface WorkJournalEnvelopeData {
  possible_skills?: unknown;
  suggested_achievements?: unknown;
  suggested_experience_periods?: unknown;
  suggested_project_names?: unknown;
}

const yearOk = (y: unknown): y is number =>
  typeof y === "number" && Number.isInteger(y) && y >= 1900 && y <= 2100;

function cleanStrings(v: unknown, maxLen: number, maxCount: number): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (s.length < 2 || s.length > maxLen) continue;
    const key = s.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxCount) break;
  }
  return out;
}

/**
 * Map the validated envelope data into bounded, deduplicated suggestions.
 * Returns null when the model suggested NOTHING actionable — the caller
 * renders an honest "no suggestions" state, never an empty card wall.
 */
export function mapWorkJournalSuggestions(
  data: WorkJournalEnvelopeData | undefined | null,
): JournalAiSuggestions | null {
  if (!data || typeof data !== "object") return null;

  const skillLabels = cleanStrings(data.possible_skills, 120, 20);
  const projectNames = cleanStrings(data.suggested_project_names, 160, 5);

  const achievements: JournalAiAchievementSuggestion[] = Array.isArray(
    data.suggested_achievements,
  )
    ? data.suggested_achievements
        .filter(
          (a): a is { title: unknown; year: unknown } =>
            !!a && typeof a === "object",
        )
        .map((a) => ({
          title: typeof a.title === "string" ? a.title.trim().slice(0, 160) : "",
          year: yearOk(a.year) ? a.year : null,
        }))
        .filter((a) => a.title.length >= 3)
        .slice(0, 10)
    : [];

  const experiencePeriods: JournalAiExperienceSuggestion[] = Array.isArray(
    data.suggested_experience_periods,
  )
    ? data.suggested_experience_periods
        .filter(
          (
            e,
          ): e is {
            title: unknown;
            start_year: unknown;
            end_year: unknown;
            is_current: unknown;
          } => !!e && typeof e === "object",
        )
        .map((e) => ({
          title: typeof e.title === "string" ? e.title.trim().slice(0, 200) : "",
          startYear: yearOk(e.start_year) ? e.start_year : null,
          endYear: yearOk(e.end_year) ? e.end_year : null,
          isCurrent: e.is_current === true,
        }))
        .filter((e) => e.title.length >= 3)
        .slice(0, 5)
    : [];

  const any =
    skillLabels.length > 0 ||
    achievements.length > 0 ||
    experiencePeriods.length > 0 ||
    projectNames.length > 0;
  return any ? { skillLabels, achievements, experiencePeriods, projectNames } : null;
}

/**
 * Match an AI-suggested project NAME against the worker's OWN engagement
 * labels (case-insensitive containment either way). Returns the first
 * matching engagement id or null — an unmatched name must render nothing.
 */
export function matchProjectNameToEngagement(
  name: string,
  engagements: readonly { id: string; label: string }[],
): string | null {
  const n = name.trim().toLocaleLowerCase();
  if (n.length < 2) return null;
  for (const e of engagements) {
    const l = e.label.trim().toLocaleLowerCase();
    if (l.length >= 2 && (l.includes(n) || n.includes(l))) return e.id;
  }
  return null;
}
