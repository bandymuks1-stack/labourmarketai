import "server-only";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { createJournalEntryCore } from "@/lib/journal/journal-write-core";
import { fd } from "@/lib/conversation/executor-contract";
import { readProfileRow } from "@/lib/auth/session-profile";
import { readWorkerCoreRow, readWorkerSkillRows } from "@/lib/data/worker-core";
import { listJournalEntries } from "@/lib/journal/journal-list-core";
import { listWorkspaceMemberships } from "@/lib/company/active-organization";
import { switchActiveWorkspaceCore } from "@/lib/company/workspace-switch-core";
import {
  expressInterestCore,
  interestStateFingerprint,
  listVisibleDemandsForCaller,
} from "@/lib/opportunities/interest";
import { safeApprovedCompanyName } from "@/lib/opportunities/opportunity-fit";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";
import {
  workerExpressInterestSchema,
  workerLogWorkSchema,
  workerSaveWorkCardFields,
  workerSaveWorkCardSchema,
} from "@/lib/conversation/worker-schemas";
import {
  normalizeCountryList,
  saveWorkerCardCore,
  workCardStateFingerprint,
} from "@/lib/worker/work-card-core";
import {
  resolveEngagementContext,
  type EngagementCandidate,
} from "@/lib/journal/engagement-context-selection";
import { PROFESSIONAL_HISTORY_RELATIONSHIPS } from "@/lib/player-card/work-history-model";
import { orgDisplayName } from "@/lib/company/org-display";
import type { ExecResult } from "@/lib/conversation/executor-contract";
import type {
  CapabilityCaller,
  CapabilityDescriptor,
} from "./contract";

/**
 * THE capability registry — one entry per domain action an external client
 * may invoke. Additions happen here, in review, never dynamically.
 *
 * Every handler runs on the CALLER'S OWN client (RLS decides), reuses the
 * same tables/helpers the web routes read, and derives nothing the product
 * derives elsewhere — `profile.get` returns recorded facts, not a second
 * completeness score (the Player Card readiness model stays the ONE
 * completeness source and is cookie-coupled today; threading it to bearer
 * callers is the recorded shared-core refactor, not a thing to fake here).
 */

// ── profile.get ────────────────────────────────────────────────────────────

const profileGet: CapabilityDescriptor = {
  id: "profile.get",
  kind: "read",
  title: "My LabourMarket profile",
  description:
    "The caller's own profile record: name, locale, country, onboarding " +
    "state, and whether a worker profile exists. Facts as recorded — no " +
    "derived scores.",
  exposed: true,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    // G4 bridge: the SAME profile-row core the web session shell reads
    // (`getSessionProfile` → readProfileRow) and the SAME workers-row core
    // every web navigation reads (`getWorkerCoreRow` → readWorkerCoreRow) —
    // one query contract per table, no capability-side re-implementation.
    const read = await readProfileRow(caller);
    if (!read.ok) {
      // A failed read is "unavailable", never "you have no profile" (#1314).
      return { ok: false, code: "unavailable", message: "Profile read failed." };
    }
    const profile = read.value;
    if (!profile) {
      return { ok: false, code: "not_found", message: "No profile row for this account." };
    }

    const workerRead = await readWorkerCoreRow(caller);

    return {
      ok: true,
      data: {
        profile: {
          id: profile.id,
          fullName: profile.full_name,
          email: profile.email,
          locale: profile.locale,
          country: profile.country,
          onboarded: profile.onboarded,
          activeRole: profile.active_role,
        },
        // Three-valued on purpose: unknown ≠ absent.
        worker: !workerRead.ok
          ? { status: "unavailable" as const }
          : workerRead.value
            ? { status: "exists" as const, workerId: workerRead.value.id }
            : { status: "none" as const },
      },
    };
  },
};

// ── living_cv.skills.get ───────────────────────────────────────────────────

const livingCvSkillsGet: CapabilityDescriptor = {
  id: "living_cv.skills.get",
  kind: "read",
  title: "My Living CV skills",
  description:
    "The caller's own declared and journal-backed skills with their " +
    "verification state and source — the same rows the web Living CV reads.",
  exposed: true,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: z.object({}).strict(),
  run: async (caller): Promise<ExecResult> => {
    // G4 bridge: the same workers-row core the web reads (readWorkerCoreRow).
    const workerRead = await readWorkerCoreRow(caller);
    if (!workerRead.ok) {
      return { ok: false, code: "unavailable", message: "Worker read failed." };
    }
    const worker = workerRead.value;
    if (!worker) {
      return {
        ok: false,
        code: "no_worker",
        message: "This account has no worker profile, so it has no Living CV skills.",
      };
    }

    // G4 bridge: THE canonical worker_skills core — the same rows every web
    // navigation reads through `getWorkerSkillRows` (and the web Living CV).
    const skillsRead = await readWorkerSkillRows(caller, worker.id);
    if (!skillsRead.ok) {
      return { ok: false, code: "unavailable", message: "Skills read failed." };
    }

    return {
      ok: true,
      data: {
        workerId: worker.id,
        skills: skillsRead.value.map((r) => ({
          skillId: r.skill_id,
          slug: r.skills?.slug ?? null,
          verified: r.verified,
          source: r.source,
          verifiedAt: r.verified_at,
        })),
      },
    };
  },
};

