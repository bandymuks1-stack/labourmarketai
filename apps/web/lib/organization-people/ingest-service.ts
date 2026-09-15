import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import type { RosterPerson } from "@/lib/organization-evidence/person-matching";
import {
  MAX_PEOPLE_PER_BATCH,
  peopleToCreate,
  planPeopleIngest,
  RELATIONSHIPS_NEEDING_MIGRATION,
  type IngestPlan,
  type IngestRelationship,
  type PersonSource,
  type RowResolution,
} from "./ingest-core";

/**
 * THE PEOPLE-INGEST SERVICE — one implementation, every transport.
 *
 * The web import panel (a cookie session, through `ingest-actions.ts`) and an
 * authorized assistant over `/api/mcp` (a bearer token, through
 * `lib/capabilities/people-ingest-capabilities.ts`) both enter HERE. Neither
 * owns a copy of this logic.
 *
 * WHY THIS FILE EXISTS AT ALL. The server actions derived the caller
 * themselves from `cookies()`, which is correct for a form post and useless
 * for every other client: a ChatGPT call carries a bearer token and has no
 * cookie to read. Rather than write a second preview/commit for the second
 * transport — the exact duplication the evidence import avoided by splitting
 * `import-core` from `import-actions` — the body moves down here and takes
 * the caller as an argument. The two transports differ in HOW the caller is
 * established and in nothing else.
 *
 * AUTHORIZATION IS UNCHANGED BY THE MOVE. The organization still comes from
 * `resolveEvidenceOrganization` (the caller's OWN memberships, governance
 * role must carry `import-evidence`), every query still runs on the caller's
 * own RLS-scoped client, and no transport may name an organization it does
 * not already belong to. A `DomainCaller` is a caller the transport has
 * ALREADY authenticated; this module authenticates nobody and trusts no id
 * that arrives from a client.
 */

export type IngestFailure =
  | { readonly kind: "not-authorized"; readonly reason: string }
  | {
      readonly kind: "choice-required";
      readonly options: readonly { readonly id: string; readonly name: string }[];
    }
  /** The `candidate` relationship needs migration 20260910120000. NOT "no data". */
  | { readonly kind: "needs-migration"; readonly relationship: IngestRelationship }
  | { readonly kind: "too-many-rows"; readonly limit: number }
  | { readonly kind: "unresolved"; readonly plan: IngestPlan }
  | { readonly kind: "error" };

export type IngestPreviewResult =
  | { readonly kind: "ok"; readonly organizationId: string; readonly plan: IngestPlan }
  | IngestFailure;

export type IngestCommitResult =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly created: number;
      readonly skippedExisting: number;
      readonly skippedDuplicate: number;
      readonly skippedUnusable: number;
    }
  | IngestFailure;

/** `organization_people` is newer than the generated types, exactly as
 *  `import-core.ts` finds it. Same escape hatch, same one place, same
 *  disable — the alternative is hand-writing a Database type for a table the
 *  generator will produce on its next run. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(c: SupabaseClient): any {
  return c;
}

/** Driver codes that mean "the object is not provisioned here". */
const MISSING_OBJECT = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
/** A CHECK refusal — the value is not in the column's domain. */
const CHECK_VIOLATION = "23514";

async function loadRoster(
  caller: DomainCaller,
  organizationId: string,
): Promise<RosterPerson[] | null> {
  const res = await db(caller.supabase)
    .from("organization_people")
    .select("id, display_name, normalized_name, external_ref")
    .eq("organization_id", organizationId)
    .limit(20_000);
  if (res.error) return null;
  return ((res.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    displayName: r.display_name as string,
    normalizedName: r.normalized_name as string,
    externalRef: (r.external_ref as string | null) ?? null,
  }));
}

/** Resolve the organization the caller may import into, translating the
 *  resolver's own refusals into this module's vocabulary once. */
async function organizationFor(
  caller: DomainCaller,
  organizationId?: string | null,
): Promise<{ ok: true; id: string } | { ok: false; failure: IngestFailure }> {
  const org = await resolveEvidenceOrganization(caller, organizationId ?? undefined);
  if (org.ok) return { ok: true, id: org.organizationId };
  return {
    ok: false,
    failure:
      org.reason === "choice-required" || org.reason === "not-a-member"
        ? {
            kind: "choice-required",
            options: (org.options ?? []).map((o) => ({ id: o.id, name: o.name })),
          }
        : { kind: "not-authorized", reason: org.reason },
  };
}

/**
 * PLAN ONLY. Reads the organization's existing roster and says what the file
 * would mean. Writes nothing, so a person may always look before committing.
 */
