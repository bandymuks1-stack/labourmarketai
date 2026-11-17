import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkToday } from "@/lib/time/local-day";
import { buildCompanyWorkHistory } from "./company-work-history";
import { readOrganizationJournal } from "./company-work-history-read";
import { EVIDENCE_PAGE_SIZE, EVIDENCE_READ_CEILING, readAllPages } from "./evidence-pagination";
import { untypedClient } from "./evidence-store";
import { queryEvidenceRecords, type EvidenceRecordView } from "./import-core";
import {
  buildPublicOrganizationCv,
  publicProjectIds,
  type PublicOrganizationCv,
} from "./public-organization-cv-model";
import { summarizeOrganizationProjects } from "./organization-projects";

/**
 * THE PUBLIC COMPANY LIVING CV (register 3.36, owner decision 2026-11-16).
 *
 * The owner's rules, all enforced here and pinned by
 * `lib/guards/public-organization-cv.test.ts`:
 *   1. aggregated data only — counts, hours and months leave this module,
 *      never a row, an id, a name, a place or a text;
 *   2. a minimum group of 5 people behind every figure (k >= 5);
 *   3. only while the organization's public profile is switched on;
 *   4. no personal data.
 *
 * The member view reads through the member's own session (RLS). An anonymous
 * visitor has no session that could read these tables, so this module reads
 * with the service role — the server-trusted cross-tenant work that client
 * exists for — and only AFTER the explicit authorization check: the
 * organization's own `public_profile_enabled` opt-in, read here, not taken
 * from the caller. The figures come from the same summarizers as the member
 * view (one counting model), and only `buildPublicOrganizationCv`'s output —
 * aggregates past the k >= 5 gate — is returned. Any failed read hides the
 * block it feeds: UNKNOWN is never shown as a figure.
 */
async function readPublicOrganizationCvUncached(organizationId: string): Promise<PublicOrganizationCv | null> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const db = untypedClient;

  // 1. The opt-in, read fresh: nothing is read further unless it is on.
  const org = await db(admin)
    .from("organizations")
    .select("public_profile_enabled")
    .eq("id", organizationId)
    .maybeSingle();
  if (org.error || !org.data || (org.data as { public_profile_enabled?: boolean }).public_profile_enabled !== true) {
    return null;
  }

  const [projectRows, contextRows, journal, own] = await Promise.all([
    readAllPages<{ id: string; status: string | null; created_at: string }>((from, to) =>
      db(admin)
        .from("projects")
        .select("id, status, created_at")
        .eq("organization_id", organizationId)
        .neq("record_state", "duplicate")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // The projects the journal's engagement contexts name (for P3-3 below).
    readAllPages<{ project_id: string | null }>((from, to) =>
      db(admin)
        .from("engagement_contexts")
        .select("project_id")
        .eq("organization_id", organizationId)
        .not("project_id", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    // P3-1 (R2, 2026-11-17): once #3421 lands, a manager reads a learning
    // relationship's journal (relationship_types.category = 'education') only
    // while the engagement is active and journal review is on. This service-
    // role path must then apply the same condition to the engagement contexts
    // it counts; follow-up tracked in the issue linked from #3464.
    readOrganizationJournal(admin as never, organizationId, resolveWorkToday({ timeZone: null })),
    readOwnHistory(admin, organizationId),
  ]);

  const history = own?.history ?? null;
  // P3-3 (R2, 2026-11-17): only projects a block that passed the gate points
  // at are counted; an unreadable context list hides the projects count.
  const linked = contextRows
    ? publicProjectIds({
        journal,
        history,
        journalProjectIds: contextRows.rows.map((r) => r.project_id).filter((id): id is string => !!id),
        historyProjectIds: own?.projectIds ?? [],
      })
    : null;
  return buildPublicOrganizationCv({
    enabled: true,
    projects:
      projectRows && linked
        ? summarizeOrganizationProjects(
            projectRows.rows
              .filter((r) => linked.has(r.id))
              .map((r) => ({ id: r.id, title: null, city: null, status: r.status, createdAt: r.created_at })),
          )
        : null,
    journal,
    history,
  });
}

/** The organization's OWN imported records, paged to the end, effective ones
 *  only (the member view's rule). A ceiling hit or a failed page → null: a
 *  partial total is never published. */
async function readOwnHistory(admin: ReturnType<typeof createAdminClient>, organizationId: string) {
  const all: EvidenceRecordView[] = [];
  for (let offset = 0; ; offset += EVIDENCE_PAGE_SIZE) {
    const page = await queryEvidenceRecords(admin as never, {
      organizationId,
      includeSuperseded: true,
      limit: EVIDENCE_PAGE_SIZE,
      offset,
    });
    if (page.kind !== "ok") return null;
    all.push(...page.records);
    if (page.records.length < EVIDENCE_PAGE_SIZE) break;
    if (all.length >= EVIDENCE_READ_CEILING) return null;
  }
  const live = all.filter((r) => !r.superseded);
  return {
    history: buildCompanyWorkHistory(live, []),
    projectIds: live.filter((r) => !r.withdrawn && r.projectId).map((r) => r.projectId as string),
  };
}

/** How long one public read is reused. A visitor's view is at most this old;
 *  switching the public profile off still hides the whole page at once,
 *  because the page's own opt-in read is not cached. */
export const PUBLIC_CV_REVALIDATE_SECONDS = 300;

/**
 * THE ONLY EXPORT THE PAGE USES. One service-role read per organization per
 * PUBLIC_CV_REVALIDATE_SECONDS, however many anonymous views there are (R2 P2
 * on #3464: the uncached read ran up to 20,000 records and every journal
 * entry per hit). Keyed by the organization id; the result is plain data.
 */
export const readPublicOrganizationCv = unstable_cache(
  readPublicOrganizationCvUncached,
  ["public-organization-cv-v1"],
  { revalidate: PUBLIC_CV_REVALIDATE_SECONDS },
);