// ── journal.list ───────────────────────────────────────────────────────────

const journalListInput = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const journalList: CapabilityDescriptor = {
  id: "journal.list",
  kind: "read",
  title: "My Work Journal entries",
  description:
    "The caller's own most recent Work Journal entries — the same live rows " +
    "the web journal page shows: entry text, creation time, recorded metrics " +
    "(including the work_date metric), and confirmation count. Newest first. " +
    "`limit` bounds the read (default 20, max 50); a page may carry fewer " +
    "live rows than the limit when older revisions were superseded.",
  exposed: true,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: journalListInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = journalListInput.parse(input);
    // G4 bridge: THE canonical journal-list core — the exact read the web
    // journal page performs (v3 lifecycle select + legacy fallback).
    const read = await listJournalEntries(caller, { limit: parsed.limit ?? 20 });
    if (!read.ok) {
      return read.code === "no_worker"
        ? {
            ok: false,
            code: "no_worker_profile",
            message: "This account has no worker profile, so it has no Work Journal.",
          }
        : { ok: false, code: "unavailable", message: "Journal read failed." };
    }
    return {
      ok: true,
      data: {
        workerId: read.workerId,
        entries: read.entries.map((e) => ({
          entryId: e.id,
          text: e.original_text,
          createdAt: e.created_at,
          engagementContextId: e.engagement_context_id ?? null,
          metrics: (e.journal_entry_metrics ?? []).map((m) => ({
            slug: m.metric_slug,
            valueText: m.value_text,
            valueNumeric: m.value_numeric,
            unitSlug: m.unit_slug,
          })),
          confirmations: (e.journal_entry_confirmations ?? []).length,
        })),
      },
    };
  },
};

// ── journal.create_draft / journal.confirm ─────────────────────────────────
// (Confirmation wiring lives in ./confirmable — ONE minting/verification
// semantics for every bridged write capability, G4 tail wagon 1.)

/**
 * The confirmation token's state fingerprint is the caller's JOURNAL CHAIN
 * HEAD — which is what makes the token genuinely ONE-TIME: a successful
 * confirm appends an entry, the head moves, and a replay of the same token
 * (a duplicate retry, a stolen token, a double-tap) fails as `stale_state`
 * instead of writing a second entry. A constant fingerprint here would have
 * made "one-time" a five-minute lie.
 */
async function journalChainFingerprint(
  caller: CapabilityCaller,
): Promise<{ ok: true; fingerprint: string } | { ok: false; result: ExecResult }> {
  // G4 bridge: the same workers-row core the web reads (readWorkerCoreRow).
  const workerRead = await readWorkerCoreRow(caller);
  if (!workerRead.ok) {
    return {
      ok: false,
      result: { ok: false, code: "unavailable", message: "Worker read failed." },
    };
  }
  const worker = workerRead.value;
  if (!worker) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "no_worker_profile",
        message: "This account has no worker profile, so it has no Work Journal.",
      },
    };
  }
  const { data: head, error: headError } = await caller.supabase
    .from("journal_entries")
    .select("hash_self")
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (headError) {
    return {
      ok: false,
      result: { ok: false, code: "unavailable", message: "Journal read failed." },
    };
  }
  return {
    ok: true,
    fingerprint: `journal-head:v1:${worker.id}:${head?.hash_self ?? "genesis"}`,
  };
}

/**
 * A CONFIRMATION HASH MUST NOT DEPEND ON null-vs-absent. The draft side may
 * receive `siteName` as absent while the confirming client copies the
 * preview's explicit `null` back (that is exactly what an MCP model does) —
 * JSON drops the absent key and keeps the null one, so the same draft would
 * hash differently and every confirm would die as `input_mismatch`. Both
 * sides hash THIS normalized shape.
 */
function normalizedDraftForHash(draft: {
  engagementContextId: string;
  notes: string;
  workDate: string;
  siteName?: string | null;
}): Record<string, unknown> {
  return {
    engagementContextId: draft.engagementContextId,
    notes: draft.notes,
    workDate: draft.workDate,
    siteName: draft.siteName ?? null,
  };
}

