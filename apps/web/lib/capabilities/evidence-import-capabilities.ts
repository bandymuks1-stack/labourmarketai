import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { locales } from "@/lib/i18n/config";
import { REPORTED_EVIDENCE_STATES } from "@/lib/organization-evidence/evidence-state";
import {
  SOURCE_KINDS,
  SUPPLIER_ROLES,
  ATTESTATION_ROLES,
  attestRecord,
  previewAttestation,
  previewWithdrawal,
  buildPreview,
  committableRows,
  commitImport,
  createImportSession,
  createRosterPerson,
  listEvidenceRecords,
  listRosterPeople,
  resolveTimeSemantics,
  resolveContextLabel,
  resolveRow,
  submitRows,
  withdrawImport,
  type EvidenceImportFailure,
} from "@/lib/organization-evidence/import-core";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import {
  sourceWorkRowSchema,
  MAX_ROWS_PER_SESSION,
  MAX_ROWS_PER_SUBMIT,
} from "@/lib/organization-evidence/source-rows";
// THE shared commit gate — the human UI signs and verifies with the SAME
// helpers, so the two transports cannot drift apart at the riskiest step.
import {
  mintCommitToken,
  verifyCommitToken,
} from "@/lib/organization-evidence/commit-confirmation";

import type { CapabilityCaller, CapabilityDescriptor } from "./contract";
import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";

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
      return {
        ok: false,
        code: "not_found",
        message: "No such session, row or record.",
      };
    case "too-many-rows":
      return {
        ok: false,
        code: "too_many_rows",
        message: `At most ${f.limit} rows. Split the source and submit in batches.`,
      };
    case "error":
      return {
        ok: false,
        code: "unavailable",
        message: "The evidence store could not be read.",
      };
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
    const org = await resolveEvidenceOrganization(
      caller,
      parsed.organization ?? null,
    );
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
      data: {
        personId: res.personId,
        name: res.displayName,
        linkState: "unlinked",
      },
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
    /** THE SOURCE'S IDENTITY, stated explicitly — a digest of its CONTENT
     *  (e.g. sha256 of the file's bytes, or of the canonical rows). Required:
     *  deriving it from the filename let two different files with the same
     *  name join ONE session (design v3 §12). */
    sourceFingerprint: z.string().min(16).max(128),
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
    "says so — instead of importing twice. `sourceFingerprint` is REQUIRED and " +
    "must identify the source's CONTENT (a digest of the file's bytes or of " +
    "its canonical rows), never its name: two different files with the same " +
    "name must never join one session. `supplierRole` is required and says " +
    "in what capacity the organization speaks (an agency reporting its worker's " +
    "hours on a client's site is neither the employer nor the client).",
  exposed: true,
  annotations: appendWrite,
  inputSchema: sessionCreateInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = sessionCreateInput.parse(input);
    const res = await createImportSession(caller, {
      organizationId: parsed.organization ?? null,
      sourceKind: parsed.sourceKind,
      supplierRole: parsed.supplierRole,
      sourceFingerprint: parsed.sourceFingerprint,
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
    /** The SOURCE position of the batch's first row (0-based); the batch's
     *  rows follow on. The staging key is `startIndex + i`, so a retried or
     *  resumed batch lands on the same rows instead of new ones. */
    startIndex: z.number().int().min(0).max(MAX_ROWS_PER_SESSION - 1),
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
    "`startIndex` (required) is the source position of the batch's first row: " +
    "send batch 1 at 0, batch 2 at the first row after it, and so on. A retried " +
    "or repeated batch at the same `startIndex` stages nothing twice — " +
    "`skipped` counts the rows already staged.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: submitInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = submitInput.parse(input);
    const res = await submitRows(caller, parsed.sessionId, parsed.rows, {
      startIndex: parsed.startIndex,
    });
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

    // The token is bound to the EXACT set of rows the commit would write: the
    // ready ones AND the ones the PLAN makes ready (people the source names
    // that the commit will create). If anything changes between preview and
    // commit — a row resolved, a duplicate appearing — the token no longer
    // verifies and the assistant must preview again.
    const committable = committableRows(res.preview);
    const token = mintCommitToken({
      sessionId: parsed.sessionId,
      userId: caller.userId,
      readyRows: committable,
    });

    return {
      ok: true,
      data: {
        preview: {
          sessionId: res.preview.sessionId,
          organizationId: res.preview.organizationId,
          persisted: false,
          counts: res.preview.counts,
          plan: res.preview.plan,
          rows: res.preview.rows,
        },
        confirmationToken: token,
        note:
          "Nothing was written. `plan` lists the people and sites the source " +
          "names that do not exist yet; the commit CREATES them first (through " +
          "the organization's own authorized paths) unless `plan.createPeople` / " +
          "`plan.createObjects` is set to false. Rows that are neither `ready` " +
          "nor `readyWithPlan` (ambiguous person or place, duplicates) are " +
          "excluded — resolve them with evidence.import.resolve_row first, then " +
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
      data: {
        rowId: parsed.rowId,
        note: "Preview again to refresh the token.",
      },
    };
  },
};

// ── evidence.import.resolve_label ─────────────────────────────────────────

const labelResolveInput = z
  .object({
    sessionId: z.uuid(),
    /** The segment key as the preview reports it (`contexts.segments[].key`). */
    key: z.string().min(1).max(200),
    decision: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("object"), workObjectId: z.uuid() }).strict(),
      z.object({ kind: z.literal("create"), name: z.string().min(1).max(160).nullish() }).strict(),
      z.object({ kind: z.literal("alias"), name: z.string().min(1).max(160) }).strict(),
      z.object({ kind: z.literal("ignore") }).strict(),
    ]),
  })
  .strict();

