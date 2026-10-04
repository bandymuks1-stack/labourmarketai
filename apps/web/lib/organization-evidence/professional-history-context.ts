/**
 * PROFESSIONAL-HISTORY CONTEXT — what a work-history record can honestly SAY
 * about the work behind its hours. Pure: no IO, no clock, no copy.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * A person's imported history reached Work in Numbers and the Living CV as
 * `{id, organizationId, workDate|period, hours}` — hours with the work taken
 * out. The evidence rows ALREADY carry the work: which project / site, which
 * client, in what capacity, from what source, supplied by whom, and what
 * anyone has said about it since. This module is the ONE place that turns
 * those columns into a reading, so the profile, the person page and the work
 * model cannot each describe the same record differently. It extends the one
 * evidence read; it is not a second store and copies no row.
 *
 * ── RULES (each is pinned by professional-history-context.test.ts) ─────────
 *  · ABSENT ≠ ZERO ≠ GUESSED (SEP-7). A field the record does not carry is
 *    `null` / omitted. A client is never inferred from a project name, a
 *    project is never inferred from free text, and a name that did not
 *    resolve is not shown as if it had.
 *  · EFFECTIVE DATE ≠ RECORDED DATE. `effective` is when the work happened
 *    (the day, or the period); `recordedAt` is when the platform received
 *    the record. They never share a field and the effective one is the one
 *    a surface leads with.
 *  · PROOF IS A SET OF DISTINCT FACTS, never one "verified" flag. An
 *    attestation by the supplying organisation is NOT client acceptance and
 *    NOT payment; client acceptance is NOT employer confirmation; none of
 *    them is independent verification. The vocabulary is the proof-concept
 *    one (`SELF_DECLARED`, `EVIDENCE_SUPPORTED`, `CLIENT_ACCEPTED`,
 *    `EMPLOYER_CONFIRMED`, `SUPERVISOR_CONFIRMED`, `INDEPENDENTLY_VERIFIED`).
 *  · THE IMPORTER IS NOT THE CONFIRMER. Who uploaded the file
 *    (`imported_by_profile_id`) is never an input here; confirmation comes
 *    only from the append-only attestation / verification events.
 *  · PAYMENT is not a concept this module can express: nothing in the
 *    evidence store records one, so nothing here may imply one.
 *
 * ── THE SEAM ────────────────────────────────────────────────────────────────
 * `ProofConcept` below is a LOCAL mirror of the vocabulary defined by the
 * journal-side `confirmation-origin` module (EVID-2, PR #2143, not on main
 * when this was written). Same literals on purpose: once that module is on
 * main, replace this alias with `import type { ProofConcept } from
 * "@/lib/journal/confirmation-origin"` and delete the local union — no
 * caller changes, because callers use these literals. `SUPERVISOR_CONFIRMED`
 * is reserved and never derived (no canonical source exists yet).
 */

export type ProofConcept =
  | "SELF_DECLARED"
  | "EVIDENCE_SUPPORTED"
  | "CLIENT_ACCEPTED"
  | "EMPLOYER_CONFIRMED"
  | "SUPERVISOR_CONFIRMED"
  | "INDEPENDENTLY_VERIFIED";

/** Party roles that name the CLIENT side of the work. */
export const CLIENT_PARTY_ROLES = ["client", "end_client", "project_owner"] as const;
const CLIENT_ROLE_SET: ReadonlySet<string> = new Set(CLIENT_PARTY_ROLES);

/** `row_origin` values written by the historical timesheet writer: the row
 *  was rebuilt from an earlier record (a file, or an assistant's reading of
 *  one). `typed` is a person's own entry and is NOT a reconstruction. */
const RECONSTRUCTED_ORIGINS: ReadonlySet<string> = new Set(["parsed_file", "agent_rows"]);

export interface HistoryParty {
  readonly role: string;
  readonly organizationId: string | null;
  readonly label: string | null;
}