/**
 * WHICH ENGAGEMENT CONTEXT — capability edition (§18 of the chat-first
 * audit: a user must never need an internal UUID to get value).
 *
 * `engagementContextId` is an internal id no external client can discover, so
 * the draft capability resolves it the SAME way the web work-log flow does:
 * the caller's own active professional contexts under their own RLS, decided
 * by the canonical rule hierarchy (`resolveEngagementContext`, rules B/C/D).
 * On real ambiguity (rule C) it returns the labeled options and mints NO
 * token — the client must ask the human, exactly like the web flow. A
 * requested id that is NOT one of the caller's own contexts gets the same
 * labeled-options answer, never a token: the write core would refuse the
 * draft anyway, and a token for an unconfirmable draft is a lie in waiting.
 */
type DraftEngagementOutcome =
  | { kind: "selected"; id: string; label: string | null }
  | {
      kind: "choice";
      reason: "ambiguous" | "unknown_requested_id";
      options: { id: string; label: string }[];
    }
  | { kind: "refused"; result: ExecResult };

async function resolveDraftEngagementContext(
  caller: CapabilityCaller,
  workDate: string,
  requestedId: string | undefined,
): Promise<DraftEngagementOutcome> {
  const { data: rows, error } = await caller.supabase
    .from("engagement_contexts")
    .select(
      "id, relationship_slug, title, is_primary, organization_id, status, started_at, ended_at, organizations(display_name, legal_name)",
    )
    .eq("profile_id", caller.userId)
    .eq("status", "active")
    .in("relationship_slug", [...PROFESSIONAL_HISTORY_RELATIONSHIPS])
    .order("is_primary", { ascending: false });
  if (error) {
    return {
      kind: "refused",
      result: { ok: false, code: "unavailable", message: "Engagement context read failed." },
    };
  }

  const tRelationships = await getTranslations({
    locale: caller.locale,
    namespace: "relationshipTypes",
  });
  const relationshipLabel = (slug: string): string =>
    tRelationships.has(slug) ? tRelationships(slug) : slug;

  type Row = {
    id: string;
    relationship_slug: string;
    title: string | null;
    is_primary: boolean | null;
    organization_id: string | null;
    status: string | null;
    started_at: string | null;
    ended_at: string | null;
    organizations: { display_name: string | null; legal_name: string | null } | null;
  };
  const contexts = (rows ?? []) as unknown as Row[];

  // Same qualification rule as the web work-log selector
  // (lib/conversation/worklog-engagements.ts): a base label that occurs more
  // than once is qualified by its relationship, a unique one is left as-is.
  // Without it, two contexts at the same organization (or two org-less ones
  // sharing a relationship) render as the identical word and the choice the
  // options exist to offer cannot actually be made.
  const withBase = contexts.map((row) => ({
    row,
    base:
      orgDisplayName(row.organizations?.display_name, row.organizations?.legal_name) ??
      row.title ??
      relationshipLabel(row.relationship_slug),
  }));
  const baseCounts = new Map<string, number>();
  for (const { base } of withBase) {
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }
  const labelById = new Map<string, string>();
  for (const { row, base } of withBase) {
    const duplicated = (baseCounts.get(base) ?? 0) > 1;
    labelById.set(
      row.id,
      duplicated ? `${base} — ${relationshipLabel(row.relationship_slug)}` : base,
    );
  }

  // An explicitly named context must be one of the caller's OWN — the real
  // ChatGPT write E2E (2026-08-30) showed a model fabricating a nil-UUID id,
  // and passing it through minted a confirmation token for a draft the write
  // core could never accept. A fabricated/foreign id gets the caller's real
  // labeled options back instead of a dead-end token.
  if (requestedId) {
    const named = contexts.find((r) => r.id === requestedId);
    if (named) {
      return {
        kind: "selected",
        id: requestedId,
        label: labelById.get(named.id) ?? null,
      };
    }
    if (contexts.length > 0) {
      return {
        kind: "choice",
        reason: "unknown_requested_id",
        options: contexts.map((r) => ({ id: r.id, label: labelById.get(r.id)! })),
      };
    }
    return {
      kind: "refused",
      result: {
        ok: false,
        code: "no_engagement_context",
        message:
          "The given engagementContextId does not belong to this account, and the account has no active work context to offer instead.",
      },
    };
  }

  const candidates: EngagementCandidate[] = contexts.map((r) => ({
    id: r.id,
    relationshipSlug: r.relationship_slug,
    organizationId: r.organization_id,
    status: r.status ?? "active",
    startedAt: r.started_at,
    endedAt: r.ended_at,
    isPrimary: r.is_primary === true,
  }));
  const resolution = resolveEngagementContext({ candidates, workDay: workDate });
  if (resolution.selectedId) {
    return {
      kind: "selected",
      id: resolution.selectedId,
      label: labelById.get(resolution.selectedId) ?? null,
    };
  }
  if (resolution.rule === "C") {
    const applicable = new Set(resolution.candidateIds);
    return {
      kind: "choice",
      reason: "ambiguous",
      options: contexts
        .filter((r) => applicable.has(r.id))
        .map((r) => ({ id: r.id, label: labelById.get(r.id)! })),
    };
  }
  return {
    kind: "refused",
    result: {
      ok: false,
      code: "no_engagement_context",
      message:
        "No active engagement context can hold this entry — the account has no usable work context.",
    },
  };
}