const labelResolve: CapabilityDescriptor = {
  id: "evidence.import.resolve_label",
  kind: "execute",
  title: "Settle one place spelling for the whole session",
  description:
    "Answers one place question once for every staged row that names the " +
    "same source spelling (`Travers` on eleven rows is one question): use an " +
    "existing work object, create one under this name, or say it is not a " +
    "place. Writes staging only; preview again afterwards.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: labelResolveInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = labelResolveInput.parse(input);
    const res = await resolveContextLabel(caller, parsed);
    if (res.kind !== "ok") return fail(res);
    return { ok: true, data: { updated: res.updated, note: "Preview again to refresh the token." } };
  },
};

// ── evidence.import.resolve_time_semantics ────────────────────────────────

const timeSemanticsInput = z
  .object({
    sessionId: z.uuid(),
    rowIds: z.array(z.uuid()).min(1).max(500).optional(),
    /** Alternatively: every staged row whose semantics are still open. */
    allOpen: z.boolean().optional(),
    decision: z
      .object({
        kind: z.enum(["daily", "period_aggregate", "unknown"]),
        remote: z.boolean().nullish(),
        /** `YYYY-MM` (recorded at month precision) or `YYYY-MM-DD`; both
         *  bounds or neither — the core refuses a start alone. */
        periodStart: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullish(),
        periodEnd: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullish(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => (v.rowIds?.length ?? 0) > 0 || v.allOpen === true, {
    message: "rowIds or allOpen",
  });

const timeSemanticsResolve: CapabilityDescriptor = {
  id: "evidence.import.resolve_time_semantics",
  kind: "execute",
  title: "Say what an hours figure means",
  description:
    "Settles rows whose hours figure a day cannot hold: a day's hours, a " +
    "period aggregate (optionally remote, with the period when known), or " +
    "unknown. A period is two months (YYYY-MM, kept at month precision) or " +
    "two days — both bounds or neither; a start alone is refused. A period " +
    "that disagrees with the duration or rate the source's own words state " +
    "is recorded WITH a warning (`conflictsWithSource`), never refused. The " +
    "source figure is never edited; a period aggregate is never written as a " +
    "day's duration and is never split into monthly figures. Only the " +
    "human's authority behind the caller can decide this — an agent relays a " +
    "decision, it does not make one.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: timeSemanticsInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = timeSemanticsInput.parse(input);
    const res = await resolveTimeSemantics(caller, {
      sessionId: parsed.sessionId,
      rowIds: parsed.rowIds,
      allOpen: parsed.allOpen,
      decision: parsed.decision,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        updated: res.updated,
        conflictsWithSource: res.conflictsWithSource,
        note:
          res.conflictsWithSource > 0
            ? "Recorded. The period disagrees with what the source's own words state on some rows — the preview shows where. Preview again to refresh the token."
            : "Preview again to refresh the token.",
      },
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
    /** The reviewed PLAN (see evidence.import.preview). Absent = create both. */
    plan: z
      .object({
        createPeople: z.boolean().default(true),
        createObjects: z.boolean().default(true),
        relationshipKind: z.string().min(1).max(40).optional(),
      })
      .strict()
      .optional(),
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
    const committable = committableRows(preview.preview);

    const verdict = verifyCommitToken({
      token: parsed.confirmationToken,
      sessionId: parsed.sessionId,
      userId: caller.userId,
      readyRows: committable,
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
      plan: parsed.plan
        ? {
            createPeople: parsed.plan.createPeople,
            createObjects: parsed.plan.createObjects,
            relationshipKind: parsed.plan.relationshipKind ?? null,
          }
        : undefined,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: {
        written: res.written,
        skippedDuplicates: res.skippedDuplicates,
        notReady: res.notReady,
        createdPeople: res.createdPeople,
        createdObjects: res.createdObjects,
        recordIds: res.recordIds,
        structuredDestination: "/dashboard/company/history#evidence-import",
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
    "in what capacity, who imported it, the original source, FACT vs DERIVED " +
    "(`factFields` names the canonical fields the record's own source line " +
    "states; a field with a recorded derivation, and a period a person set " +
    "at import, are never among them — `derived.timeSemantics` says how such " +
    "a period came to be), and the DERIVED standing (reported / attested / self-attested / " +
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

// ── evidence.record.attest_draft / attest_confirm ─────────────────────────
//
// DRAFT -> CONFIRM, the canonical write contract (lib/capabilities/contract.ts
// WRITE SEMANTICS), over the SAME `confirmable.ts` helpers the demand
// close/reopen pair uses. Attesting stands the organization behind a record in
// an append-only ledger: it is consequential, so a natural-language
// instruction alone must never write it.

const attestInput = z
  .object({
    recordId: z.uuid(),
    /** Optional: the organization attests in the capacity the record was
     *  supplied in (its `supplierRole`). A different role is refused. */
    actorRole: z.enum(ATTESTATION_ROLES).optional(),
    note: z.string().max(1000).nullish(),
  })
  .strict();
const attestConfirmInput = attestInput.extend({ confirmationToken: z.string().min(10) }).strict();

/** The NORMALIZED draft shape the token is hashed over - null-vs-absent is
 *  decided here once, so draft and confirm hash identically. */
function attestTokenInput(p: z.infer<typeof attestInput>): Record<string, unknown> {
  return { recordId: p.recordId, actorRole: p.actorRole ?? null, note: p.note ?? null };
}

const ATTEST_CONFIRM_ID = "evidence.record.attest_confirm";

const recordAttestDraft: CapabilityDescriptor = {
  id: "evidence.record.attest_draft",
  kind: "draft",
  title: "Draft attesting an evidence record in the organization's name",
  description:
    "Previews the organization standing behind one evidence record, in the " +
    "capacity the record was supplied in (its `supplierRole`) - omit " +
    "`actorRole` to use it; any other role is refused. NOTHING is written. " +
    "Attesting one's OWN work is allowed (a sole trader has nobody above " +
    "them) and derives SELF_ATTESTED, which is permanent and never counts as " +
    "independent verification; independent verification is a different act " +
    "for a separately recorded party. Returns a one-time token bound to the " +
    `record's CURRENT attestation trail. Confirm with ${ATTEST_CONFIRM_ID}.`,
  exposed: true,
  annotations: readOnly,
  inputSchema: attestInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = attestInput.parse(input);
    const pre = await previewAttestation(caller, { recordId: parsed.recordId, actorRole: parsed.actorRole ?? null });
    if (pre.kind !== "ok") return fail(pre);
    if (pre.attestedByCaller) {
      return {
        ok: false,
        code: "already_attested",
        message: "This record is already attested by this actor. Nothing was written and no token was issued.",
      };
    }
    const token = mintCapabilityConfirmation({
      actionId: ATTEST_CONFIRM_ID,
      input: attestTokenInput(parsed),
      userId: caller.userId,
      stateFingerprint: `attest:${parsed.recordId}:${pre.attestedEventCount}:${pre.latestAttestedEventId ?? "none"}`,
    });
    return {
      ok: true,
      data: {
        preview: {
          recordId: parsed.recordId,
          attestingAs: pre.supplierRole,
          existingAttestations: pre.attestedEventCount,
          recordWithdrawn: pre.withdrawn,
          standing:
            "Appends one `attested` event naming this organization. If the record's subject is the acting " +
            "person the standing derives SELF_ATTESTED; either way it is NOT independent verification.",
          independentlyVerified: false,
        },
        confirmationToken: token,
        note: `Nothing was written. Confirming requires ${ATTEST_CONFIRM_ID} with this exact input and token.`,
      },
    };
  },
};

const recordAttestConfirm: CapabilityDescriptor = {
  id: ATTEST_CONFIRM_ID,
  kind: "confirm",
  title: "Confirm attesting the evidence record",
  description:
    "Verifies the one-time token against the exact drafted input, the caller " +
    "and the record's CURRENT attestation trail (a replay or a changed record " +
    "is refused), then appends the `attested` event as the caller and reports " +
    "`independentlyVerified: false`. The same actor cannot attest a record twice.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: attestConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = attestConfirmInput.parse(input);
    const pre = await previewAttestation(caller, { recordId: parsed.recordId, actorRole: parsed.actorRole ?? null });
    if (pre.kind !== "ok") return fail(pre);
    const verdict = verifyCapabilityConfirmation({
      actionId: ATTEST_CONFIRM_ID,
      token: parsed.confirmationToken,
      input: attestTokenInput(parsed),
      userId: caller.userId,
      currentStateFingerprint: `attest:${parsed.recordId}:${pre.attestedEventCount}:${pre.latestAttestedEventId ?? "none"}`,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). The record changed since the draft, or the token was already used. Draft again.`,
      };
    }
    const res = await attestRecord(caller, {
      recordId: parsed.recordId,
      actorRole: parsed.actorRole ?? null,
      note: parsed.note ?? null,
    });
    if (res.kind !== "ok") return fail(res);
    return {
      ok: true,
      data: { eventId: res.eventId, independentlyVerified: false },
    };
  },
};

// ── evidence.import.withdraw_draft / withdraw_confirm (the rollback path) ──

const withdrawInput = z
  .object({ sessionId: z.uuid(), note: z.string().max(1000).nullish() })
  .strict();
const withdrawConfirmInput = withdrawInput.extend({ confirmationToken: z.string().min(10) }).strict();
const WITHDRAW_CONFIRM_ID = "evidence.import.withdraw_confirm";

function withdrawTokenInput(p: z.infer<typeof withdrawInput>): Record<string, unknown> {
  return { sessionId: p.sessionId, note: p.note ?? null };
}

/** Bound to exactly the records the sweep would withdraw (hashed - a large
 *  import must not bloat the token) and the session's own lifecycle state. */
function withdrawFingerprint(
  sessionId: string,
  pre: { pendingRecordIds: readonly string[]; sessionWithdrawn: boolean },
): string {
  const ids = [...pre.pendingRecordIds].sort();
  const digest = createHash("sha256").update(ids.join(",")).digest("hex").slice(0, 24);
  return `withdraw:${sessionId}:${ids.length}:${digest}:${pre.sessionWithdrawn}`;
}

const importWithdrawDraft: CapabilityDescriptor = {
  id: "evidence.import.withdraw_draft",
  kind: "draft",
  title: "Draft withdrawing everything an import wrote",
  description:
    "Previews the recovery path: how many records (and how many people's " +
    "records) would gain an append-only `withdrawn` event. NOTHING is written " +
    "and nothing is ever deleted - the evidence and the reason stay readable; " +
    "reversible by reinstating. Returns a one-time token bound to exactly the " +
    "records that would be withdrawn. When nothing is pending (already " +
    `withdrawn) it says so and issues no token. Confirm with ${WITHDRAW_CONFIRM_ID}.`,
  exposed: true,
  annotations: readOnly,
  inputSchema: withdrawInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = withdrawInput.parse(input);
    const pre = await previewWithdrawal(caller, parsed.sessionId);
    if (pre.kind !== "ok") return fail(pre);
    if (pre.nothingToDo) {
      return {
        ok: true,
        data: {
          preview: { sessionId: parsed.sessionId, recordsToWithdraw: 0, peopleAffected: 0 },
          alreadyWithdrawn: true,
          note: "Already withdrawn - nothing to confirm and no token was issued. Nothing was written.",
        },
      };
    }
    const token = mintCapabilityConfirmation({
      actionId: WITHDRAW_CONFIRM_ID,
      input: withdrawTokenInput(parsed),
      userId: caller.userId,
      stateFingerprint: withdrawFingerprint(parsed.sessionId, pre),
    });
    return {
      ok: true,
      data: {
        preview: {
          sessionId: parsed.sessionId,
          recordsToWithdraw: pre.pendingRecordIds.length,
          peopleAffected: pre.peopleAffected,
          deletes: 0,
        },
        alreadyWithdrawn: false,
        confirmationToken: token,
        note: `Nothing was written. Confirming requires ${WITHDRAW_CONFIRM_ID} with this exact input and token.`,
      },
    };
  },
};

const importWithdrawConfirm: CapabilityDescriptor = {
  id: WITHDRAW_CONFIRM_ID,
  kind: "confirm",
  title: "Confirm withdrawing everything the import wrote",
  description:
    "Verifies the one-time token against the records that would be withdrawn " +
    "NOW (a replay, or any change since the draft, is refused), then appends a " +
    "`withdrawn` event per record and the session's `rolled_back` event as the " +
    "caller. It DELETES NOTHING; the act is auditable and reversible.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: withdrawConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = withdrawConfirmInput.parse(input);
    const pre = await previewWithdrawal(caller, parsed.sessionId);
    if (pre.kind !== "ok") return fail(pre);
    const verdict = verifyCapabilityConfirmation({
      actionId: WITHDRAW_CONFIRM_ID,
      token: parsed.confirmationToken,
      input: withdrawTokenInput(parsed),
      userId: caller.userId,
      currentStateFingerprint: withdrawFingerprint(parsed.sessionId, pre),
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). The import changed since the draft, or the token was already used. Draft again.`,
      };
    }
    const res = await withdrawImport(caller, parsed.sessionId, parsed.note ?? null);
    if (res.kind !== "ok") return fail(res);
    const already = res.outcome === "already_withdrawn";
    return {
      ok: true,
      data: {
        withdrawn: res.affected,
        deleted: 0,
        alreadyWithdrawn: already,
        note: already
          ? "Already withdrawn - nothing was written."
          : "Nothing was deleted - each record carries a withdrawal event.",
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
  labelResolve,
  timeSemanticsResolve,
  importCommit,
  recordsList,
  recordAttestDraft,
  recordAttestConfirm,
  importWithdrawDraft,
  importWithdrawConfirm,
];
