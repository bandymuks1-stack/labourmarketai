import "server-only";

import { createClient } from "@/lib/supabase/server";
import { withSessionWorkspacePointer, listWorkspaceMemberships } from "@/lib/company/active-organization";
import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { untypedClient } from "./evidence-store";
import { listEvidenceRecords, listRecordIdsAttributedTo } from "./import-core";
import {
  buildCompanyWorkHistory,
  type CompanyWorkHistory,
  type PlaceObjectFacts,
} from "./company-work-history";

/**
 * Loads the ACTIVE organization's imported work history through the caller's
 * own RLS session (never service role) — the same records the history door
 * lists per session, here folded by place. Fail-closed and honest:
 *
 *   ready        the history, possibly empty (`history.totalRecords === 0`)
 *   elsewhere    the active organization has none, but ANOTHER organization the
 *                caller belongs to does — said by name, so a person acting in
 *                the wrong workspace is told where the work is, not that it
 *                never existed
 *   unavailable  a failed read — NEVER rendered as "no history"
 *   hidden       personal workspace / no authority: nothing to show
 */
export type CompanyWorkHistoryLoad =
  | {
      readonly kind: "ready";
      readonly organizationName: string;
      readonly history: CompanyWorkHistory;
      readonly elsewhere: readonly { readonly id: string; readonly name: string; readonly count: number }[];
      /** Roster person id → linked worker id (only `linked` rows). */
      readonly linkedWorkers: Readonly<Record<string, string>>;
      /** Records stored in ANOTHER organization's books that name this one as the performing company. */
      readonly attributedCount: number;
    }
  | { readonly kind: "unavailable" }
  | { readonly kind: "hidden" };

const db = untypedClient;
const LIMIT = 1000;

export async function loadCompanyWorkHistory(locale: string): Promise<CompanyWorkHistoryLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "hidden" };
  const caller: DomainCaller = await withSessionWorkspacePointer({
    supabase,
    userId: user.id,
    locale,
  });

  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    return org.reason === "error" || org.reason === "needs-migration"
      ? { kind: "unavailable" }
      : { kind: "hidden" };
  }

  const [recs, objs, people] = await Promise.all([
    listEvidenceRecords(caller, { organizationId: org.organizationId, limit: LIMIT }),
    db(supabase)
      .from("work_objects")
      .select("id, name, address_line, city, project_id, status")
      .eq("organization_id", org.organizationId)
      .limit(500),
    db(supabase)
      .from("organization_people")
      .select("id, linked_worker_id, link_state")
      .eq("organization_id", org.organizationId)
      .limit(500),
  ]);
  if (recs.kind !== "ok" || objs.error || people.error) return { kind: "unavailable" };

  const objects: PlaceObjectFacts[] = (
    (objs.data ?? []) as {
      id: string;
      name: string;
      address_line: string | null;
      city: string | null;
      project_id: string | null;
      status: string | null;
    }[]
  ).map((o) => ({
    id: o.id,
    name: o.name,
    addressLine: o.address_line,
    city: o.city,
    projectId: o.project_id,
    archived: o.status === "archived",
  }));
  const linkedWorkers: Record<string, string> = {};
  for (const p of (people.data ?? []) as {
    id: string;
    linked_worker_id: string | null;
    link_state: string | null;
  }[]) {
    if (p.link_state === "linked" && p.linked_worker_id) linkedWorkers[p.id] = p.linked_worker_id;
  }

  // Work stored in another organization's books but attributed HERE (a party
  // row naming this organization). The records SELECT policy already admits
  // them; they are read, never copied.
  let attributed: readonly (typeof recs.records)[number][] = [];
  const attributedIds = await listRecordIdsAttributedTo(caller, org.organizationId);
  if (attributedIds.kind === "ok") {
    const own = new Set(recs.records.map((r) => r.id));
    const wanted = attributedIds.recordIds.filter((id) => !own.has(id));
    if (wanted.length > 0) {
      const extra = await listEvidenceRecords(caller, { recordIds: wanted, limit: LIMIT });
      if (extra.kind === "ok") attributed = extra.records.filter((r) => r.organizationId !== org.organizationId);
    }
  }
  const history = buildCompanyWorkHistory([...recs.records, ...attributed], objects);

  // Where is the work if not here? Only when this organization holds none.
  const elsewhere: { id: string; name: string; count: number }[] = [];
  if (history.totalRecords === 0) {
    try {
      const memberships = await listWorkspaceMemberships(caller);
      for (const w of memberships) {
        if (w.kind !== "organization" || w.id === org.organizationId) continue;
        const c = await listEvidenceRecords(caller, { organizationId: w.id, limit: LIMIT });
        if (c.kind === "ok" && c.records.length > 0) {
          elsewhere.push({ id: w.id, name: w.name?.trim() || w.id, count: c.records.length });
        }
      }
    } catch {
      /* the hint is best-effort; the empty state stays honest without it */
    }
  }

  return {
    kind: "ready",
    organizationName: org.organizationName,
    history,
    elsewhere,
    linkedWorkers,
    attributedCount: attributed.length,
  };
}