/** Capability-level draft input: `engagementContextId` becomes OPTIONAL here
 *  (and only here) — when absent the capability resolves it by the canonical
 *  rule hierarchy above. The conversation dispatcher's contract is untouched. */
const journalDraftInput = workerLogWorkSchema.extend({
  engagementContextId: z.uuid().optional(),
});

const journalCreateDraft: CapabilityDescriptor = {
  id: "journal.create_draft",
  kind: "draft",
  title: "Draft a Work Journal entry",
  description:
    "Validates a Work Journal entry and returns the exact preview that " +
    "would be saved, plus a one-time confirmation token. NOTHING is written. " +
    "engagementContextId may be omitted: the entry's work context is then " +
    "resolved from the caller's own active contexts, and on real ambiguity " +
    "the labeled options are returned so the user can choose by name. " +
    "Uses the same input contract as the web chat work-log form.",
  // Exposed since the journal-write extraction landed (owner-approved
  // 2026-08-29 §6): journal.confirm now performs the real canonical write,
  // so the draft it prepares leads somewhere true.
  exposed: true,
  // Read-only is HONEST here: a draft mints a token and writes NOTHING —
  // the write happens only in journal.confirm.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: journalDraftInput,
  run: async (caller, input): Promise<ExecResult> => {
    const draft = journalDraftInput.parse(input);
    const engagement = await resolveDraftEngagementContext(
      caller,
      draft.workDate,
      draft.engagementContextId,
    );
    if (engagement.kind === "refused") return engagement.result;
    if (engagement.kind === "choice") {
      // NOTHING preselected, NO token minted — the client must ask the human,
      // exactly like the web work-log flow. Two ways here: real ambiguity
      // (rule C) or a requested id that is not one of the caller's own.
      return {
        ok: true,
        data: {
          status: "engagement_choice_required",
          options: engagement.options,
          note:
            engagement.reason === "unknown_requested_id"
              ? "The given engagementContextId is not one of this account's active work contexts — nothing was drafted. Ask the user to choose one of these options, then draft again with the chosen engagementContextId."
              : "This entry could belong to more than one work context. Ask the user to choose, then draft again with the chosen engagementContextId.",
        },
      };
    }
    const state = await journalChainFingerprint(caller);
    if (!state.ok) return state.result;
    const resolved = {
      engagementContextId: engagement.id,
      notes: draft.notes,
      workDate: draft.workDate,
      siteName: draft.siteName ?? null,
    };
    const token = mintCapabilityConfirmation({
      actionId: "journal.confirm",
      input: normalizedDraftForHash(resolved),
      userId: caller.userId,
      stateFingerprint: state.fingerprint,
    });
    return {
      ok: true,
      data: {
        preview: {
          workDate: resolved.workDate,
          siteName: resolved.siteName,
          notes: resolved.notes,
          engagementContextId: resolved.engagementContextId,
          // The RESOLVED context, named — the human must SEE which context
          // the entry will land in before confirming (preselect-and-show,
          // never silently assign).
          engagementLabel: engagement.label,
        },
        confirmationToken: token,
        note: "Nothing was saved. Confirming requires journal.confirm with this exact draft and token.",
      },
    };
  },
};

const journalConfirmInput = workerLogWorkSchema.extend({
  confirmationToken: z.string().min(10),
});