export async function previewPeopleIngest(
  caller: DomainCaller,
  input: {
    readonly sources: readonly PersonSource[];
    readonly relationship: IngestRelationship | null;
    readonly organizationId?: string | null;
    readonly resolutions?: readonly RowResolution[];
  },
): Promise<IngestPreviewResult> {
  try {
    const org = await organizationFor(caller, input.organizationId);
    if (!org.ok) return org.failure;
    if ((input.sources?.length ?? 0) > MAX_PEOPLE_PER_BATCH) {
      return { kind: "too-many-rows", limit: MAX_PEOPLE_PER_BATCH };
    }
    const roster = await loadRoster(caller, org.id);
    if (roster === null) return { kind: "error" };
    return {
      kind: "ok",
      organizationId: org.id,
      plan: planPeopleIngest({
        sources: input.sources ?? [],
        roster,
        relationship: input.relationship,
        resolutions: input.resolutions,
      }),
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * COMMIT. Re-plans against the roster as it is NOW rather than trusting a
 * preview the client held: between looking and confirming, someone else may
 * have added the same people, and the roster is the authority at write time.
 *
 * Nothing commits while anything is unresolved — `peopleToCreate` returns
 * empty for an unanswered ambiguity or an unstated relationship, and this
 * reports that as `unresolved` instead of writing the easy rows and dropping
 * the questions.
 */
export async function commitPeopleIngest(
  caller: DomainCaller,
  input: {
    readonly sources: readonly PersonSource[];
    readonly relationship: IngestRelationship;
    /** Answers the human gave to ambiguities in the preview. */
    readonly resolutions?: readonly RowResolution[];
    readonly organizationId?: string | null;
  },
): Promise<IngestCommitResult> {
  try {
    const org = await organizationFor(caller, input.organizationId);
    if (!org.ok) return org.failure;
    if ((input.sources?.length ?? 0) > MAX_PEOPLE_PER_BATCH) {
      return { kind: "too-many-rows", limit: MAX_PEOPLE_PER_BATCH };
    }
    const roster = await loadRoster(caller, org.id);
    if (roster === null) return { kind: "error" };

    const plan = planPeopleIngest({
      sources: input.sources ?? [],
      roster,
      relationship: input.relationship,
      resolutions: input.resolutions,
    });
    if (plan.kind !== "plan") return { kind: "too-many-rows", limit: MAX_PEOPLE_PER_BATCH };
    const rows = peopleToCreate(plan);
    if (rows.length === 0 && (plan.needsReconciliation || plan.needsRelationship)) {
      return { kind: "unresolved", plan };
    }

    let created = 0;
    if (rows.length > 0) {
      // ONE batch insert with EXACTLY the column set `createRosterPerson`
      // writes for a single person — a guard pins the two together, so the
      // batch path can never drift from the audited one-person writer. It is
      // a batch rather than a loop because 500 sequential round trips is not
      // an architecture that reaches 5 000 people.
      const { data, error } = await db(caller.supabase)
        .from("organization_people")
        .insert(
          rows.map((r) => ({
            organization_id: org.id,
            display_name: r.displayName,
            normalized_name: r.normalizedName,
            external_ref: r.externalRef,
            relationship_kind: r.relationshipKind,
            source_note: r.sourceNote,
            created_by: caller.userId,
            // THE CONSENT LIFECYCLE STARTS CLOSED. An organization recording
            // a person is not that person agreeing to anything; linking to a
            // real account is a separate, later, human act.
            link_state: "unlinked",
          })),
        )
        .select("id");
      if (error) {
        const code = (error as { code?: string }).code ?? "";
        if (MISSING_OBJECT.has(code)) {
          return { kind: "needs-migration", relationship: input.relationship };
        }
        // A CHECK refusal on a relationship this build knows needs a
        // migration is exactly that, and NOT a generic failure.
        if (
          code === CHECK_VIOLATION &&
          RELATIONSHIPS_NEEDING_MIGRATION.includes(input.relationship)
        ) {
          return { kind: "needs-migration", relationship: input.relationship };
        }
        return { kind: "error" };
      }
      const insertedIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
      // READBACK. "The write returned without an exception" is not evidence
      // that anything persisted (#1314 / SEP-7). Count the rows that are
      // actually there, by id, under the caller's own RLS.
      const back = await db(caller.supabase)
        .from("organization_people")
        .select("id")
        .eq("organization_id", org.id)
        .in("id", insertedIds.length > 0 ? insertedIds : ["00000000-0000-0000-0000-000000000000"]);
      if (back.error) return { kind: "error" };
      created = ((back.data ?? []) as unknown[]).length;
      // A short write is a real failure, not a smaller success.
      if (created !== insertedIds.length) return { kind: "error" };
    }

    return {
      kind: "ok",
      organizationId: org.id,
      created,
      skippedExisting: plan.counts.alreadyOnRoster,
      skippedDuplicate: plan.counts.duplicateInBatch,
      skippedUnusable: plan.counts.unusable,
    };
  } catch {
    return { kind: "error" };
  }
}
