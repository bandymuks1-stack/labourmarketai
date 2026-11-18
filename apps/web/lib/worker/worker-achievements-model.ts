/**
 * Pure model for self-declared achievements + declared certificates (DRAFT
 * migration 20260714160000_worker_education_achievements_v1 — human-gated,
 * APPLIED, ledger `20260716195418`, 2 rows on 2026-09-14). No DB, no React.
 *
 * Honesty invariants:
 *   * `confirmed_by_manager` can NEVER be set from the app — the migration
 *     excludes it from the authenticated column grants; this model does not
 *     even carry it as an input field;
 *   * a certificate found in imported CV TEXT is stored as a
 *     `declared_certificate` achievement — NEVER as a worker_documents row
 *     (no file exists; fabricating a document would fake the documents
 *     readiness surface). The UI always labels these "declared, not verified";
 *   * achievement TYPE identity is a registry slug (achievement_types seed
 *     set — §10 Lego); labels live in JSON under `cvSections.achievementTypes`.
 */

export const ACHIEVEMENT_TYPE_SLUGS = [
  "achievement",
  "award",
  "course_completion",
  "declared_certificate",
  "other",
] as const;

export type AchievementTypeSlug = (typeof ACHIEVEMENT_TYPE_SLUGS)[number];

/** App-side list cap (the table has no row cap — bounded here). */
export const ACHIEVEMENTS_MAX_ROWS = 100;

export function isAchievementTypeSlug(
  value: string,
): value is AchievementTypeSlug {
  return (ACHIEVEMENT_TYPE_SLUGS as readonly string[]).includes(value);
}

export function parseAchievementTypeSlug(
  raw: string | null | undefined,
): AchievementTypeSlug | null {
  const s = (raw ?? "").trim();
  return s !== "" && isAchievementTypeSlug(s) ? s : null;
}

export interface WorkerAchievementEntry {
  id: string;
  title: string;
  description: string | null;
  achievedAt: string | null; // ISO date
  achievementTypeSlug: string;
  /** Real manager confirmation only — read-only in the app; renders a
   *  distinct state ONLY when a real confirmation flow set it. */
  confirmedByManager: boolean;
}

export interface WorkerAchievementInput {
  title: string;
  description: string | null;
  achievedAt: string | null;
  achievementTypeSlug: AchievementTypeSlug;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAchievementInput(raw: {
  title?: string | null;
  description?: string | null;
  achievedAt?: string | null;
  achievementTypeSlug?: string | null;
}): WorkerAchievementInput | null {
  const title = (raw.title ?? "").trim();
  if (title.length < 2 || title.length > 160) return null;

  const typeSlug = parseAchievementTypeSlug(raw.achievementTypeSlug ?? "achievement");
  if (!typeSlug) return null;

  const dateRaw = (raw.achievedAt ?? "").trim();
  if (dateRaw !== "" && !ISO_DATE_RE.test(dateRaw)) return null;

  return {
    title,
    description: (raw.description ?? "").trim().slice(0, 2000) || null,
    achievedAt: dateRaw || null,
    achievementTypeSlug: typeSlug,
  };
}

export const ACHIEVEMENT_COLUMNS =
  "id, title, description, achieved_at, achievement_type_slug, confirmed_by_manager";

export function achievementEntryFromRow(r: {
  id: string;
  title: string;
  description: string | null;
  achieved_at: string | null;
  achievement_type_slug: string;
  confirmed_by_manager: boolean | null;
}): WorkerAchievementEntry {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    achievedAt: r.achieved_at,
    achievementTypeSlug: r.achievement_type_slug,
    confirmedByManager: r.confirmed_by_manager === true,
  };
}

/** The table has no unique key, so a second save of the same statement (someone
 *  who saw no row and typed it again) would store it twice. Same words, any case. */
export function findSameAchievement(
  entries: readonly WorkerAchievementEntry[],
  input: WorkerAchievementInput,
): WorkerAchievementEntry | null {
  const same = (x: string | null, y: string | null) => (x ?? "").toLowerCase() === (y ?? "").toLowerCase();
  return (
    entries.find(
      (e) =>
        same(e.title, input.title) &&
        same(e.description, input.description) &&
        (e.achievedAt ?? "").slice(0, 10) === (input.achievedAt ?? "") &&
        e.achievementTypeSlug === input.achievementTypeSlug,
    ) ?? null
  );
}

export function classifyAchievementsError(
  code: string | undefined,
): "needs_migration" | "unauthenticated" | "error" {
  if (code && ["42P01", "42703", "PGRST205", "42883", "PGRST202"].includes(code)) {
    return "needs_migration";
  }
  if (code === "42501") return "unauthenticated";
  return "error";
}