const journalConfirm: CapabilityDescriptor = {
  id: "journal.confirm",
  kind: "confirm",
  title: "Confirm a drafted Work Journal entry",
  description:
    "Verifies the confirmation token against the exact draft, then performs " +
    "the canonical append-only journal write as the caller.",
  // The former honest gate is CLOSED: the canonical write was extracted into
  // the transport-neutral `createJournalEntryCore` (owner-approved 2026-08-29
  // §6), so a verified draft now becomes the SAME append-only, hash-chained,
  // pipeline-awaited save the web composer performs — as the caller, under
  // the caller's RLS, with the identical FormData mapping the conversation
  // executor uses (worker-executors.ts "worker.log-work"). No fork.
  exposed: true,
  // A real write — but APPEND-ONLY (never destroys data) and one-time-token
  // gated, so a duplicate retry with the same arguments cannot write twice.
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: journalConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = journalConfirmInput.parse(input);
    const { confirmationToken, ...draft } = parsed;
    const state = await journalChainFingerprint(caller);
    if (!state.ok) return state.result;
    const verdict = verifyCapabilityConfirmation({
      actionId: "journal.confirm",
      token: confirmationToken,
      // Same null-vs-absent normalization the draft hashed — see
      // normalizedDraftForHash.
      input: normalizedDraftForHash(draft),
      userId: caller.userId,
      currentStateFingerprint: state.fingerprint,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). Draft again.`,
      };
    }

    const t = await getTranslations({
      locale: caller.locale,
      namespace: "journal.errors",
    });
    const result = await createJournalEntryCore(
      { supabase: caller.supabase, userId: caller.userId, t },
      fd({
        locale: caller.locale,
        engagement_context_id: draft.engagementContextId,
        notes: draft.notes,
        work_date: draft.workDate,
        site_name: draft.siteName ?? "",
      }),
    );
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return {
      ok: true,
      data: {
        entryId: result.entryId,
        // The REAL awaited pipeline outcome — read through, never invented.
        skills: {
          status: result.skills.status,
          added: result.skills.added,
          strengthened: result.skills.strengthened,
          reviewNeeded: result.skills.reviewNeeded,
          claimsSaved: result.skills.claimsSaved,
          cvUpdated: result.skills.cvUpdated,
        },
      },
    };
  },
};

// ── interest.express_draft / interest.express_confirm ──────────────────────
// G4 tail wagon 1: the FIRST schema'd conversation write bridged through the
// capability architecture. `conversationActionId` links both halves to
// `worker.express-interest` — same zod schema, same confirmation tier
// (important_write → draft/confirm), same state fingerprint, same domain
// core (`expressInterestCore`). No parallel implementation anywhere.

/** Capability-level draft input: `requestId` becomes OPTIONAL here (and only
 *  here) — when absent or unknown the caller's VISIBLE demands come back as
 *  labeled options, so no external client ever needs to invent a UUID
 *  (#1360 lesson, applied before the defect this time). */
const interestDraftInput = workerExpressInterestSchema.extend({
  requestId: z.uuid().optional(),
});

/** The confirmation hash must not depend on null-vs-absent `note` — the
 *  journal pair's normalizedDraftForHash lesson, same rule here. */
function normalizedInterestForHash(draft: {
  requestId: string;
  note?: string | null;
}): Record<string, unknown> {
  return { requestId: draft.requestId, note: draft.note ?? null };
}

/** Human label for a board row — approved facts only (role text, the safe
 *  approved company name, the safe location label). Never free text from a
 *  non-approved route. */
function demandOptionLabel(row: Record<string, unknown>): string {
  const role =
    typeof row.role_text === "string" && row.role_text.trim() !== ""
      ? row.role_text.trim()
      : String(row.id);
  const company = safeApprovedCompanyName(row);
  const location =
    typeof row.location_label === "string" && row.location_label.trim() !== ""
      ? row.location_label.trim()
      : typeof row.country === "string" && row.country.trim() !== ""
        ? row.country.trim()
        : null;
  const suffix = [company, location].filter((v): v is string => v !== null);
  return suffix.length > 0 ? `${role} — ${suffix.join(", ")}` : role;
}

const interestExpressDraft: CapabilityDescriptor = {
  id: "interest.express_draft",
  kind: "draft",
  conversationActionId: "worker.express-interest",
  title: "Draft expressing interest in a demand",
  description:
    "Validates expressing interest in a demand the caller can currently SEE " +
    "on their own opportunity board and returns a human-readable preview " +
    "plus a one-time confirmation token. NOTHING is sent or stored. " +
    "requestId may be omitted or unknown — the caller's visible demands " +
    "come back as labeled options to choose from. The signal is " +
    "internal-only: the demand's owner sees it on their own view; no email " +
    "or message leaves the platform.",
  exposed: true,
  // Read-only is HONEST: a draft reads the board and mints a token — the
  // write happens only in interest.express_confirm.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: interestDraftInput,
  run: async (caller, input): Promise<ExecResult> => {
    const draft = interestDraftInput.parse(input);
    // THE board pipeline — the same visibility gate the write re-checks.
    const rows = await listVisibleDemandsForCaller(caller);
    if (rows === null) {
      return { ok: false, code: "unavailable", message: "Opportunity board read failed." };
    }
    const row = draft.requestId
      ? (rows.find((r) => String(r.id) === draft.requestId) ?? null)
      : null;
    if (!row) {
      if (rows.length === 0) {
        return {
          ok: false,
          code: "no_visible_demand",
          message:
            "No demands are visible to this account right now, so there is nothing to express interest in.",
        };
      }
      // Unknown, foreign, or omitted id — identical answer (no oracle):
      // the caller's own options, and NO token.
      return {
        ok: true,
        data: {
          status: "demand_choice_required",
          options: rows
            .slice(0, 20)
            .map((r) => ({ id: String(r.id), label: demandOptionLabel(r) })),
          note: "The given requestId is not one of the demands this account can see — nothing was drafted. Ask the user to choose one of these options, then draft again with the chosen id.",
        },
      };
    }

    // Eligibility: an account without a worker profile gets an honest
    // refusal, never a token for an unconfirmable draft.
    const workerRead = await readWorkerCoreRow(caller);
    if (!workerRead.ok) {
      return { ok: false, code: "unavailable", message: "Worker read failed." };
    }
    if (!workerRead.value) {
      return {
        ok: false,
        code: "no_worker_profile",
        message: "This account has no worker profile, so it cannot express interest.",
      };
    }

    const requestId = draft.requestId as string;
    // THE shared fingerprint — the same fact the conversation dispatcher
    // binds its confirmation to (lib/opportunities/interest).
    const fingerprint = await interestStateFingerprint(caller, requestId);
    const normalized = normalizedInterestForHash({ requestId, note: draft.note });
    const token = mintCapabilityConfirmation({
      actionId: "interest.express_confirm",
      input: normalized,
      userId: caller.userId,
      stateFingerprint: fingerprint,
    });
    return {
      ok: true,
      data: {
        preview: {
          requestId,
          demandLabel: demandOptionLabel(row),
          note: draft.note ?? null,
          // HONEST idempotency note: the domain treats a repeat express as a
          // snapshot refresh, and the human should know it is a repeat.
          alreadyExpressed: fingerprint === "interest:interested",
        },
        confirmationToken: token,
        note: "Nothing was sent. Confirming requires interest.express_confirm with this exact draft and token.",
      },
    };
  },
};

const interestConfirmInput = workerExpressInterestSchema.extend({
  confirmationToken: z.string().min(10),
});

const interestExpressConfirm: CapabilityDescriptor = {
  id: "interest.express_confirm",
  kind: "confirm",
  conversationActionId: "worker.express-interest",
  title: "Confirm expressing interest in a demand",
  description:
    "Verifies the confirmation token against the exact draft, then performs " +
    "the canonical express-interest write as the caller. Idempotent by " +
    "domain design: re-expressing refreshes the stored snapshot and keeps " +
    "the status. The demand's visibility is re-checked at write time.",
  exposed: true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: interestConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = interestConfirmInput.parse(input);
    const { confirmationToken, ...draft } = parsed;
    const fingerprint = await interestStateFingerprint(caller, draft.requestId);
    const verdict = verifyCapabilityConfirmation({
      actionId: "interest.express_confirm",
      token: confirmationToken,
      input: normalizedInterestForHash(draft),
      userId: caller.userId,
      currentStateFingerprint: fingerprint,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). Draft again.`,
      };
    }

    // THE canonical core — the identical write the web chat confirmation and
    // the board button perform. Every precondition re-runs inside it.
    const result = await expressInterestCore(caller, {
      requestId: draft.requestId,
      note: draft.note ?? null,
    });
    if (result.kind !== "ok") {
      const code =
        result.kind === "no-worker"
          ? "no_worker_profile"
          : result.kind === "not-visible"
            ? "not_visible"
            : result.kind === "needs-migration"
              ? "needs_migration"
              : result.kind === "invalid"
                ? "invalid"
                : "unavailable";
      const message =
        result.kind === "not-visible"
          ? "That demand is not visible to this account (it may have closed)."
          : result.kind === "no-worker"
            ? "This account has no worker profile, so it cannot express interest."
            : result.kind === "needs-migration"
              ? "The interest signal store is not enabled on this environment."
              : result.kind === "invalid"
                ? "Invalid request."
                : "Express-interest failed.";
      return { ok: false, code, message };
    }
    return {
      ok: true,
      data: {
        status: result.status,
        // Where the richer UI shows the same fact (the action registry's
        // advanced route for worker.express-interest).
        structuredDestination: "/dashboard/opportunities",
      },
    };
  },
};