export interface HistoryContextInput {
  readonly activityDate: string | null;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  /** When the platform received the record. NEVER the date of the work. */
  readonly importedAt: string | null;
  /** The source's own free-text context cell. */
  readonly contextLabel: string | null;
  readonly activityKind: string | null;
  /** Resolved names (null = the id did not resolve under the caller's RLS). */
  readonly workObjectId: string | null;
  readonly workObjectName: string | null;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly parties: readonly HistoryParty[];
  /** Organization names by id, for parties that are platform organizations. */
  readonly organizationNames?: ReadonlyMap<string, string> | null;
  /** The roster relationship (employee, subcontractor, …). */
  readonly relationshipKind: string | null;
  readonly supplierRole: string | null;
  readonly supplierOrganizationId: string | null;
  readonly sourceKind: string | null;
  readonly rowOrigin: string | null;
  /** The record's REPORTED (base) state, before any lifecycle event. */
  readonly reportedState: string | null;
  readonly attestation: { readonly role: string | null; readonly self: boolean } | null;
  readonly independentlyVerified: boolean;
  /** Somebody with standing contests it right now. */
  readonly contested: boolean;
}

export interface HistoryClient {
  readonly role: string;
  readonly organizationId: string | null;
  readonly label: string;
}

export interface HistoryContext {
  /** The ordered work (a project) the record belongs to. Name only when it
   *  resolved; `null` project = none recorded. */
  readonly project: { readonly id: string; readonly name: string } | null;
  /** The place / work package (work object), when it resolved and says
   *  something the source's own context cell does not already say. */
  readonly place: { readonly id: string; readonly name: string } | null;
  /** Client side parties that carry a name. Empty = none recorded. */
  readonly clients: readonly HistoryClient[];
  /** Other recorded parties (subcontractor, agency, …) that carry a name. */
  readonly otherParties: readonly HistoryClient[];
  /** What the person was to the supplying organisation. */
  readonly relationshipKind: string | null;
  readonly activityKind: string | null;
  /** WHEN THE WORK HAPPENED. */
  readonly effective:
    | { readonly kind: "day"; readonly date: string }
    | { readonly kind: "period"; readonly start: string; readonly end: string }
    | null;
  /** When the platform received it (YYYY-MM-DD). Separate by construction. */
  readonly recordedAt: string | null;
  readonly source: {
    readonly kind: string | null;
    readonly supplierRole: string | null;
    readonly supplierOrganizationId: string | null;
    /** The supplying organisation's name when it resolved. "Supplied by" is
     *  provenance, never a confirmation. */
    readonly supplierName: string | null;
    /** Rebuilt from an earlier record, not entered as it happened. */
    readonly reconstructed: boolean;
  };
  readonly proof: {
    /** Distinct facts that hold. Empty = nobody has said anything yet. */
    readonly concepts: readonly ProofConcept[];
    /** Capacity of a non-self attester, when one stands. */
    readonly attestedByRole: string | null;
    readonly contested: boolean;
  };
  /** At least one field beyond the record's own date/hours is worth showing. */
  readonly hasDetail: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").trim().toLocaleLowerCase();
}

function clean(s: string | null | undefined): string | null {
  const v = s?.trim();
  return v ? v : null;
}

