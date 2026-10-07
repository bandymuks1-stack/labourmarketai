import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { withSessionWorkspacePointer } from "@/lib/company/active-organization";
import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { listAllEvidenceRecords } from "./evidence-pagination";
import { readHistoryLookups } from "./history-context-read";
import { readCompetencySignalsForPerson, type PersonCompetencySignalsRead } from "./competency-signals-read";
import type { EvidenceRecordView } from "./import-core";
import type { PlaceObjectFacts } from "./company-work-history";
import { summarizePersonHistory, type PersonHistorySummary } from "./person-history-summary";

/**
 * THE COMPANY-SIDE HISTORICAL PERSON CARD — one roster person, keyed on
 * `organization_people.id`, readable BEFORE any account claim (2026-10-07).
 *
 * Owner invariant: history an organization supplied about a person exists
 * before that person has an account. Production holds 2,944 records whose only
 * subject is a roster row, 41 of 43 rows unlinked — and the only person page
 * (`/dashboard/people/[workerId]`) is keyed on a LINKED worker, so none of it
 * had a person to hang on. Claim only LATER links an account and hands the
 * person control; it gates nothing here (no fee, no third-party or owner
 * sign-off).
 *
 * Authority: the roster row is selected under the caller's own RLS AND bound to
 * the caller's ACTIVE governed organization (`resolveEvidenceOrganization`), so
 * a manager of another organization — or a person id from a different
 * organization — resolves to `not-found`, never to data. Nothing is written.
 *
 *   ready        the person, every live record (paged past the server's 1000
 *                row answer), the folded summary and the skill signals
 *   not-found    no such roster row in THIS organization
 *   hidden       personal workspace / no governance authority
 *   unavailable  a failed read — NEVER rendered as "no history"
 */

export interface CompanyPerson {
  readonly id: string;
  readonly name: string;
  readonly relationshipKind: string | null;
  readonly linkState: "unlinked" | "link_proposed" | "linked";
  readonly linkedWorkerId: string | null;
}

export type CompanyPersonLoad =
  | {
      readonly kind: "ready";
      readonly organizationName: string;
      readonly person: CompanyPerson;
      /** Live (not withdrawn) records, newest first as the read returns them. */
      readonly records: readonly EvidenceRecordView[];
      /** A safety ceiling was reached; the card must say the totals are partial. */
      readonly truncated: boolean;
      readonly summary: PersonHistorySummary;
      readonly signals: PersonCompetencySignalsRead;
    }
  | { readonly kind: "not-found" }
  | { readonly kind: "hidden" }
  | { readonly kind: "unavailable" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

const LINK_STATES = new Set(["unlinked", "link_proposed", "linked"]);

/** The authority-free part: given an organization the caller already governs. */
export async function readCompanyPerson(input: {
  readonly caller: DomainCaller;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly personId: string;
}): Promise<CompanyPersonLoad> {
  const { caller, organizationId, personId } = input;
  if (!UUID_RE.test(personId)) return { kind: "not-found" };
  const supabase = caller.supabase;

  const row = await db(supabase)
    .from("organization_people")
    .select("id, display_name, relationship_kind, link_state, linked_worker_id")
    .eq("id", personId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (row.error) {
    if (!MISSING_OBJECT_CODES.has(row.error.code ?? "")) {
      console.error("[company-person] roster read failed:", row.error.code);
    }
    return { kind: "unavailable" };
  }
  if (!row.data) return { kind: "not-found" };
  const linkState = LINK_STATES.has(row.data.link_state) ? row.data.link_state : "unlinked";
  const person: CompanyPerson = {
    id: row.data.id as string,
    name: ((row.data.display_name as string | null) ?? "").trim(),
    relationshipKind: (row.data.relationship_kind as string | null) ?? null,
    linkState,
    linkedWorkerId: linkState === "linked" ? ((row.data.linked_worker_id as string | null) ?? null) : null,
  };

  // EVERY record of this person — records WITHOUT a work object included.
  const recs = await listAllEvidenceRecords(caller, {
    organizationPersonId: personId,
    organizationId,
  });
  if (recs.kind !== "ok") return { kind: "unavailable" };
  const records = recs.records.filter((r) => !r.withdrawn);

  // Names of the places the records resolve to, under the caller's RLS. What
  // does not resolve is not named (the group then says so).
  const workObjectIds = [...new Set(records.map((r) => r.workObjectId).filter((v): v is string => !!v))];
  const lookups = await readHistoryLookups(supabase, { workObjectIds, projectIds: [], organizationIds: [] });
  const objects: PlaceObjectFacts[] = [...lookups.workObjects.entries()].map(([id, name]) => ({
    id,
    name,
    addressLine: null,
    city: null,
    projectId: null,
    archived: false,
  }));

  const signals = await readCompetencySignalsForPerson(
    supabase,
    records.map((r) => r.id),
  );

  return {
    kind: "ready",
    organizationName: input.organizationName,
    person,
    records,
    truncated: recs.truncated,
    summary: summarizePersonHistory(records, objects),
    signals,
  };
}

export async function loadCompanyPerson(locale: string, personId: string): Promise<CompanyPersonLoad> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "hidden" };
  const caller = await withSessionWorkspacePointer({ supabase, userId: user.id, locale });
  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) {
    return org.reason === "error" || org.reason === "needs-migration"
      ? { kind: "unavailable" }
      : { kind: "hidden" };
  }
  return readCompanyPerson({
    caller,
    organizationId: org.organizationId,
    organizationName: org.organizationName,
    personId,
  });
}