// ── context.switch ─────────────────────────────────────────────────────────

const contextSwitchInput = z
  .object({
    /** "personal", a workspace id, or an organization name from the
     *  caller's own memberships. */
    workspace: z.string().min(1).max(200),
  })
  .strict();

const contextSwitch: CapabilityDescriptor = {
  id: "context.switch",
  kind: "execute",
  title: "Switch my active workspace",
  description:
    "Switches the caller's DURABLE active-workspace pointer — the default " +
    "new sessions and bearer clients resolve against. An already-open " +
    "browser session keeps its own in-session choice until changed there. " +
    "`workspace` is 'personal', a workspace id, or an organization name " +
    "from the caller's own memberships; an unknown or ambiguous value " +
    "returns the labeled options and switches NOTHING.",
  exposed: true,
  // A real write (the pointer row) — reversible, never destructive, and
  // repeating the same switch is a no-op.
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: contextSwitchInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = contextSwitchInput.parse(input);
    // G4 bridge: the SAME membership list the web workspace chip renders,
    // and the SAME switch core the web server actions run.
    const memberships = await listWorkspaceMemberships(caller);

    const t = await getTranslations({
      locale: caller.locale,
      namespace: "capabilities",
    });
    const tRelationships = await getTranslations({
      locale: caller.locale,
      namespace: "relationshipTypes",
    });
    const relationshipLabel = (slug: string): string =>
      tRelationships.has(slug) ? tRelationships(slug) : slug;
    // Same duplicate-qualification rule as the work-log selector (#1360):
    // a base label that occurs more than once gains its relationship.
    const baseOf = (w: (typeof memberships)[number]): string =>
      w.kind === "personal" ? t("workspacePersonal") : w.name.trim() || t("notSet");
    const baseCounts = new Map<string, number>();
    for (const w of memberships) {
      const base = baseOf(w);
      baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
    }
    const labelOf = (w: (typeof memberships)[number]): string => {
      const base = baseOf(w);
      const duplicated = (baseCounts.get(base) ?? 0) > 1;
      return duplicated && w.kind === "organization" && w.relationship
        ? `${base} — ${relationshipLabel(w.relationship)}`
        : base;
    };

    // Resolution is deliberately EXACT (id, the personal sentinel, or a
    // full case-insensitive name) — fuzzy sentence matching stays the web
    // chat's own presentation concern; anything else gets the options.
    const needle = parsed.workspace.trim().toLowerCase();
    const matches = memberships.filter(
      (w) =>
        w.id.toLowerCase() === needle ||
        (w.kind === "organization" && w.name.trim().toLowerCase() === needle),
    );
    if (matches.length !== 1) {
      return {
        ok: true,
        data: {
          status: "workspace_choice_required",
          options: memberships.map((w) => ({ id: w.id, label: labelOf(w) })),
          note: "The given workspace is not exactly one of the caller's own — nothing was switched. Ask the user to choose, then call again with the chosen workspace id.",
        },
      };
    }

    const target = matches[0];
    const result = await switchActiveWorkspaceCore(caller, target.id);
    if (!result.ok) {
      if (result.code === "needs-migration") {
        return {
          ok: false,
          code: "needs_migration",
          message:
            "The durable workspace pointer is not enabled on this environment, so a bearer client cannot switch yet. The web workspace switcher still works.",
        };
      }
      if (result.code === "not-member") {
        return {
          ok: false,
          code: "not_authorized",
          message: "Not a member of that workspace.",
        };
      }
      return { ok: false, code: "unavailable", message: "Workspace switch failed." };
    }
    return {
      ok: true,
      data: {
        status: "switched",
        workspaceId: target.id,
        label: labelOf(target),
        durablePointer: true,
      },
    };
  },
};

