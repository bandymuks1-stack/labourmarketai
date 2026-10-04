import "server-only";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import {
  decideCounterpartyCore,
  readOwnQueueRows,
  submitEntryCore,
  validateDecisionInput,
} from "@/lib/journal/counterparty-core";
import {
  COUNTERPARTY_DECISIONS,
  offeredDecisions,
  parseEntryDetail,
  parseEntryReviewStates,
  queueBucket,
} from "@/lib/journal/counterparty-review-model";

import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * COUNTERPARTY REVIEW - the chat / MCP face of decision 0018.
 *
 * An authorized counterparty (the client / customer / contracting party a
 * worker submitted work to) can list its review queue, read ONE submitted
 * entry, and decide it - accept, request a correction, or dispute (the note
 * is required for the last two) - with exactly the permissions the web queue
 * gives. The worker can submit an entry for review.
 *
 * Nothing here is a second implementation:
 *   - reads: the SAME SECURITY DEFINER doors the web uses
 *     (`list_counterparty_review_queue_v1`, `counterparty_review_entry_detail_v1`,
 *     `entry_review_states_v1`) on the caller's own RLS-scoped client;
 *   - writes: the SAME core the web server actions call
 *     (`lib/journal/counterparty-core.ts`), whose database functions re-derive
 *     the caller. Identity is never an argument; the entry must be in the
 *     CALLER's own queue.
 * The decision is a draft -> confirm pair: the draft names the work and the
 * decision and writes nothing; the confirm needs the one-time token, bound to
 * the entry's CURRENT state (a changed submission or a new decision voids it).
 * A client acceptance is CLIENT_ACCEPTED - never an employer confirmation,
 * skill verification, payment confirmation or independent verification - and
 * the tool descriptions say so.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const PG_UNDEFINED = new Set(["42883", "42P01", "42703", "PGRST202"]);

const NOT_A_CONFIRMATION =
  "A client acceptance is the client's own signal (CLIENT_ACCEPTED): it is NOT an employer confirmation, " +
  "NOT a skill verification, NOT a payment confirmation and NOT an independent verification.";

const entryIdField = z.string().uuid();
const decideFields = z
  .object({
    entryId: entryIdField,
    decision: z.enum(COUNTERPARTY_DECISIONS),
    note: z.string().max(2000).optional(),
  })
  .strict();
const decideConfirmInput = decideFields.extend({ confirmationToken: z.string().min(10) });
const submitFields = z.object({ entryId: entryIdField, linkId: z.string().uuid().optional() }).strict();
const submitConfirmInput = submitFields.extend({ confirmationToken: z.string().min(10) });

function refusal(code: string): ExecResult {
  const messages: Record<string, string> = {
    review_authority_not_established:
      "This entry is not in your counterparty review queue (you are not the registered client for this work, or it was not submitted to you).",
    note_required: "A correction request and a dispute need a short note for the worker.",
    note_too_long: "The note is too long (max 2000 characters).",
    invalid_decision: "decision must be accept, request_correction or dispute.",
    already_accepted: "This work was already accepted. An acceptance is final.",
    not_offered: "That decision is not available for this entry in its current state.",
    needs_migration: "Counterparty review is not enabled on this environment.",
  };
  return { ok: false, code: code === "needs_migration" ? "needs_migration" : code, message: messages[code] };
}

async function queueRowFor(db: Db, entryId: string) {
  const rows = await readOwnQueueRows(db);
  if (rows === null) return { kind: "unavailable" as const };
  const row = rows.find((r) => r.entryId === entryId);
  return row ? { kind: "row" as const, row } : { kind: "absent" as const };
}

const fingerprintOf = (row: { entryId: string; submissionId: string; latestDecision: string | null }) =>
  `${row.entryId}|${row.submissionId}|${row.latestDecision ?? "none"}`;

// ── reads ───────────────────────────────────────────────────────────────────

const queueGet: CapabilityDescriptor = {
  id: "counterparty_review.queue.get",
  kind: "read",
  title: "Work submitted to me as the client / customer / contracting party",
  description:
    "The caller's counterparty review queue: entries workers explicitly submitted to a party the caller represents " +
    "(the same list as the web page /dashboard/inbox/counterparty), each with its state " +
    "(to_decide / waiting_for_worker / disputed / accepted) and which decisions are still offered. " +
    "Empty for anyone who is not a registered counterparty. " +
    NOT_A_CONFIRMATION +
    " Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    const rows = await readOwnQueueRows(caller.supabase as Db);
    // FAILED is not EMPTY.
    if (rows === null) return { ok: false, code: "unavailable", message: "The review queue read failed." };
    return {
      ok: true,
      data: {
        total: rows.length,
        entries: rows.map((r) => ({
          entryId: r.entryId,
          projectId: r.projectId,
          yourRole: r.partyRole,
          text: r.originalText,
          submittedAt: r.submittedAt,
          isResubmission: r.resubmissionOfEntryId !== null,
          state: queueBucket(r),
          decisionsStillOffered: offeredDecisions(r.latestDecision),
        })),
        structuredDestination: "/dashboard/inbox/counterparty",
      },
    };
  },
};

