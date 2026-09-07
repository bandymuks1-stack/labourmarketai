import "server-only";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { locales } from "@/lib/i18n/config";
import { REPORTED_EVIDENCE_STATES } from "@/lib/organization-evidence/evidence-state";
import {
  SOURCE_KINDS,
  SUPPLIER_ROLES,
  ATTESTATION_ROLES,
  attestRecord,
  buildPreview,
  commitImport,
  createImportSession,
  createRosterPerson,
  listEvidenceRecords,
  listRosterPeople,
  resolveRow,
  submitRows,
  withdrawImport,
  type EvidenceImportFailure,
} from "@/lib/organization-evidence/import-core";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import { fingerprintPayload } from "@/lib/organization-evidence/fingerprint";
import { sourceWorkRowSchema, MAX_ROWS_PER_SUBMIT } from "@/lib/organization-evidence/source-rows";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * ORGANIZATION EVIDENCE IMPORT — the AI/agent face of the SAME domain core the
 * web import UI uses.
 *
 * The owner requirement is explicit: an authorized assistant must be able to
 * resolve the organization, inspect its people, create a session, submit rows,
 * preview the matching, resolve ambiguities, commit, and read the result back —
 * and it must be the SAME implementation, not a second one. Every handler here
 * is a thin translation over `lib/organization-evidence/import-core.ts`.
 *
 * ── AUTHORIZATION IS ORGANIZATION-SCOPED, NEVER PERSON-SCOPED ──────────────
 * An assistant authenticated as a person does NOT thereby gain authority over
 * every organization that person can see. Three layers hold that:
 *
 *   1. the caller's own RLS-scoped client — `manages_organization()` decides
 *      every read and write, in the database;
 *   2. `resolveEvidenceOrganization` — the organization comes from the
 *      caller's OWN memberships and their governance role must carry
 *      `import-evidence`; a `member`, or employment alone, resolves nothing;
 *   3. an organization the caller names is a SELECTOR among those memberships,
 *      never a grant. An unknown one returns the real options.
 *
 * ── THE PREVIEW/COMMIT BOUNDARY IS REAL ────────────────────────────────────
 * Committing is a `confirm` capability behind a one-time, state-fingerprinted
 * token minted by the preview. An assistant therefore cannot commit anything it
 * has not first shown, and a replayed token is refused. That is the same
 * draft→confirm machinery the journal, interest, work-card and demand pairs
 * use — no new confirmation model.
 */

// ── shared failure translation ─────────────────────────────────────────────

/** Map the core's tagged failure onto the capability envelope. Every branch is
 *  a NAMED code: an unprovisioned store, a refusal and an outage must never
 *  collapse into one another. */