// ── work_card.save draft → confirm (G4 tail wagon 2) ──────────────────────
//
// The worker's availability/location/salary card — the SAME
// `save_worker_card` RPC the web form and the chat `worker.save-work-card`
// form submit, through ONE domain core (`lib/worker/work-card-core`). The
// capability adds nothing of its own: partial saves stay the domain rule
// (an omitted field keeps its value), and the write happens only in the
// confirm leg after an explicit human confirmation.

/** Which of the card fields this draft actually provides — `undefined` means
 *  "keep the current value" and must survive the round trip untouched. */
const WORK_CARD_FIELDS = [
  "availabilityStatus",
  "availableFrom",
  "salaryMin",
  "salaryMax",
  "locationCountry",
  "preferredCountries",
] as const;

type WorkCardDraft = z.infer<typeof workerSaveWorkCardSchema>;

function providedWorkCardFields(draft: WorkCardDraft): string[] {
  return WORK_CARD_FIELDS.filter((f) => draft[f] !== undefined);
}

/** The confirmation hash must not depend on null-vs-absent — absent fields
 *  are normalized to a sentinel that cannot collide with a real value, so
 *  "clear this field" (null) and "keep this field" (absent) stay DIFFERENT
 *  drafts (they are different writes). */
function normalizedWorkCardForHash(draft: WorkCardDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of WORK_CARD_FIELDS) {
    out[f] = draft[f] === undefined ? "__keep__" : (draft[f] ?? null);
  }
  return out;
}

