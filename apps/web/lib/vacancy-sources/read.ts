import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isExternalSourceActive } from "@/lib/intelligence/source-governance";
import { NAV_SOURCE_KEY } from "./nav-feed-contract";

/**
 * External-vacancy READ helper (Official Vacancy Source — NAV Norway v1).
 * The display surface ships DARK behind two independent gates:
 *
 *   1. CODE REGISTRY: isExternalSourceActive("nav_arbeidsplassen") — shipped
 *      legalStatus "unconfirmed" + activation "off", so this returns
 *      {available:false} before any query runs. Only the owner's registry
 *      flip (after the private-token registration + written terms
 *      confirmation) changes that.
 *   2. TABLE PRESENCE: the owner-gated external_vacancies migration. Until
 *      applied, the SELECT fails with 42P01 (relation not found) and the
 *      helper degrades to the same honest {available:false} — the section
 *      simply does not render (needs-migration probe pattern, mirroring
 *      lib/opportunities/interest.ts).
 *
 * ACTIVE ROWS ONLY: the NAV terms require inactive ads to disappear
 * immediately, so the read path never selects them (RLS enforces the same).
 */

const RELATION_NOT_FOUND = "42P01";

// The table is owner-gated (migration not applied ⇒ absent from the
// generated types) — the untyped escape hatch mirrors interest.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: unknown): any {
  return c;
}

export interface ExternalVacancyDisplayRow {
  readonly id: string;
  readonly title: string;
  readonly employerDisplayName: string | null;
  readonly locationCity: string | null;
  readonly locationMunicipal: string | null;
  readonly locationCounty: string | null;
  readonly publishedAt: string | null;
  readonly expiresAt: string | null;
  readonly engagementType: string | null;
  readonly canonicalSourceUrl: string;
  readonly applicationUrl: string | null;
  readonly sourceAttribution: string;
}

export interface ExternalVacanciesRead {
  /** False until the owner activates the source AND applies the migration. */
  readonly available: boolean;
  readonly rows: readonly ExternalVacancyDisplayRow[];
}

const UNAVAILABLE: ExternalVacanciesRead = { available: false, rows: [] };

/** Newest-published active external vacancies (bounded). */
export async function listActiveExternalVacancies(
  limit = 20,
): Promise<ExternalVacanciesRead> {
  // Gate 1: code-registry activation (fail-closed; today always false).
  if (!isExternalSourceActive(NAV_SOURCE_KEY)) return UNAVAILABLE;

  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase)
      .from("external_vacancies")
      .select(
        "id, title, employer_display_name, location_city, location_municipal, location_county, published_at, expires_at, engagement_type, canonical_source_url, application_url, source_attribution",
      )
      .eq("source_key", NAV_SOURCE_KEY)
      .eq("status", "active")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) {
      // Gate 2: table not applied yet (42P01 relation-not-found) — and any
      // other read failure — degrade to the honest dark state, never a
      // broken section. The code check is explicit for observability parity
      // with interest.ts even though both branches return the same state.
      if ((error as { code?: string }).code === RELATION_NOT_FOUND) {
        return UNAVAILABLE;
      }
      return UNAVAILABLE;
    }
    const rows: ExternalVacancyDisplayRow[] = [];
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = typeof r.id === "string" ? r.id : null;
      const title = typeof r.title === "string" ? r.title : null;
      const canonicalSourceUrl =
        typeof r.canonical_source_url === "string" ? r.canonical_source_url : null;
      if (!id || !title || !canonicalSourceUrl) continue;
      rows.push({
        id,
        title,
        employerDisplayName:
          typeof r.employer_display_name === "string" ? r.employer_display_name : null,
        locationCity: typeof r.location_city === "string" ? r.location_city : null,
        locationMunicipal:
          typeof r.location_municipal === "string" ? r.location_municipal : null,
        locationCounty:
          typeof r.location_county === "string" ? r.location_county : null,
        publishedAt: typeof r.published_at === "string" ? r.published_at : null,
        expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
        engagementType:
          typeof r.engagement_type === "string" ? r.engagement_type : null,
        canonicalSourceUrl,
        applicationUrl:
          typeof r.application_url === "string" ? r.application_url : null,
        sourceAttribution:
          typeof r.source_attribution === "string"
            ? r.source_attribution
            : "arbeidsplassen.no (NAV)",
      });
    }
    return { available: true, rows };
  } catch {
    return UNAVAILABLE;
  }
}