function fail(f: EvidenceImportFailure): ExecResult {
  switch (f.kind) {
    case "needs-migration":
      return {
        ok: false,
        code: "needs_migration",
        message:
          "The organization evidence store is not provisioned on this environment yet. " +
          "The migration is prepared and awaiting an owner gate; nothing was written.",
      };
    case "not-authorized":
      return {
        ok: false,
        code: "not_authorized",
        message: `Not authorized to import evidence for this organization (${f.reason}).`,
      };
    case "choice-required":
      return {
        ok: true,
        data: {
          status: "organization_choice_required",
          options: f.options.map((o) => ({ id: o.id, label: o.name })),
          note:
            "The organization is not exactly one of this caller's own. Ask the user to " +
            "choose, then call again with the chosen organizationId. NOTHING was written.",
        },
      };
    case "invalid":
      return { ok: false, code: "invalid", message: f.problems.join("; ") };
    case "not-found":
      return { ok: false, code: "not_found", message: "No such session, row or record." };
    case "too-many-rows":
      return {
        ok: false,
        code: "too_many_rows",
        message: `At most ${f.limit} rows. Split the source and submit in batches.`,
      };
    case "error":
      return { ok: false, code: "unavailable", message: "The evidence store could not be read." };
  }
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const appendWrite = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// ── evidence.organization.resolve ──────────────────────────────────────────

const orgResolveInput = z
  .object({ organization: z.string().min(1).max(200).optional() })
  .strict();

const organizationResolve: CapabilityDescriptor = {
  id: "evidence.organization.resolve",
  kind: "read",
  title: "Which organization am I importing evidence for",
  description:
    "Resolves the organization this caller may import historical evidence for, " +
    "from their OWN memberships and governance role. `organization` may be " +
    "omitted (the active workspace decides), or given as an id or exact name to " +
    "select among memberships — it is never a grant. Returns the labeled options " +
    "when the answer is genuinely ambiguous. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: orgResolveInput,
  run: async (caller: CapabilityCaller, input): Promise<ExecResult> => {
    const parsed = orgResolveInput.parse(input);
    const org = await resolveEvidenceOrganization(caller, parsed.organization ?? null);
    if (!org.ok) {
      if (org.reason === "choice-required" || org.reason === "not-a-member") {
        return fail({ kind: "choice-required", options: org.options ?? [] });
      }
      return fail({ kind: "not-authorized", reason: org.reason });
    }
    return {
      ok: true,
      data: {
        organizationId: org.organizationId,
        organizationName: org.organizationName,
        role: org.role,
        mayImportEvidence: true,
      },
    };
  },
};

// ── evidence.people.list / create ──────────────────────────────────────────

const peopleListInput = z
  .object({
    organization: z.string().min(1).max(200).optional(),
    search: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

const peopleList: CapabilityDescriptor = {
  id: "evidence.people.list",
  kind: "read",
  title: "People this organization knows",
  description:
    "Lists the organization's own roster people — the records historical " +
    "evidence attaches to. A person here is NOT a platform identity: an " +
    "unlinked row asserts nothing about who the human is until they claim it.",
  exposed: true,
  annotations: readOnly,
  inputSchema: peopleListInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = peopleListInput.parse(input);
    // THE core read — the same rows, the same RLS, the same shape the web
    // import roster panel renders. No capability-side query.
    const res = await listRosterPeople(caller, {
      organizationId: parsed.organization ?? null,
      search: parsed.search ?? null,
      limit: parsed.limit ?? null,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        organizationId: res.organizationId,
        people: res.people.map((p) => ({
          id: p.id,
          name: p.displayName,
          externalRef: p.externalRef,
          relationship: p.relationshipKind,
          linkState: p.linkState,
        })),
      },
    };
  },
};

const personCreateInput = z
  .object({
    organization: z.string().min(1).max(200).optional(),
    displayName: z.string().min(1).max(200),
    externalRef: z.string().min(1).max(120).nullish(),
    relationshipKind: z
      .enum([
        "employee",
        "former_employee",
        "agency_worker",
        "subcontractor",
        "contractor",
        "student",
        "graduate",
        "trainee",
        "apprentice",
        "programme_participant",
        "volunteer",
        "other",
      ])
      .optional(),
    sourceNote: z.string().max(500).nullish(),
  })
  .strict();

const personCreate: CapabilityDescriptor = {
  id: "evidence.person.create",
  kind: "execute",
  title: "Record a person this organization knows",
  description:
    "Creates an UNLINKED roster person so historical evidence can be imported " +
    "for someone who has no LabourMarket.ai account. It asserts nothing about " +
    "who the human is and links to nobody — the real person may later claim it " +
    "(they propose, a manager confirms). People are NEVER merged on a matching " +
    "name alone.",
  exposed: true,
  annotations: { ...appendWrite, idempotentHint: false },
  inputSchema: personCreateInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = personCreateInput.parse(input);
    const res = await createRosterPerson(caller, {
      organizationId: parsed.organization ?? null,
      displayName: parsed.displayName,
      externalRef: parsed.externalRef ?? null,
      relationshipKind: parsed.relationshipKind ?? "other",
      sourceNote: parsed.sourceNote ?? null,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: { personId: res.personId, name: res.displayName, linkState: "unlinked" },
    };
  },
};

// ── evidence.import.session ────────────────────────────────────────────────

const sessionCreateInput = z
  .object({
    organization: z.string().min(1).max(200).optional(),
    sourceKind: z.enum(SOURCE_KINDS),
    supplierRole: z.enum(SUPPLIER_ROLES),
    /** THE canonical UI locale set — the same list the DB CHECK carries, so a
     *  new locale can never be accepted here and refused there. */
    sourceLanguage: z.enum(locales),
    sourceFilename: z.string().min(1).max(300).nullish(),
    sourceReference: z.string().min(1).max(500).nullish(),
    /** A stable identifier for the source. Omitted → derived from the filename
     *  and reference, so the same named source resolves to the same session. */
    sourceFingerprint: z.string().min(16).max(128).optional(),
    notes: z.string().max(1000).nullish(),
    agentLabel: z.string().max(120).nullish(),
  })
  .strict();

const sessionCreate: CapabilityDescriptor = {
  id: "evidence.import.create_session",
  kind: "execute",
  title: "Start (or find) an evidence import",
  description:
    "Opens the immutable envelope for ONE source. IDEMPOTENT: the same source " +
    "for the same organization resolves to the SAME session — `reused: true` " +
    "says so — instead of importing twice. `supplierRole` is required and says " +
    "in what capacity the organization speaks (an agency reporting its worker's " +
    "hours on a client's site is neither the employer nor the client).",
  exposed: true,
  annotations: appendWrite,
  inputSchema: sessionCreateInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = sessionCreateInput.parse(input);
    const fingerprint =
      parsed.sourceFingerprint ??
      fingerprintPayload("agent-source", {
        filename: parsed.sourceFilename ?? null,
        reference: parsed.sourceReference ?? null,
        kind: parsed.sourceKind,
      });
    const res = await createImportSession(caller, {
      organizationId: parsed.organization ?? null,
      sourceKind: parsed.sourceKind,
      supplierRole: parsed.supplierRole,
      sourceFingerprint: fingerprint,
      sourceLanguage: parsed.sourceLanguage,
      sourceFilename: parsed.sourceFilename ?? null,
      sourceReference: parsed.sourceReference ?? null,
      notes: parsed.notes ?? null,
      actorKind: "agent",
      agentLabel: parsed.agentLabel ?? null,
    });
    if (res.kind !== "ok") return fail(res);
    return { ok: true, data: { session: res.session } };
  },
};

// ── evidence.import.submit_rows ───────────────────────────────────────────

const submitInput = z
  .object({
    sessionId: z.uuid(),
    rows: z.array(sourceWorkRowSchema).min(1).max(MAX_ROWS_PER_SUBMIT),
  })
  .strict();

const rowsSubmit: CapabilityDescriptor = {
  id: "evidence.import.submit_rows",
  kind: "execute",
  title: "Stage rows into an evidence import",
  description:
    "Stages a bounded batch of canonical rows. NOTHING here is evidence — no " +
    "surface reads staging as history. Each row must separate FACT from " +
    "DERIVED: `factFields` names what the SOURCE stated, `derived` carries every " +
    "inference with its method and confidence, and a field may never be both. " +
    "Retrying a batch cannot duplicate rows.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: submitInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = submitInput.parse(input);
    const res = await submitRows(caller, parsed.sessionId, parsed.rows);
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        inserted: res.inserted,
        skipped: res.skipped,
        totalInSession: res.totalInSession,
        note: "Staged only. Call evidence.import.preview next; nothing is evidence yet.",
      },
    };
  },
};

