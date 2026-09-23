import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ARCHIVED ORGANIZATIONS — the one predicate every workspace read shares.
 *
 * Owner decision 2026-09-23 (one canonical Nonstop Group): duplicate and
 * development/test organizations are ARCHIVED, never deleted. Archiving is
 * `organizations.archived_at` (+ `archived_reason`), added by migration
 * `20260923114500_nonstop_org_consolidation_v1`. Their memberships,
 * engagements, journal entries, confirmations and workflow definitions stay
 * exactly as they were — history — so every read that lets a person SELECT or
 * ACT IN a workspace has to leave the archived organization out itself:
 *
 *   - the owned / governance / engagement workspace sources
 *     (`owned-organizations.ts`, `active-organization.ts`);
 *   - the switch core, which validates against that same list
 *     (`workspace-switch-core.ts` then refuses an archived org as not-member);
 *   - the employer resolver (`employer-company-context.ts` fails closed);
 *   - the "may act for" / "governs" lists (`managed-organizations.ts`).
 *
 * FEATURE-DETECTED. An environment where the migration is unapplied has no
 * such column: PostgREST answers 42703 (or PGRST204), and there EVERY
 * organization is simply not archived — the pre-migration truth, not a
 * failure. Any OTHER error is a real failure and is reported as one; callers
 * fail closed on it (an organization whose archive state is unknown is not
 * offered as a workspace).
 */

export const ORGANIZATION_ARCHIVED_COLUMN = "archived_at";

const ABSENT_ARCHIVE_SCHEMA_CODES = new Set(["42703", "PGRST204", "42P01", "PGRST205"]);

/** True when the error says the archive column (or table) does not exist here. */
export function isAbsentArchiveSchema(code: string | null | undefined): boolean {
  return !!code && ABSENT_ARCHIVE_SCHEMA_CODES.has(code);
}

/** Pure: is this organization row archived? A row without the field is not. */
export function isArchivedOrganizationRow(
  row: { archived_at?: string | null } | null | undefined,
): boolean {
  return typeof row?.archived_at === "string" && row.archived_at.length > 0;
}

export type ArchivedOrganizationsRead =
  | { readonly ok: true; readonly archived: ReadonlySet<string> }
  | { readonly ok: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Which of these organization ids are archived. One bounded primary-key read
 * (`id in (…)`), skipped entirely for an empty list. Runs under the caller's
 * own RLS: an organization the caller cannot read at all answers "not
 * archived" here, and is refused by the membership gates that read it anyway.
 */
export async function readArchivedOrganizationIds(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<ArchivedOrganizationsRead> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return { ok: true, archived: new Set() };
  try {
    const { data, error } = await asAny(supabase)
      .from("organizations")
      .select("id")
      .in("id", unique)
      .not(ORGANIZATION_ARCHIVED_COLUMN, "is", null);
    if (error) {
      if (isAbsentArchiveSchema(error.code)) return { ok: true, archived: new Set() };
      return { ok: false };
    }
    const archived = new Set<string>();
    for (const row of (data ?? []) as { id?: string | null }[]) {
      if (typeof row.id === "string" && row.id) archived.add(row.id);
    }
    return { ok: true, archived };
  } catch {
    return { ok: false };
  }
}

/**
 * The rows minus every archived organization — `ok: false` when the archive
 * state could not be read (the caller decides how to fail closed).
 */
export async function withoutArchivedOrganizations<T extends { readonly id: string }>(
  supabase: SupabaseClient,
  rows: readonly T[],
): Promise<{ readonly ok: true; readonly rows: readonly T[] } | { readonly ok: false }> {
  const read = await readArchivedOrganizationIds(
    supabase,
    rows.map((r) => r.id),
  );
  if (!read.ok) return { ok: false };
  return { ok: true, rows: rows.filter((r) => !read.archived.has(r.id)) };
}