function namedParties(
  parties: readonly HistoryParty[],
  names: ReadonlyMap<string, string> | null | undefined,
  pick: (role: string) => boolean,
): HistoryClient[] {
  const out: HistoryClient[] = [];
  const seen = new Set<string>();
  for (const p of parties) {
    if (!pick(p.role)) continue;
    // A party is shown only by a name the record or the platform gave it.
    const label = clean(p.label) ?? (p.organizationId ? clean(names?.get(p.organizationId)) : null);
    if (!label) continue;
    const key = `${p.role}|${norm(label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ role: p.role, organizationId: p.organizationId, label });
  }
  return out;
}

/**
 * The proof facts that hold for one record. A SET, not a ladder.
 *
 *   SELF_DECLARED         the person reported it, or the person attested it
 *   EVIDENCE_SUPPORTED    an organisation's record backs it (the record exists
 *                         and has a standing supplier) — NOT a confirmation
 *   CLIENT_ACCEPTED       a client / end client attested it (not the subject)
 *   EMPLOYER_CONFIRMED    an employer attested it (not the subject)
 *   INDEPENDENTLY_VERIFIED  a standing independent verification event
 *
 * Any other attester (agency, subcontractor, project owner, institution…)
 * yields EVIDENCE_SUPPORTED only, with the capacity carried as
 * `attestedByRole`: a real attestation, but neither client acceptance nor
 * employer confirmation.
 */
export function deriveHistoryProof(input: {
  readonly reportedState: string | null;
  readonly attestation: { readonly role: string | null; readonly self: boolean } | null;
  readonly independentlyVerified: boolean;
  readonly contested: boolean;
}): HistoryContext["proof"] {
  const out = new Set<ProofConcept>();
  const att = input.attestation;
  if (input.reportedState === "SELF_REPORTED" || att?.self) out.add("SELF_DECLARED");
  const orgSupplied =
    input.reportedState === "ORGANIZATION_REPORTED" ||
    input.reportedState === "LEGACY_IMPORTED" ||
    input.reportedState === "UNVERIFIED";
  if (orgSupplied || (att && !att.self)) out.add("EVIDENCE_SUPPORTED");
  let attestedByRole: string | null = null;
  if (att && !att.self) {
    attestedByRole = att.role;
    if (att.role === "client" || att.role === "end_client") out.add("CLIENT_ACCEPTED");
    else if (att.role === "employer") out.add("EMPLOYER_CONFIRMED");
  }
  if (input.independentlyVerified) out.add("INDEPENDENTLY_VERIFIED");
  const order: ProofConcept[] = [
    "SELF_DECLARED",
    "EVIDENCE_SUPPORTED",
    "EMPLOYER_CONFIRMED",
    "CLIENT_ACCEPTED",
    "SUPERVISOR_CONFIRMED",
    "INDEPENDENTLY_VERIFIED",
  ];
  return {
    concepts: order.filter((c) => out.has(c)),
    attestedByRole,
    contested: input.contested,
  };
}

export function buildHistoryContext(i: HistoryContextInput): HistoryContext {
  const projectName = clean(i.projectName);
  const project = i.projectId && projectName ? { id: i.projectId, name: projectName } : null;

  const placeName = clean(i.workObjectName);
  // A place that only repeats the source's own context cell, or the project's
  // name, adds nothing — and a second copy of one fact reads as two facts.
  const placeIsNew =
    placeName !== null &&
    norm(placeName) !== norm(i.contextLabel) &&
    norm(placeName) !== norm(projectName);
  const place = i.workObjectId && placeName && placeIsNew ? { id: i.workObjectId, name: placeName } : null;

  const clients = namedParties(i.parties, i.organizationNames, (r) => CLIENT_ROLE_SET.has(r));
  const otherParties = namedParties(
    i.parties,
    i.organizationNames,
    (r) => !CLIENT_ROLE_SET.has(r),
  );

  let effective: HistoryContext["effective"] = null;
  if (i.activityDate && ISO_DAY.test(i.activityDate)) {
    effective = { kind: "day", date: i.activityDate };
  } else if (
    i.periodStart &&
    i.periodEnd &&
    ISO_DAY.test(i.periodStart) &&
    ISO_DAY.test(i.periodEnd)
  ) {
    effective = { kind: "period", start: i.periodStart, end: i.periodEnd };
  }

  const recordedAt = i.importedAt && ISO_DAY.test(i.importedAt.slice(0, 10)) ? i.importedAt.slice(0, 10) : null;
  const reconstructed = i.rowOrigin !== null && RECONSTRUCTED_ORIGINS.has(i.rowOrigin);
  const proof = deriveHistoryProof(i);
  const relationshipKind = clean(i.relationshipKind);

  const hasDetail =
    project !== null ||
    place !== null ||
    clients.length > 0 ||
    otherParties.length > 0 ||
    relationshipKind !== null ||
    reconstructed ||
    proof.concepts.length > 0 ||
    proof.contested;

  return {
    project,
    place,
    clients,
    otherParties,
    relationshipKind,
    activityKind: clean(i.activityKind),
    effective,
    recordedAt,
    source: {
      kind: clean(i.sourceKind),
      supplierRole: clean(i.supplierRole),
      supplierOrganizationId: i.supplierOrganizationId,
      supplierName: i.supplierOrganizationId
        ? clean(i.organizationNames?.get(i.supplierOrganizationId))
        : null,
      reconstructed,
    },
    proof,
    hasDetail,
  };
}