// ── evidence.import.preview (the draft leg) ───────────────────────────────

const previewInput = z.object({ sessionId: z.uuid() }).strict();

/**
 * The two halves of the commit token.
 *
 * `commitHashInput` is the DRAFT IDENTITY — what the client asked for, and the
 * only part it can restate. `readyFingerprint` is the STATE the preview
 * actually showed: the exact set of rows that would be written. Binding the
 * token to that set is what makes it genuinely one-time — committing turns
 * those rows into stored records, so the next preview classifies them as
 * `duplicate`, they stop being ready, the fingerprint moves, and a replayed
 * token fails as stale instead of writing anything twice.
 */
function commitHashInput(sessionId: string) {
  return { sessionId };
}

function readyFingerprint(rows: readonly { readonly id: string }[]): string {
  return `evidence-import-ready:v1:${rows.map((r) => r.id).sort().join(",")}`;
}

const importPreview: CapabilityDescriptor = {
  id: "evidence.import.preview",
  kind: "draft",
  title: "Preview what an evidence import would write",
  description:
    "Matches people and places, detects duplicates, and returns exactly what " +
    "would be written, field by field, with FACT and DERIVED separated. " +
    "Duplicate states are four — new, duplicate, probable_duplicate, conflict — " +
    "and a conflict is never silently discarded. NOTHING becomes evidence here. " +
    "Returns a one-time confirmation token for evidence.import.commit.",
  exposed: true,
  annotations: readOnly,
  inputSchema: previewInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = previewInput.parse(input);
    const res = await buildPreview(caller, parsed.sessionId);
    if (res.kind !== "ok") return fail(res);

    const ready = res.preview.rows.filter((r) => r.ready);
    // The token is bound to the EXACT set of rows shown. If anything changes
    // between preview and commit — a row resolved, a duplicate appearing — the
    // token no longer verifies and the assistant must preview again.
    const token = mintCapabilityConfirmation({
      actionId: "evidence.import.commit",
      input: commitHashInput(parsed.sessionId),
      userId: caller.userId,
      stateFingerprint: readyFingerprint(ready),
    });

    return {
      ok: true,
      data: {
        preview: {
          sessionId: res.preview.sessionId,
          organizationId: res.preview.organizationId,
          persisted: false,
          counts: res.preview.counts,
          rows: res.preview.rows,
        },
        confirmationToken: token,
        note:
          "Nothing was written. Rows that are not `ready` are excluded from the " +
          "commit — resolve them with evidence.import.resolve_row first, then " +
          "preview again for a fresh token.",
      },
    };
  },
};