const entryGet: CapabilityDescriptor = {
  id: "counterparty_review.entry.get",
  kind: "read",
  title: "One work entry submitted to me for review",
  description:
    "The work text, the figures recorded with it, the NAMES of the photos the worker attached (never links) and the " +
    "decision history (including earlier versions of a corrected entry), exactly what the web card shows. " +
    "Answers only for the party the entry was submitted to. " +
    NOT_A_CONFIRMATION +
    " Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: z.object({ entryId: entryIdField }).strict(),
  run: async (caller, input): Promise<ExecResult> => {
    const { entryId } = z.object({ entryId: entryIdField }).strict().parse(input);
    const { data, error } = await (caller.supabase as Db).rpc("counterparty_review_entry_detail_v1", {
      p_entry_id: entryId,
    });
    if (error) {
      return error.code && PG_UNDEFINED.has(error.code)
        ? refusal("needs_migration")
        : { ok: false, code: "unavailable", message: "The entry read failed." };
    }
    const d = parseEntryDetail(data);
    if (!d) return refusal("review_authority_not_established");
    return {
      ok: true,
      data: {
        entryId: d.entryId,
        worker: d.subjectName,
        project: d.projectName,
        yourRole: d.partyRole,
        text: d.originalText,
        submittedAt: d.submittedAt,
        isResubmission: d.resubmissionOfEntryId !== null,
        figures: d.metrics.map((m) => ({ name: m.slug, value: m.valueNumeric ?? m.valueText, unit: m.unitSlug })),
        photos: d.photos.map((p) => p.fileName),
        history: d.history.map((h) => ({ decision: h.decision, note: h.note, at: h.at })),
      },
    };
  },
};

// ── decide: draft -> confirm ────────────────────────────────────────────────

const normalizedDecide = (p: { entryId: string; decision: string; note?: string }) => ({
  entryId: p.entryId,
  decision: p.decision,
  note: (p.note ?? "").trim(),
});

const decideDraft: CapabilityDescriptor = {
  id: "counterparty_review.decide_draft",
  kind: "draft",
  title: "Draft a decision on a submitted work entry (accept / request correction / dispute)",
  description:
    "Checks the entry is in the caller's own counterparty queue and the decision is still offered, names the work and " +
    "the decision, and returns a preview with a one-time token bound to the entry's CURRENT state. NOTHING is written. " +
    "accept is FINAL; request_correction and dispute REQUIRE a note for the worker. " +
    NOT_A_CONFIRMATION,
  exposed: true,
  annotations: readOnly,
  inputSchema: decideFields,
  run: async (caller, input): Promise<ExecResult> => {
    const checked = validateDecisionInput(decideFields.parse(input));
    if (!checked.ok) return refusal(checked.code);
    const found = await queueRowFor(caller.supabase, checked.entryId);
    if (found.kind === "unavailable") return { ok: false, code: "unavailable", message: "The review queue read failed." };
    if (found.kind === "absent") return refusal("review_authority_not_established");
    if (!offeredDecisions(found.row.latestDecision).includes(checked.decision)) {
      return found.row.latestDecision === "approved" ? refusal("already_accepted") : refusal("not_offered");
    }
    const token = mintCapabilityConfirmation({
      actionId: "counterparty_review.decide_confirm",
      input: normalizedDecide(checked),
      userId: caller.userId,
      stateFingerprint: fingerprintOf(found.row),
    });
    return {
      ok: true,
      data: {
        preview: {
          entryId: checked.entryId,
          text: found.row.originalText.slice(0, 400),
          yourRole: found.row.partyRole,
          decision: checked.decision,
          note: checked.note === "" ? null : checked.note,
          final: checked.decision === "accept",
        },
        confirmationToken: token,
        note: "Nothing was written. Confirming requires counterparty_review.decide_confirm with this exact input and token.",
      },
    };
  },
};