const workCardSaveDraft: CapabilityDescriptor = {
  id: "work_card.save_draft",
  kind: "draft",
  conversationActionId: "worker.save-work-card",
  title: "Draft a work-card update",
  description:
    "Validates an update to the caller's own work card (availability, " +
    "available-from date, salary range, location country, preferred " +
    "countries) and returns a preview of exactly what would change plus a " +
    "one-time confirmation token. NOTHING is saved. Omitted fields keep " +
    "their current values; a field sent as null clears it. Confirming " +
    "requires work_card.save_confirm with this exact draft and token.",
  exposed: true,
  // Read-only is HONEST: the draft reads the current card and mints a token —
  // the write happens only in work_card.save_confirm.
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: workerSaveWorkCardSchema,
  run: async (caller, input): Promise<ExecResult> => {
    const draft = workerSaveWorkCardSchema.parse(input);
    const provided = providedWorkCardFields(draft);
    if (provided.length === 0) {
      return {
        ok: false,
        code: "nothing_to_save",
        message:
          "No card field was provided, so there is nothing to draft. Send at least one field.",
      };
    }

    // Eligibility + current values through THE canonical workers-row core.
    const workerRead = await readWorkerCoreRow(caller);
    if (!workerRead.ok) {
      return { ok: false, code: "unavailable", message: "Worker read failed." };
    }
    if (!workerRead.value) {
      return {
        ok: false,
        code: "no_worker_profile",
        message: "This account has no worker profile, so it has no work card to update.",
      };
    }
    const current = workerRead.value;

    // The honest change preview — current recorded value → drafted value,
    // only for the fields this draft provides. (Salary currently has no
    // caller-readable column in the core row; its `from` is honestly null.)
    const currentByField: Record<string, unknown> = {
      availabilityStatus: current.availability_status,
      availableFrom: current.available_from,
      salaryMin: null,
      salaryMax: null,
      locationCountry: current.current_location_country,
      preferredCountries: current.preferred_countries,
    };
    const changes = provided.map((field) => ({
      field,
      from: currentByField[field] ?? null,
      to:
        field === "preferredCountries"
          ? normalizeCountryList(draft.preferredCountries ?? null)
          : field === "locationCountry"
            ? (draft.locationCountry?.toUpperCase() ?? null)
            : (draft[field as keyof WorkCardDraft] ?? null),
    }));

    const fingerprint = await workCardStateFingerprint(caller);
    const token = mintCapabilityConfirmation({
      actionId: "work_card.save_confirm",
      input: normalizedWorkCardForHash(draft),
      userId: caller.userId,
      stateFingerprint: fingerprint,
    });
    return {
      ok: true,
      data: {
        preview: { changes },
        confirmationToken: token,
        note: "Nothing was saved. Confirming requires work_card.save_confirm with this exact draft and token. Omitted fields keep their current values.",
      },
    };
  },
};

const workCardConfirmInput = workerSaveWorkCardFields.extend({
  confirmationToken: z.string().min(10),
});

const workCardSaveConfirm: CapabilityDescriptor = {
  id: "work_card.save_confirm",
  kind: "confirm",
  conversationActionId: "worker.save-work-card",
  title: "Confirm the work-card update",
  description:
    "Verifies the confirmation token against the exact draft, then performs " +
    "the canonical work-card save as the caller (the same save_worker_card " +
    "write path as the web form). Partial by design: omitted fields keep " +
    "their current values.",
  exposed: true,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: workCardConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = workCardConfirmInput.parse(input);
    const { confirmationToken, ...draft } = parsed;
    const fingerprint = await workCardStateFingerprint(caller);
    const verdict = verifyCapabilityConfirmation({
      actionId: "work_card.save_confirm",
      token: confirmationToken,
      input: normalizedWorkCardForHash(draft),
      userId: caller.userId,
      currentStateFingerprint: fingerprint,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        code: "confirmation_rejected",
        message: `Confirmation token rejected (${verdict.reason}). Draft again.`,
      };
    }

    // THE canonical core — the identical write the web form performs. The
    // token's field set maps 1:1 (absent = keep, the core's own rule).
    const result = await saveWorkerCardCore(caller, {
      availabilityStatus: draft.availabilityStatus,
      availableFrom: draft.availableFrom,
      salaryMin: draft.salaryMin,
      salaryMax: draft.salaryMax,
      locationCountry: draft.locationCountry,
      preferredCountries: draft.preferredCountries ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message:
          result.code === "needs_migration"
            ? "The work-card store is not enabled on this environment."
            : (result.message ?? "Work-card save failed."),
      };
    }
    return {
      ok: true,
      data: {
        status: "saved",
        savedFields: providedWorkCardFields(draft),
        structuredDestination: "/dashboard/profile",
      },
    };
  },
};

// ── the registry ───────────────────────────────────────────────────────────

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  profileGet,
  livingCvSkillsGet,
  journalList,
  journalCreateDraft,
  journalConfirm,
  interestExpressDraft,
  interestExpressConfirm,
  workCardSaveDraft,
  workCardSaveConfirm,
  contextSwitch,
];

export function listCapabilities(): readonly CapabilityDescriptor[] {
  return CAPABILITIES;
}

export function exposedCapabilities(): readonly CapabilityDescriptor[] {
  return CAPABILITIES.filter((c) => c.exposed);
}

/**
 * Validate and run one capability as `caller`. The ONLY execution path —
 * adapters translate protocol, they never reach a handler directly.
 */
export async function runCapability(
  id: string,
  caller: CapabilityCaller,
  rawInput: unknown,
): Promise<ExecResult> {
  const capability = CAPABILITIES.find((c) => c.id === id);
  if (!capability) {
    return { ok: false, code: "unknown_capability", message: `No capability "${id}".` };
  }
  const parsed = capability.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      message: parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    };
  }
  try {
    return await capability.run(caller, parsed.data);
  } catch {
    // A thrown handler is an infrastructure fact, not a caller fact.
    return { ok: false, code: "unavailable", message: "Capability failed to run." };
  }
}