// ── evidence.import.resolve_row ───────────────────────────────────────────

const resolveInput = z
  .object({
    rowId: z.uuid(),
    organizationPersonId: z.uuid().nullish(),
    workObjectId: z.uuid().nullish(),
  })
  .strict();

const rowResolve: CapabilityDescriptor = {
  id: "evidence.import.resolve_row",
  kind: "execute",
  title: "Settle one ambiguous import row",
  description:
    "Assigns the roster person and/or work object for a single staged row — " +
    "the answer to an `ambiguous` or `unmatched` preview state. Both ids are " +
    "validated against the session's own organization by the database.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: resolveInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = resolveInput.parse(input);
    const res = await resolveRow(caller, {
      rowId: parsed.rowId,
      organizationPersonId: parsed.organizationPersonId ?? undefined,
      workObjectId: parsed.workObjectId ?? undefined,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: { rowId: parsed.rowId, note: "Preview again to refresh the token." },
    };
  },
};

// ── evidence.import.commit (the confirm leg) ──────────────────────────────

const commitInput = z
  .object({
    sessionId: z.uuid(),
    confirmationToken: z.string().min(10),
    /** Only a REPORTED state is offerable — the attested and independently
     *  verified vocabularies are deliberately absent, here and in the DB
     *  CHECK, so an import cannot mint trust it did not earn. */
    evidenceState: z.enum(REPORTED_EVIDENCE_STATES).optional(),
  })
  .strict();

const importCommit: CapabilityDescriptor = {
  id: "evidence.import.commit",
  kind: "confirm",
  title: "Commit a previewed evidence import",
  description:
    "Verifies the one-time token against the exact previewed row set, then " +
    "performs the canonical write as the caller. ATOMIC and IDEMPOTENT: " +
    "committing twice writes nothing the second time. The state written is " +
    "always a REPORTED one — an import can never produce attested or " +
    "independently verified evidence.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: commitInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = commitInput.parse(input);

    // Re-derive the state the token was bound to, from the database, now.
    const preview = await buildPreview(caller, parsed.sessionId);
    if (preview.kind !== "ok") return fail(preview);
    const ready = preview.preview.rows.filter((r) => r.ready);

    const verdict = verifyCapabilityConfirmation({
      actionId: "evidence.import.commit",
      token: parsed.confirmationToken,
      input: commitHashInput(parsed.sessionId),
      userId: caller.userId,
      currentStateFingerprint: readyFingerprint(ready),
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message:
          `Confirmation token rejected (${verdict.reason}). The import changed since ` +
          "the preview, or the token was already used. Preview again.",
      };
    }

    const res = await commitImport(caller, parsed.sessionId, {
      evidenceState: parsed.evidenceState,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        written: res.written,
        skippedDuplicates: res.skippedDuplicates,
        notReady: res.notReady,
        recordIds: res.recordIds,
        structuredDestination: "/dashboard/company/evidence-import",
      },
    };
  },
};