const decideConfirm: CapabilityDescriptor = {
  id: "counterparty_review.decide_confirm",
  kind: "confirm",
  title: "Confirm the decision on the submitted work entry",
  description:
    "Verifies the token against the exact input, the caller and the entry's CURRENT state, then runs the same " +
    "core the web queue uses (review_journal_entry, caller re-derived by the database) and notifies the worker. " +
    "Append-only: a decision is never overwritten. " +
    NOT_A_CONFIRMATION,
  exposed: true,
  annotations: {
    readOnlyHint: false,
    // Append-only: nothing is destroyed or overwritten.
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: decideConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = decideConfirmInput.parse(input);
    const checked = validateDecisionInput(parsed);
    if (!checked.ok) return refusal(checked.code);
    const found = await queueRowFor(caller.supabase, checked.entryId);
    if (found.kind === "unavailable") return { ok: false, code: "unavailable", message: "The review queue read failed." };
    if (found.kind === "absent") return refusal("review_authority_not_established");
    const verdict = verifyCapabilityConfirmation({
      actionId: "counterparty_review.decide_confirm",
      token: confirmationToken,
      input: normalizedDecide(checked),
      userId: caller.userId,
      currentStateFingerprint: fingerprintOf(found.row),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_invalid", message: `The confirmation was refused (${verdict.reason}). Draft again.` };
    }
    const result = await decideCounterpartyCore(caller.supabase as Db, caller.userId, checked);
    if (!result.ok) return refusal(result.code);
    return { ok: true, data: { decision: result.decision, entryId: checked.entryId } };
  },
};

// ── submit (worker): draft -> confirm ───────────────────────────────────────

async function submitState(caller: CapabilityCaller, entryId: string) {
  const { data, error } = await (caller.supabase as Db).rpc("entry_review_states_v1", { p_entry_ids: [entryId] });
  if (error) return { kind: "unavailable" as const, code: error.code as string | undefined };
  const state = parseEntryReviewStates(data).get(entryId);
  return state ? { kind: "state" as const, state } : { kind: "absent" as const };
}

const submitFingerprint = (entryId: string, candidates: readonly { linkId: string }[]) =>
  `${entryId}|${candidates.map((c) => c.linkId).sort().join(",")}`;

const submitDraft: CapabilityDescriptor = {
  id: "counterparty_review.submit_draft",
  kind: "draft",
  title: "Draft submitting my own journal entry to the client for review",
  description:
    "For the AUTHOR of an entry only: names the registered counterparty (or the choices when there is more than one) " +
    "and returns a one-time token. NOTHING is submitted by the draft; an entry is never submitted automatically.",
  exposed: true,
  annotations: readOnly,
  inputSchema: submitFields,
  run: async (caller, input): Promise<ExecResult> => {
    const { entryId, linkId } = submitFields.parse(input);
    const s = await submitState(caller, entryId);
    if (s.kind === "unavailable") {
      return s.code && PG_UNDEFINED.has(s.code) ? refusal("needs_migration") : { ok: false, code: "unavailable", message: "The entry state read failed." };
    }
    if (s.kind === "absent") return { ok: false, code: "not_found", message: "No such entry of yours." };
    if (s.state.submission) return { ok: false, code: "already_submitted", message: "This entry was already submitted." };
    const candidates = s.state.candidates;
    if (candidates.length === 0) {
      return { ok: false, code: "no_counterparty_registered", message: "No client is registered for this work yet." };
    }
    if (linkId && !candidates.some((c) => c.linkId === linkId)) {
      return { ok: false, code: "counterparty_not_valid", message: "That counterparty is not valid for this entry." };
    }
    if (!linkId && candidates.length > 1) {
      return {
        ok: false,
        code: "counterparty_ambiguous",
        message: "More than one client is registered; pass linkId.",
        // the choices are named so the caller can pick one
        existing: candidates.map((c) => `${c.linkId}=${c.partyName ?? "?"}`).join("; "),
      };
    }
    const chosen = linkId ?? candidates[0].linkId;
    const token = mintCapabilityConfirmation({
      actionId: "counterparty_review.submit_confirm",
      input: { entryId, linkId: chosen },
      userId: caller.userId,
      stateFingerprint: submitFingerprint(entryId, candidates),
    });
    const party = candidates.find((c) => c.linkId === chosen);
    return {
      ok: true,
      data: {
        preview: { entryId, submitTo: party?.partyName ?? null, role: party?.partyRole ?? null },
        confirmationToken: token,
        linkId: chosen,
        note: "Nothing was submitted. Confirming requires counterparty_review.submit_confirm with entryId, this linkId and the token.",
      },
    };
  },
};

const submitConfirm: CapabilityDescriptor = {
  id: "counterparty_review.submit_confirm",
  kind: "confirm",
  title: "Confirm submitting my journal entry to the client for review",
  description:
    "Verifies the token against the exact input and the entry's CURRENT counterparty state, then calls the same " +
    "database function the web 'Submit for review' button calls (author only; the database validates the link).",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: submitConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, entryId, linkId } = submitConfirmInput.parse(input);
    if (!linkId) return { ok: false, code: "invalid", message: "linkId (from the draft) is required." };
    const s = await submitState(caller, entryId);
    if (s.kind !== "state") return { ok: false, code: "unavailable", message: "The entry state read failed." };
    const verdict = verifyCapabilityConfirmation({
      actionId: "counterparty_review.submit_confirm",
      token: confirmationToken,
      input: { entryId, linkId },
      userId: caller.userId,
      currentStateFingerprint: submitFingerprint(entryId, s.state.candidates),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_invalid", message: `The confirmation was refused (${verdict.reason}). Draft again.` };
    }
    const result = await submitEntryCore(caller.supabase as Db, { entryId, linkId });
    if (!result.ok) return { ok: false, code: result.code };
    return { ok: true, data: { submitted: result.code, entryId } };
  },
};

export const COUNTERPARTY_REVIEW_CAPABILITIES: readonly CapabilityDescriptor[] = [
  queueGet,
  entryGet,
  decideDraft,
  decideConfirm,
  submitDraft,
  submitConfirm,
];
