import "server-only";

import { z } from "zod";
import { createHash } from "node:crypto";
import { getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { createJournalEntryCore } from "@/lib/journal/journal-write-core";
import { fd } from "@/lib/conversation/executor-contract";

import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import { workerLogWorkSchema } from "@/lib/conversation/worker-schemas";
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
    const { data: profile, error } = await caller.supabase
      .from("profiles")
      .select("id, full_name, email, locale, country, onboarded, active_role")
      .eq("id", caller.userId)
      .maybeSingle();
    if (error) {
      // A failed read is "unavailable", never "you have no profile" (#1314).
      return { ok: false, code: "unavailable", message: "Profile read failed." };
    }
    if (!profile) {
      return { ok: false, code: "not_found", message: "No profile row for this account." };
    }

    const { data: worker, error: workerError } = await caller.supabase
      .from("workers")
      .select("id")
      .eq("profile_id", caller.userId)
      .maybeSingle();

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
        worker: workerError
          ? { status: "unavailable" as const }
          : worker
            ? { status: "exists" as const, workerId: worker.id }
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
    const { data: worker, error: workerError } = await caller.supabase
      .from("workers")
      .select("id")
      .eq("profile_id", caller.userId)
      .maybeSingle();
    if (workerError) {
      return { ok: false, code: "unavailable", message: "Worker read failed." };
    }
    if (!worker) {
      return {
        ok: false,
        code: "no_worker",
        message: "This account has no worker profile, so it has no Living CV skills.",
      };
    }

    // The identical read GET /api/workers/:id/skills serves, joined to the
    // catalogue slug so the rows are meaningful outside the web UI.
    const { data, error } = await caller.supabase
      .from("worker_skills")
      .select("skill_id, verified, source, verified_at, skills(slug)")
      .eq("worker_id", worker.id);
    if (error) {
      return { ok: false, code: "unavailable", message: "Skills read failed." };
    }

    return {
      ok: true,
      data: {
        workerId: worker.id,
        skills: (data ?? []).map((r) => ({
          skillId: r.skill_id,
          slug: (r.skills as { slug: string | null } | null)?.slug ?? null,
          verified: r.verified,
          source: r.source,
          verifiedAt: r.verified_at,
        })),
      },
    };
  },
};

// ── journal.create_draft / journal.confirm ─────────────────────────────────

/**
 * Domain-separated signing secret for CAPABILITY confirmation tokens. Same
 * derivation pattern as the conversation dispatcher's, different purpose
 * string — a token minted for one surface can never be replayed on the other.
 */
function capabilityTokenSecret(): string {
  const material = env.CONVERSATION_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) {
    throw new Error(
      "capability confirmation tokens cannot be signed: set CONVERSATION_TOKEN_SECRET " +
        "(or SUPABASE_SERVICE_ROLE_KEY). Refusing to sign with a hardcoded fallback.",
    );
  }
  return createHash("sha256").update(`capability-confirmation:v1:${material}`).digest("hex");
}

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
  const { data: worker, error: workerError } = await caller.supabase
    .from("workers")
    .select("id")
    .eq("profile_id", caller.userId)
    .maybeSingle();
  if (workerError) {
    return {
      ok: false,
      result: { ok: false, code: "unavailable", message: "Worker read failed." },
    };
  }
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
    const token = issueConfirmationToken(capabilityTokenSecret(), {
      actionId: "journal.confirm",
      inputHash: canonicalInputHash(normalizedDraftForHash(resolved)),
      userId: caller.userId,
      stateFingerprint: state.fingerprint,
      issuedAtMs: Date.now(),
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
    const verdict = verifyConfirmationToken(capabilityTokenSecret(), confirmationToken, {
      actionId: "journal.confirm",
      // Same null-vs-absent normalization the draft hashed — see
      // normalizedDraftForHash.
      input: normalizedDraftForHash(draft),
      userId: caller.userId,
      currentStateFingerprint: state.fingerprint,
      nowMs: Date.now(),
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

// ── the registry ───────────────────────────────────────────────────────────

const CAPABILITIES: readonly CapabilityDescriptor[] = [
  profileGet,
  livingCvSkillsGet,
  journalCreateDraft,
  journalConfirm,
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
