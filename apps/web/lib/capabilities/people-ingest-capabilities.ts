import "server-only";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import {
  INGEST_RELATIONSHIPS,
  MAX_PEOPLE_PER_BATCH,
  MAX_PERSON_NAME,
  MAX_EXTERNAL_REF,
  peopleToCreate,
  type IngestPlan,
  type IngestRelationship,
  type PersonSource,
} from "@/lib/organization-people/ingest-core";
import {
  readPeopleFile,
  SUPPORTED_PEOPLE_FILE_EXTENSIONS,
} from "@/lib/organization-people/ingest-file";
import {
  commitPeopleIngest,
  previewPeopleIngest,
  type IngestFailure,
} from "@/lib/organization-people/ingest-service";
// THE shared commit gate — the human UI's own confirm step and this one sign
// and verify with the SAME helpers, so the two transports cannot drift apart
// at the riskiest step.
import {
  mintPeopleCommitToken,
  verifyPeopleCommitToken,
} from "@/lib/organization-people/people-commit-confirmation";

import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * ORGANIZATION PEOPLE INGESTION — the assistant/agent face of the SAME domain
 * service the web import panel uses.
 *
 * An organization can bring many real people onto its roster without any of
 * them having an account. That flow existed only behind a browser form; this
 * exposes it to an authorized assistant WITHOUT a second implementation —
 * every handler here is a thin translation over
 * `lib/organization-people/ingest-service.ts`, which the web panel also calls.
 *
 * ── ONE ARCHITECTURE, EVERY ACTOR ─────────────────────────────────────────
 * A company's employees, an agency's candidates and supplied workers, and an
 * institution's learners are the SAME roster with a different RELATIONSHIP.
 * There is no separate candidate database and no separate learner system, and
 * nothing here creates one. The relationship is always SUPPLIED, never
 * inferred: no batch is quietly filed as `employee` because that is the
 * commonest value.
 *
 * ── AUTHORIZATION IS ORGANIZATION-SCOPED, NEVER PERSON-SCOPED ─────────────
 * An assistant authenticated as a person does NOT thereby gain authority over
 * every organization that person can see. Three layers hold that, none of them
 * added here:
 *
 *   1. the caller's own RLS-scoped client — the database decides every read
 *      and write;
 *   2. `resolveEvidenceOrganization` inside the service — the organization
 *      comes from the caller's OWN memberships and their governance role must
 *      carry `import-evidence`; a `member`, or employment alone, resolves
 *      nothing;
 *   3. an organization the caller names is a SELECTOR among those memberships,
 *      never a grant. An unknown one returns the real options.
 *
 * ChatGPT can therefore assert no organization id, no membership and no
 * authority. It can only ask, as the person who authorized it.
 *
 * ── ATTACHING A FILE IS NOT COMMITTING IT ─────────────────────────────────
 * `people.ingest.preview` writes NOTHING. It parses, matches against the
 * roster, names every duplicate and every ambiguity, and — only when nothing
 * is left unresolved — mints a one-time token bound to the exact set of people
 * it showed. `people.ingest.commit` will not write without that token. An
 * assistant cannot turn "here is our staff list" into rows in one step, which
 * is the entire point.
 *
 * ── NO MODEL DECIDES WHO ANYBODY IS ───────────────────────────────────────
 * Parsing, matching and duplicate detection are deterministic and offline.
 * This path calls no AI provider at all: writing one human's record under
 * another's name is the worst failure available to the feature, and a
 * probabilistic answer to "is this the same person?" is not defensible. When
 * the matcher is unsure it says `ambiguous`, and the only thing that may
 * follow is a question to the human.
 */

// ── shared failure translation ─────────────────────────────────────────────

/** Map the service's tagged failure onto the capability envelope. Every branch
 *  is a NAMED code: an unprovisioned store, a refusal, an unresolved question
 *  and an outage must never collapse into one another — and none of them may
 *  ever be reported as "this organization has no people". */