// ── evidence.records.list ─────────────────────────────────────────────────

const recordsListInput = z
  .object({
    sessionId: z.uuid().optional(),
    organizationPersonId: z.uuid().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .strict();

const recordsList: CapabilityDescriptor = {
  id: "evidence.records.list",
  kind: "read",
  title: "Read imported evidence back",
  description:
    "Returns committed evidence with its full provenance — who supplied it and " +
    "in what capacity, who imported it, the original source, FACT vs DERIVED, " +
    "and the DERIVED standing (reported / attested / self-attested / " +
    "independently verified / withdrawn). `independentlyVerified` is true ONLY " +
    "for a real independent verification event; a self-attestation never counts.",
  exposed: true,
  annotations: readOnly,
  inputSchema: recordsListInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = recordsListInput.parse(input);
    const res = await listEvidenceRecords(caller, {
      sessionId: parsed.sessionId ?? null,
      organizationPersonId: parsed.organizationPersonId ?? null,
      limit: parsed.limit,
    });
    if (res.kind !== "ok") return fail(res);
    return { ok: true, data: { records: res.records } };
  },
};

// ── evidence.record.attest ────────────────────────────────────────────────

const attestInput = z
  .object({
    recordId: z.uuid(),
    actorRole: z.enum(ATTESTATION_ROLES),
    note: z.string().max(1000).nullish(),
  })
  .strict();

const recordAttest: CapabilityDescriptor = {
  id: "evidence.record.attest",
  kind: "execute",
  title: "Attest an evidence record in the organization's name",
  description:
    "Records the organization standing behind one evidence record. Attesting " +
    "one's OWN work is allowed — a sole trader legitimately has nobody above " +
    "them — and the result derives SELF_ATTESTED, which is permanent and never " +
    "counts as independent verification. Independent verification is a " +
    "different act, available only to a separately recorded party.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: attestInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = attestInput.parse(input);
    const res = await attestRecord(caller, {
      recordId: parsed.recordId,
      actorRole: parsed.actorRole,
      note: parsed.note ?? null,
    });
    if (res.kind !== "ok") return fail(res);
    return { ok: true, data: { eventId: res.eventId, independentlyVerified: false } };
  },
};

// ── evidence.import.withdraw (the rollback path) ──────────────────────────

const withdrawInput = z
  .object({ sessionId: z.uuid(), note: z.string().max(1000).nullish() })
  .strict();

const importWithdraw: CapabilityDescriptor = {
  id: "evidence.import.withdraw",
  kind: "execute",
  title: "Withdraw everything an import wrote",
  description:
    "The recovery path. It DELETES NOTHING: every record gains an append-only " +
    "`withdrawn` event, so the evidence and the reason both stay readable and " +
    "the action itself is auditable. Reversible by reinstating.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: withdrawInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = withdrawInput.parse(input);
    const res = await withdrawImport(caller, parsed.sessionId, parsed.note ?? null);
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        withdrawn: res.affected,
        deleted: 0,
        note: "Nothing was deleted — each record carries a withdrawal event.",
      },
    };
  },
};

export const EVIDENCE_IMPORT_CAPABILITIES: readonly CapabilityDescriptor[] = [
  organizationResolve,
  peopleList,
  personCreate,
  sessionCreate,
  rowsSubmit,
  importPreview,
  rowResolve,
  importCommit,
  recordsList,
  recordAttest,
  importWithdraw,
];
