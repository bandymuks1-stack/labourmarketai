"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { DomainCaller } from "@/lib/domain/caller";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import {
  INGEST_RELATIONSHIPS,
  type IngestPlan,
  type IngestRelationship,
  type PersonSource,
  type RowResolution,
} from "./ingest-core";
import {
  PEOPLE_FILE_MAX_BYTES,
  readPeopleFile,
} from "./ingest-file";
import {
  commitPeopleIngest,
  previewPeopleIngest,
  type IngestCommitResult,
  type IngestFailure,
  type IngestPreviewResult,
} from "./ingest-service";

/**
 * THE COOKIE TRANSPORT for bringing people into an organization's roster.
 *
 * This file is now ONLY a transport: it establishes WHO is calling from the
 * browser session and hands off to `ingest-service.ts`, which both this and
 * the assistant/MCP transport (`lib/capabilities/people-ingest-capabilities.ts`)
 * share. There is deliberately no preview or commit implementation here to
 * drift from the other one — the previous version owned that logic, and a
 * second transport would have had to copy it.
 *
 * ── AUTHORIZATION IS NOT RE-INVENTED ──────────────────────────────────────
 * The organization is resolved by `resolveEvidenceOrganization`, the SAME
 * membership-validated resolver the evidence import already uses, so "may I
 * act for this organization?" has one answer in this product and not two. The
 * client never names an organization id and could not use one if it did: the
 * id comes from the caller's own memberships, and every write additionally
 * passes the RLS policies already on `organization_people`.
 *
 * CAPABILITY IS NOT AUTHORIZATION. Reading an organization as an agency says
 * what its outcomes ARE; it grants nothing. A person who manages nothing gets
 * `not-authorized` here whatever their organization declares about itself.
 *
 * ── WHAT IT WRITES ────────────────────────────────────────────────────────
 * `organization_people` rows and nothing else (the write itself lives in the
 * service). Not `company_memberships` — an ordinary worker, candidate or
 * learner is never made a governance member to be represented. Not `profiles`
 * and not `auth.users` — a person exists here without an account, which is the
 * whole reason this table exists, and every row starts `link_state =
 * 'unlinked'` so the existing consent lifecycle (unlinked → link_proposed →
 * linked) is where a real account is joined to a roster record, by a human
 * act, later.
 *
 * Not a CV. Professional history, skills and qualifications are NOT written
 * here: an organization's claim about a person is not that person's own
 * claim, and neither is verified evidence. What travels with the row is the
 * name, the organization's own reference and a provenance note saying which
 * file and line it came from.
 */

/** Server actions ARE endpoints: the caller is re-derived, never trusted. */
async function callerOrNull(): Promise<DomainCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

/**
 * PLAN ONLY. Reads the organization's existing roster and says what the file
 * would mean. Writes nothing, so a person may always look before committing.
 */
export async function previewPeopleIngestAction(input: {
  readonly sources: readonly PersonSource[];
  readonly relationship: IngestRelationship | null;
}): Promise<IngestPreviewResult> {
  const caller = await callerOrNull();
  if (!caller) return { kind: "not-authorized", reason: "not-signed-in" };
  return previewPeopleIngest(caller, {
    sources: input.sources ?? [],
    relationship: input.relationship,
  });
}

/**
 * COMMIT. Re-plans against the roster as it is NOW rather than trusting a
 * preview the client held, and refuses while anything is unresolved. Both
 * rules live in the shared service.
 */
export async function commitPeopleIngestAction(input: {
  readonly sources: readonly PersonSource[];
  readonly relationship: IngestRelationship;
  /** Answers the human gave to ambiguities in the preview. */
  readonly resolutions?: readonly RowResolution[];
}): Promise<IngestCommitResult> {
  const caller = await callerOrNull();
  if (!caller) return { kind: "not-authorized", reason: "not-signed-in" };
  return commitPeopleIngest(caller, {
    sources: input.sources ?? [],
    relationship: input.relationship,
    resolutions: input.resolutions,
  });
}

// ── THE HUMAN ENTRY: a file an authorized person attached ───────────────────

export type PeopleFilePreview =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly sourceLabel: string;
      /** The parsed people, echoed so the confirm step commits what was SHOWN. */
      readonly sources: readonly PersonSource[];
      readonly plan: IngestPlan;
    }
  | { readonly kind: "no-name-column"; readonly headers: readonly string[] }
  | { readonly kind: "unsupported-file"; readonly filename: string }
  | { readonly kind: "file-too-large"; readonly limit: number }
  | { readonly kind: "nothing-parsed" }
  | IngestFailure;

/**
 * A FILE, PREVIEWED. The bytes go through the shared reader
 * (`ingest-file.ts`), the meaning through the shared planner.
 *
 * NOTHING IS WRITTEN. This is the "see what we understood" step, and it is
 * the whole reason a commit is a second, separate act.
 */
export async function previewPeopleFileAction(form: FormData): Promise<PeopleFilePreview> {
  try {
    const caller = await callerOrNull();
    if (!caller) return { kind: "not-authorized", reason: "not-signed-in" };
    const org = await resolveEvidenceOrganization(caller);
    if (!org.ok) {
      return org.reason === "choice-required" || org.reason === "not-a-member"
        ? { kind: "choice-required", options: (org.options ?? []).map((o) => ({ id: o.id, name: o.name })) }
        : { kind: "not-authorized", reason: org.reason };
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return { kind: "nothing-parsed" };
    if (file.size > PEOPLE_FILE_MAX_BYTES) {
      return { kind: "file-too-large", limit: PEOPLE_FILE_MAX_BYTES };
    }
    const filename = file.name || "file";

    const read = await readPeopleFile(filename, Buffer.from(await file.arrayBuffer()));
    if (read.kind !== "ok") return read;

    const relationship = readRelationship(form.get("relationship"));
    // The plan comes from the SAME service the assistant transport uses, so a
    // file previewed in the browser and the same file previewed through an
    // assistant cannot disagree about what it means.
    const planned = await previewPeopleIngest(caller, {
      sources: read.people,
      relationship,
      organizationId: org.organizationId,
    });
    if (planned.kind !== "ok") return planned;

    return {
      kind: "ok",
      organizationId: planned.organizationId,
      sourceLabel: filename,
      sources: read.people,
      plan: planned.plan,
    };
  } catch {
    return { kind: "error" };
  }
}

function readRelationship(v: FormDataEntryValue | null): IngestRelationship | null {
  const s = typeof v === "string" ? v.trim() : "";
  return (INGEST_RELATIONSHIPS as readonly string[]).includes(s)
    ? (s as IngestRelationship)
    : null;
}