function fail(f: IngestFailure): ExecResult {
  switch (f.kind) {
    case "not-authorized":
      return {
        ok: false,
        code: "not_authorized",
        message:
          `Not authorized to manage people for this organization (${f.reason}). ` +
          "Nothing was read and nothing was written.",
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
    case "needs-migration":
      return {
        ok: false,
        code: "needs_migration",
        message:
          `The '${f.relationship}' relationship is not provisioned on this environment ` +
          "yet. This is a missing migration, NOT an empty roster and NOT a refusal. " +
          "Nothing was written.",
      };
    case "too-many-rows":
      return {
        ok: false,
        code: "too_many_rows",
        message: `At most ${f.limit} people per batch. Split the list and submit in batches.`,
      };
    case "unresolved":
      return {
        ok: false,
        code: "unresolved",
        message:
          "Some rows still need a human answer (an ambiguous name, or the relationship " +
          "was not stated). Preview again with resolutions. Nothing was written.",
      };
    case "error":
      return {
        ok: false,
        code: "unavailable",
        message:
          "The organization roster could not be read or written. This is a failure, " +
          "NOT an empty roster.",
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

// ── the shared input vocabulary ────────────────────────────────────────────

const relationshipSchema = z.enum(
  INGEST_RELATIONSHIPS as unknown as [IngestRelationship, ...IngestRelationship[]],
);

const personSchema = z
  .object({
    name: z.string().min(1).max(MAX_PERSON_NAME),
    externalRef: z.string().max(MAX_EXTERNAL_REF).nullish(),
    sourceNote: z.string().max(300).nullish(),
  })
  .strict();

const resolutionSchema = z.union([
  z
    .object({
      index: z.number().int().min(0),
      choice: z.literal("existing"),
      personId: z.uuid(),
    })
    .strict(),
  z.object({ index: z.number().int().min(0), choice: z.literal("new") }).strict(),
]);

/**
 * A file the assistant received, carried as base64.
 *
 * The MCP door caps a request body at 64 KB, and base64 costs a third on top,
 * so roughly 48 KB of file fits — a few thousand names in a CSV, and not a
 * large spreadsheet. That limit is stated in the tool description rather than
 * discovered as a mystery failure, and a file above it is refused BY NAME so
 * an assistant can tell the user to use the web import panel instead of
 * reporting that the import "did not work".
 */
const fileSchema = z
  .object({
    filename: z.string().min(1).max(300),
    contentBase64: z.string().min(1),
  })
  .strict();

const previewInput = z
  .object({
    file: fileSchema.optional(),
    people: z.array(personSchema).max(MAX_PEOPLE_PER_BATCH).optional(),
    relationship: relationshipSchema.optional(),
    organizationId: z.uuid().optional(),
    resolutions: z.array(resolutionSchema).max(MAX_PEOPLE_PER_BATCH).optional(),
  })
  .strict();

const commitInput = z
  .object({
    people: z.array(personSchema).min(1).max(MAX_PEOPLE_PER_BATCH),
    relationship: relationshipSchema,
    organizationId: z.uuid().optional(),
    resolutions: z.array(resolutionSchema).max(MAX_PEOPLE_PER_BATCH).optional(),
    confirmationToken: z.string().min(1),
  })
  .strict();

/** Turn either accepted source shape into canonical rows, or say exactly why
 *  it could not. A refusal here is never "no people found". */
async function sourcesFrom(
  input: z.infer<typeof previewInput>,
): Promise<
  | { readonly ok: true; readonly people: readonly PersonSource[]; readonly label: string | null }
  | { readonly ok: false; readonly result: ExecResult }
> {
  if (input.file) {
    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.file.contentBase64, "base64");
    } catch {
      return {
        ok: false,
        result: { ok: false, code: "invalid", message: "contentBase64 is not valid base64." },
      };
    }
    const read = await readPeopleFile(input.file.filename, bytes);
    switch (read.kind) {
      case "ok":
        return { ok: true, people: read.people, label: input.file.filename };
      case "unsupported-file":
        return {
          ok: false,
          result: {
            ok: false,
            code: "not_supported",
            message:
              `'${read.filename}' is not a supported workforce list. Supported today: ` +
              `${SUPPORTED_PEOPLE_FILE_EXTENSIONS.join(", ")}. A PDF or DOCX CV is NOT ` +
              "imported: keeping only the person's name and discarding their professional " +
              "history would be misleading, so it is refused rather than half-done. " +
              "NOTHING was imported.",
          },
        };
      case "no-name-column":
        return {
          ok: false,
          result: {
            ok: false,
            code: "no_name_column",
            message:
              "No column of people's names was found. Columns seen: " +
              `${read.headers.join(", ") || "(none)"}. Nothing was imported.`,
          },
        };
      case "file-too-large":
        return {
          ok: false,
          result: {
            ok: false,
            code: "file_too_large",
            message:
              `The file exceeds ${read.limit} bytes. Note the MCP request body cap is ` +
              "64 KB, so large lists must be imported from the web people-import panel.",
          },
        };
      case "too-many-rows":
        return {
          ok: false,
          result: {
            ok: false,
            code: "too_many_rows",
            message: `At most ${read.limit} people per batch. Split the file.`,
          },
        };
      case "nothing-parsed":
        return {
          ok: false,
          result: {
            ok: false,
            code: "nothing_parsed",
            message:
              "The file produced no rows. This is an unreadable or empty FILE — it says " +
              "nothing about who is on the organization's roster.",
          },
        };
    }
  }
  if (input.people && input.people.length > 0) {
    return {
      ok: true,
      people: input.people.map((p) => ({
        name: p.name,
        externalRef: p.externalRef ?? null,
        sourceNote: p.sourceNote ?? null,
      })),
      label: null,
    };
  }
  return {
    ok: false,
    result: {
      ok: false,
      code: "invalid",
      message: "Supply either `file` (a workforce list) or `people` (explicit rows).",
    },
  };
}

/** The plan, rendered for an assistant: counts, and the questions a human
 *  still owes an answer to — named, with the real options. */
function planView(plan: IngestPlan): Record<string, unknown> {
  if (plan.kind !== "plan") {
    return { status: "too_many_rows", limit: plan.limit, received: plan.received };
  }
  return {
    counts: plan.counts,
    needsRelationship: plan.needsRelationship,
    needsReconciliation: plan.needsReconciliation,
    willCreate: peopleToCreate(plan).map((r) => ({
      displayName: r.displayName,
      externalRef: r.externalRef,
      relationship: r.relationshipKind,
    })),
    alreadyOnRoster: plan.rows
      .filter((r) => r.disposition.kind === "already_on_roster")
      .map((r) => ({ index: r.index, name: r.source.name })),
    duplicateInBatch: plan.rows
      .filter((r) => r.disposition.kind === "duplicate_in_batch")
      .map((r) => ({ index: r.index, name: r.source.name })),
    unusable: plan.rows
      .filter((r) => r.disposition.kind === "unusable")
      .map((r) => ({
        index: r.index,
        reason: (r.disposition as { reason: string }).reason,
      })),
    // The ONLY thing that may follow an ambiguity is a question.
    questions: plan.rows
      .filter((r) => r.disposition.kind === "ambiguous")
      .map((r) => ({
        index: r.index,
        name: r.source.name,
        candidates: (
          r.disposition as { candidates: readonly { id: string; displayName: string }[] }
        ).candidates.map((c) => ({ personId: c.id, label: c.displayName })),
        answer:
          "Re-run people.ingest.preview with resolutions: " +
          `{ index: ${r.index}, choice: 'existing', personId } if it is that person, or ` +
          `{ index: ${r.index}, choice: 'new' } if it is a different human with the same name.`,
      })),
  };
}

// ── people.ingest.preview ──────────────────────────────────────────────────

const ingestPreview: CapabilityDescriptor = {
  id: "people.ingest.preview",
  kind: "draft",
  title: "Preview bringing people onto an organization's roster",
  description:
    "Reads a workforce list (xlsx/xlsm/csv/tsv/txt, base64) or explicit rows and says " +
    "exactly what it WOULD do: who is new, who is already on the roster, who is " +
    "duplicated in the batch, and which names are ambiguous. WRITES NOTHING. When " +
    "nothing is left unresolved it returns a one-time confirmationToken for " +
    "people.ingest.commit. The relationship (employee, candidate, student, …) must be " +
    "stated by the user — it is never guessed. Request bodies are capped at 64 KB, so " +
    "large lists belong in the web import panel.",
  exposed: true,
  annotations: readOnly,
  inputSchema: previewInput,
  run: async (caller: CapabilityCaller, input): Promise<ExecResult> => {
    const parsed = previewInput.parse(input);
    const sources = await sourcesFrom(parsed);
    if (!sources.ok) return sources.result;

    const preview = await previewPeopleIngest(caller, {
      sources: sources.people,
      relationship: parsed.relationship ?? null,
      organizationId: parsed.organizationId,
      resolutions: parsed.resolutions,
    });
    if (preview.kind !== "ok") return fail(preview);

    const view = planView(preview.plan);
    const plan = preview.plan;
    const ready =
      plan.kind === "plan" && !plan.needsReconciliation && !plan.needsRelationship;

    return {
      ok: true,
      data: {
        organizationId: preview.organizationId,
        sourceLabel: sources.label,
        ...view,
        // A token is minted ONLY when there is nothing left to ask. An
        // assistant therefore cannot hold a commit permit for a batch that
        // still contains an unanswered question.
        ...(ready && parsed.relationship
          ? {
              confirmationToken: mintPeopleCommitToken({
                organizationId: preview.organizationId,
                relationship: parsed.relationship,
                userId: caller.userId,
                plan,
              }),
            }
          : {}),
        note: ready
          ? "NOTHING has been written yet. Show the user what will be created and get an " +
            "explicit yes, then call people.ingest.commit with the same people, the same " +
            "relationship and this confirmationToken."
          : "NOTHING has been written. Answer the questions above first — a commit is " +
            "refused while anything is unresolved.",
        structuredDestination: "/dashboard/company#people-import",
      },
    };
  },
};

// ── people.ingest.commit ───────────────────────────────────────────────────

const ingestCommit: CapabilityDescriptor = {
  id: "people.ingest.commit",
  kind: "confirm",
  title: "Commit previewed people onto the roster",
  description:
    "Verifies the one-time token against the exact set of people the preview showed, " +
    "then creates those roster rows as the caller. Re-plans against the roster as it is " +
    "NOW, so a person added meanwhile is not duplicated. Every row starts link_state " +
    "'unlinked': recording a person is not that person consenting to anything, and no " +
    "account, profile or governance membership is created.",
  exposed: true,
  annotations: appendWrite,
  inputSchema: commitInput,
  run: async (caller: CapabilityCaller, input): Promise<ExecResult> => {
    const parsed = commitInput.parse(input);
    const people: readonly PersonSource[] = parsed.people.map((p) => ({
      name: p.name,
      externalRef: p.externalRef ?? null,
      sourceNote: p.sourceNote ?? null,
    }));

    // Re-derive the state the token was bound to, from the database, NOW —
    // the same re-plan the write itself will perform.
    const preview = await previewPeopleIngest(caller, {
      sources: people,
      relationship: parsed.relationship,
      organizationId: parsed.organizationId,
      resolutions: parsed.resolutions,
    });
    if (preview.kind !== "ok") return fail(preview);

    const verdict = verifyPeopleCommitToken({
      token: parsed.confirmationToken,
      organizationId: preview.organizationId,
      relationship: parsed.relationship,
      userId: caller.userId,
      plan: preview.plan,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message:
          `Confirmation token rejected (${verdict.reason}). The list changed since the ` +
          "preview, someone else added these people, or the token was already used. " +
          "Preview again and get a fresh confirmation. NOTHING was written.",
      };
    }

    const res = await commitPeopleIngest(caller, {
      sources: people,
      relationship: parsed.relationship,
      resolutions: parsed.resolutions,
      organizationId: parsed.organizationId,
    });
    if (res.kind !== "ok") return fail(res);

    return {
      ok: true,
      data: {
        organizationId: res.organizationId,
        // READBACK, not "the insert did not throw": these counts come from
        // rows re-read by id under the caller's own RLS.
        created: res.created,
        skippedAlreadyOnRoster: res.skippedExisting,
        skippedDuplicateInBatch: res.skippedDuplicate,
        skippedUnusable: res.skippedUnusable,
        linkState: "unlinked",
        note:
          "These people are now on the organization's roster as its own claim. They have " +
          "no accounts and have agreed to nothing; linking a real person to a roster " +
          "record is a separate, later, human act.",
        structuredDestination: "/dashboard/company#people-import",
      },
    };
  },
};

/**
 * The people-ingestion family, declared as a group because it is ONE flow —
 * look, then answer, then commit — not two unrelated actions.
 */
export const PEOPLE_INGEST_CAPABILITIES: readonly CapabilityDescriptor[] = [
  ingestPreview,
  ingestCommit,
];
