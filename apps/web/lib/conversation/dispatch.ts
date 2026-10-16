"use server";

import "server-only";
import { createHash } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { readActiveProfileRoles } from "@/lib/auth/profile-roles";
import { env } from "@/lib/env";
import { type Role } from "@/lib/auth/actions";
import { getConversationAction } from "@/lib/conversation/action-registry";
import {
  authorizeDispatch,
  isStaleWorkspaceContext,
  requiresConfirmation,
  workspaceBoundFingerprint,
} from "@/lib/conversation/dispatch-core";
import {
  WORKER_ACTION_SCHEMAS,
  type WorkerActionId,
} from "@/lib/conversation/worker-schemas";
import {
  COMPANY_ACTION_SCHEMAS,
  type CompanyActionId,
} from "@/lib/conversation/company-schemas";
import {
  ENGAGEMENT_ACTION_SCHEMAS,
  type EngagementActionId,
} from "@/lib/engagements/engagement-schemas";
import { WORKER_EXECUTORS, type ExecResult } from "@/lib/conversation/worker-executors";
import { COMPANY_EXECUTORS } from "@/lib/conversation/company-executors";
import { ENGAGEMENT_EXECUTORS } from "@/lib/engagements/engagement-executors";
import {
  canonicalInputHash,
  issueConfirmationToken,
  verifyConfirmationToken,
} from "@/lib/conversation/confirmation-token";
import { spendConfirmation } from "@/lib/security/confirmation-spend";
import { getWorkspaceContext, type WorkspaceContext } from "@/lib/company/active-organization";
import { workspaceOpensCompanySpace } from "@/lib/company/organization-authority";
import { resolveRenameTarget } from "@/lib/company/organization-rename";
import { interestStateFingerprint } from "@/lib/opportunities/interest";
import { journalChainFingerprint } from "@/lib/journal/journal-chain-fingerprint";
import { demandStateFingerprint } from "@/lib/demand/demand-request";
import { invitationStateFingerprint } from "@/lib/invitations/attention";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import type { ExecWorkspace } from "@/lib/conversation/executor-contract";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { roleContextForAction } from "@/lib/conversation/action-role-context";

/**
 * Server dispatcher (Phase B; employer executors added in PR-E) — the ONLY
 * path that executes a conversation action (worker.* + company.* + agency.*).
 * It enforces, in order: authentication, role (held-roles) via the pure core,
 * zod input validation, a fresh one-time confirmation token for
 * important/strong tiers, then delegates to the canonical executor and returns
 * the REAL result. It never writes the DB itself and never fabricates success.
 */

export type PrepareResult =
  | { ok: true; token: string; stateFingerprint: string }
  | { ok: false; code: string };

/**
 * HMAC key material for confirmation tokens. FAIL-CLOSED — security audit L-02.
 *
 * This used to end in an `||` fallback to a hardcoded dev literal. On a PUBLIC
 * repository that literal is known to everyone, so any environment where neither
 * secret was set signed confirmation tokens with a published constant. The
 * blast radius was bounded (a token is bound to `userId`, which is re-checked
 * against `auth.getUser()`, and the role + zod checks still ran, so it only let
 * a user skip their OWN confirmation step) — but a consent gate whose key is
 * public is not a gate, and "bounded" is not a reason to keep a published key.
 *
 * Now it throws instead. Refusing to mint a token is the safe direction: the
 * caller surfaces an error and the action does not run. Silently signing with a
 * known constant is the unsafe direction, and it looks identical to working.
 *
 * `CONVERSATION_TOKEN_SECRET` is preferred so this purpose can hold its own key
 * rather than reusing the service-role key as HMAC material (key-purpose reuse
 * — a rotation of one should not silently invalidate the other). The
 * service-role fallback keeps existing deployments working, since production
 * already sets it.
 *
 * NO `SUPABASE_DB_PASSWORD` FALLBACK — removed after CodeQL flagged it
 * (js/insufficient-password-hash, HIGH) on the first run of the scanning this
 * same audit slice enabled.
 *
 * The alert's literal claim does not hold here: this is not password storage or
 * verification, nothing derived is persisted or returned, and recovering the key
 * from HMAC outputs is infeasible — so the offline-brute-force scenario the rule
 * describes has no path. But the rule was pointing at something real in spirit.
 * The other two inputs are high-entropy machine secrets (a dedicated key, or a
 * 200+ character JWT), where one SHA-256 pass is a sound key derivation. A DB
 * password is human-chosen and may carry far less entropy, and low-entropy
 * material is exactly what single-pass hashing is wrong for. Rather than
 * suppress the alert, the password-shaped secret is simply out of the
 * key-derivation path — which is also one less purpose that credential serves.
 */
function tokenSecret(): string {
  // ONE purpose, ONE key (owner direction 2026-10-16): the broad Supabase
  // service-role key is never reused as HMAC material. Without a dedicated
  // CONVERSATION_TOKEN_SECRET the dispatcher refuses to sign — loudly, on the
  // first confirmation — instead of silently binding every pending
  // confirmation to a credential whose rotation would invalidate them all.
  const material = env.CONVERSATION_TOKEN_SECRET;
  if (!material) {
    throw new Error(
      "conversation confirmation tokens cannot be signed: CONVERSATION_TOKEN_SECRET is not set " +
        "(a dedicated random secret of at least 16 characters; the service-role key is never reused for this).",
    );
  }
  return createHash("sha256").update(`conversation-confirmation:v1:${material}`).digest("hex");
}

/**
 * The roles this dispatch may act on.
 *
 * The `worker` default is for a read that ANSWERED with no rows — a brand-new
 * account must still be able to act. It is NOT for a read that failed: an
 * unreadable role table used to be handed to `authorizeDispatch` as the worker
 * role, so a database hiccup GRANTED worker-tier conversation actions (#1314).
 * `readActiveProfileRoles` retries once and then throws, and the throw is
 * deliberately not caught here — an unknown role state grants nothing and is
 * never passed downstream disguised as an answer.
 *
 * MEMBERSHIP IS THE COMPANY GATE TOO (capability matrix P1, 2026-09-23): a
 * governance membership in the ACTIVE workspace — the same request-cached
 * resolution the executors act in — holds the `company` role for this
 * dispatch, because `membership_accept_v1` never grants `profile_roles` and
 * a manager's every employer action was refused here as `not_authorized`
 * before its executor could resolve their real role. The executor still
 * resolves the company through `requireEmployerCompany` and gates per
 * capability; RLS and the RPCs remain the backstop.
 */
async function heldRolesOf(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workspace: WorkspaceContext,
): Promise<Set<Role>> {
  const rows = await readActiveProfileRoles(() =>
    supabase
      .from("profile_roles")
      .select("role")
      .eq("profile_id", userId)
      .eq("is_active", true),
  );
  const set = new Set<Role>(rows.map((r) => r.role as Role));
  if (workspaceOpensCompanySpace(workspace)) set.add("company");
  return set.size > 0 ? set : new Set<Role>(["worker"]);
}

/** The education tables are not in the generated types yet (lib/education/programs.ts uses the same cast). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untyped(c: unknown): any {
  return c;
}

/** Opaque state fingerprint bound into a confirmation token so a card that was
 *  shown for one state can never execute against a changed state (replay /
 *  stale). Only the confirm-tier actions need one. Both callers wrap it in
 *  `workspaceBoundFingerprint`, so the token is also bound to the workspace it
 *  was minted in. */
async function stateFingerprint(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  actionId: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (actionId === "worker.respond-booking") {
    const { data } = await supabase
      .from("booking_requests")
      .select("status")
      .eq("id", String(input.bookingId))
      .maybeSingle();
    return `booking:${(data?.status as string) ?? "missing"}`;
  }
  if (actionId === "worker.respond-invitation") {
    // Owner contract §4D: THE shared fingerprint (lib/invitations/attention)
    // — the same domain read the brief and the chat list answer from. Pending
    // in the caller's own list = acceptable; anything else (accepted, expired,
    // revoked, addressed to another e-mail, unreadable) reads as absent, so a
    // token minted while pending goes stale the moment the row leaves that
    // state. The dispatcher asks the domain, it does not query.
    return invitationStateFingerprint(
      input.source === "invitation"
        ? { source: "invitation", invitationId: String(input.invitationId) }
        : { source: input.source === "agency_roster" ? "agency_roster" : "company_roster", orgId: String(input.orgId) },
    );
  }
  if (actionId === "worker.express-interest") {
    // G4 tail wagon 1: THE shared fingerprint (lib/opportunities/interest) —
    // the capability draft→confirm flow binds its tokens to the same fact,
    // so the two transports can never disagree about staleness.
    return interestStateFingerprint(
      { supabase, userId },
      String(input.requestId),
    );
  }
  if (actionId === "engagement.end") {
    /**
     * §7.1 — the engagement's OWN status is the fingerprint, and that is what
     * makes the confirmation single-use rather than merely fresh.
     *
     * A token minted while the row was `active` carries `engagement:active`.
     * The moment the end succeeds the row becomes `ended`, so re-submitting
     * that same token re-derives `engagement:ended`, the fingerprints
     * disagree, and `verifyConfirmationToken` answers `stale_state` — which
     * the dispatcher surfaces as `stale_confirmation`. A replay therefore
     * cannot reach the RPC at all: it is refused one layer above it. (The RPC
     * is idempotent regardless — it would answer `already_ended` — but a
     * confirmation that can be spent twice is a broken consent gate even when
     * the second spend happens to be harmless.)
     *
     * The read is RLS-scoped like every other one here, so a row the caller
     * may not see yields `engagement:missing` — the same value an absent row
     * gives. That preserves the migration's anti-oracle choice: nothing about
     * whether the row exists leaks through the token step, and such a call is
     * answered `not_found` by the RPC anyway.
     */
    const { data } = await supabase
      .from("company_worker_engagements")
      .select("status")
      .eq("id", String(input.engagementId))
      .maybeSingle();
    return `engagement:${(data?.status as string) ?? "missing"}`;
  }
  if (actionId === "company.rename-organization") {
    /**
     * An IDENTITY write is bound to the organization it was confirmed FOR, and
     * to the name it had then (owner program 2026-09-23; adversarial review of
     * #1848). The rename's input is the name only — the organization is
     * resolved server-side — so the fingerprint is taken from THE SAME
     * resolver the write uses (`resolveRenameTarget`: the employer context
     * with the caller's real identity), never from a second workspace read
     * that could resolve differently when no pointer is stored.
     *
     *  · organization id — a token minted while A was the target cannot rename
     *    B after a switch in another tab (`stale_confirmation`);
     *  · the CURRENT stored name — the moment a rename succeeds the name
     *    changes, so re-submitting the same token re-derives a different
     *    fingerprint and is refused one layer above the writer. That makes the
     *    confirmation SINGLE-USE (as `engagement.end` is), and a replay within
     *    the TTL can never revert a concurrent rename by someone else.
     *
     * The name is digested, not embedded: the fingerprint travels inside the
     * token, and a 200-character name has no business there. A refused target
     * fingerprints as its refusal — the executor refuses it again anyway.
     */
    const target = await resolveRenameTarget();
    if (target.kind === "refused") return `rename:refused:${target.reason}`;
    const nameDigest =
      target.currentName === null
        ? "unnamed"
        : createHash("sha256").update(`org-name:v1:${target.currentName}`).digest("hex").slice(0, 32);
    return `rename:${target.organizationId}:${nameDigest}`;
  }
  if (actionId === "worker.log-work") {
    /**
     * EXACTLY ONE RECORD PER CONFIRMATION (owner P0 2026-09-23). This used to
     * fall through to "n/a", so a `worker.log-work` token was spendable again
     * and again for its whole TTL — only the form's disabled button stood
     * between a double-tap or a retried request and a second journal entry.
     *
     * THE shared fingerprint (lib/journal/journal-chain-fingerprint): the
     * caller's journal CHAIN HEAD, the same fact the MCP `journal.confirm`
     * binds to. A save appends an entry and moves the head, so re-submitting
     * the same token re-derives a different fingerprint and is answered
     * `stale_confirmation` before the executor runs — the engagement.end
     * precedent above. Two forms confirmed back-to-back: the second is stale
     * and simply prepares again.
     *
     * A failed read yields a fixed `journal-head:<code>` rather than a head.
     * The replay guard therefore holds between two reads that succeed; a
     * read failing at both ends degrades to the previous behaviour (the
     * form's disabled button) — never to a fabricated success.
     */
    const head = await journalChainFingerprint({ supabase, userId });
    if (head.ok) return head.fingerprint;
    return `journal-head:${head.result.ok ? "unavailable" : head.result.code}`;
  }
  if (actionId === "company.create-demand") {
    /**
     * ONE NEED PER CONFIRMATION (memory/action lifecycle, 2026-10-11). Demand
     * creation is NOT idempotent and fell through to "n/a", so a token stayed
     * spendable for its whole TTL — a double-tap or a retried request created
     * a second need. THE shared fingerprint (`demandStateFingerprint`, the one
     * the MCP capability path already binds to): the caller's newest own
     * request. A submit adds a row, so a replay is `stale_confirmation`.
     */
    return demandStateFingerprint({ supabase, userId });
  }
  if (actionId === "company.create-project") {
    /** Same rule for projects: the newest project the caller can see (RLS),
     *  which a successful create replaces. Unreadable → a fixed marker (the
     *  previous behaviour), never a fabricated success. */
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "project:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "project:none" : `project:latest:${rows[0].id}`;
  }
  if (actionId === "company.create-programme") {
    /** Same rule for programmes (no unique key — a replay inserted a second
     *  row within the TTL): the newest programme the caller can see (RLS). */
    const { data, error } = await untyped(supabase)
      .from("education_programs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "programme:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "programme:none" : `programme:latest:${rows[0].id}`;
  }
  if (actionId === "company.create-cohort") {
    /** And for cohorts: the newest cohort of the programme it is created in. */
    const { data, error } = await untyped(supabase)
      .from("education_cohorts")
      .select("id")
      .eq("program_id", String(input.programId))
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "cohort:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "cohort:none" : `cohort:latest:${rows[0].id}`;
  }
  if (actionId === "company.request-readiness") {
    /** ONE MESSAGE PER CONFIRMATION. The instruction insert is unconditional,
     *  so a replayed token sent the person the same request again. Bound to
     *  the caller's newest instruction (own messages are readable to their
     *  author): a send adds one, so a replay is `stale_confirmation`. */
    const { data, error } = await supabase
      .from("conversation_messages")
      .select("id")
      .eq("author_id", userId)
      .eq("is_instruction", true)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "instruction:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "instruction:none" : `instruction:latest:${rows[0].id}`;
  }
  if (actionId === "company.propose-booking") {
    /** ONE PROPOSAL PER CONFIRMATION, and never over the worker's answer. The
     *  write upserts the (need, worker) booking, so a replay used to append a
     *  second `proposed` event — and, after the worker declined within the
     *  TTL, set the booking back to `proposed`. Bound to that booking's row
     *  state: proposing or answering moves it, so a replay is stale. */
    const { data, error } = await supabase
      .from("booking_requests")
      .select("id, status, updated_at")
      .eq("request_id", String(input.requestId))
      .eq("worker_id", String(input.workerId))
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "booking-pair:unreadable";
    const rows = (data ?? []) as { id: string; status: string; updated_at: string }[];
    return rows.length === 0 ? "booking-pair:none" : `booking-pair:${rows[0].id}:${rows[0].status}:${rows[0].updated_at}`;
  }
  if (actionId === "agency.propose-candidate") {
    /** Same rule for an agency's offer: after the client decided within the
     *  TTL, a replay opened a NEW offer. Bound to the newest offer of this
     *  (share, worker). */
    const { data, error } = await untyped(supabase)
      .from("agency_candidate_offers")
      .select("id, status")
      .eq("request_share_id", String(input.shareId))
      .eq("worker_id", String(input.workerId))
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "offer-pair:unreadable";
    const rows = (data ?? []) as { id: string; status: string }[];
    return rows.length === 0 ? "offer-pair:none" : `offer-pair:${rows[0].id}:${rows[0].status}`;
  }
  if (actionId === "company.confirm-work") {
    /** ONE CONFIRMATION ROW PER CONFIRMATION. The append-only
     *  `journal_entry_confirmations` has no unique key, so a replay wrote a
     *  second row (and a second audit row). Bound to the entry's newest
     *  confirmation: confirming adds one. */
    const { data, error } = await supabase
      .from("journal_entry_confirmations")
      .select("id")
      .eq("entry_id", String(input.entryId))
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return "entry-confirmation:unreadable";
    const rows = (data ?? []) as { id: string }[];
    return rows.length === 0 ? "entry-confirmation:none" : `entry-confirmation:latest:${rows[0].id}`;
  }
  return "n/a";
}

type ExecutableActionId = WorkerActionId | CompanyActionId | EngagementActionId;

/** The one executor call signature the dispatcher needs: every concrete
 *  executor narrows its `input` from the id-matched schema, so the safe common
 *  signature takes the bottom type — the dispatcher may only pass data that
 *  came out of the SAME id's schema (enforced by the Map lookups below). */
type AnyExecutor = (
  input: never,
  ctx: { locale: string; workspace?: ExecWorkspace },
) => Promise<ExecResult>;

/** The dispatcher only needs the validate seam of a schema. */
type AnyActionSchema = {
  safeParse(input: unknown): { success: true; data: unknown } | { success: false };
};

/**
 * Module-scope Maps keyed by action id (CodeQL
 * js/unvalidated-dynamic-method-call): a user-controlled `actionId` never
 * bracket-indexes an object — `Map.get` can only ever return a value that was
 * explicitly registered from the frozen WORKER_/COMPANY_ records at module
 * load. No prototype chain, no inherited member, no unexpected callable.
 * Unknown ids resolve to `undefined` → the dispatcher answers
 * `not_executable`.
 */
const SCHEMA_MAP: ReadonlyMap<string, AnyActionSchema> = new Map<string, AnyActionSchema>([
  ...Object.entries(WORKER_ACTION_SCHEMAS),
  ...Object.entries(COMPANY_ACTION_SCHEMAS),
  // §7.1 — the relationship map. A THIRD source, not an entry bolted onto one
  // of the two side maps: `engagement.end` is held by the employer AND the
  // worker, so filing it under either side would make that side's module the
  // home of a decision it does not own.
  ...Object.entries(ENGAGEMENT_ACTION_SCHEMAS),
]);

const EXECUTOR_MAP: ReadonlyMap<string, AnyExecutor> = new Map<string, AnyExecutor>([
  ...Object.entries(WORKER_EXECUTORS),
  ...Object.entries(COMPANY_EXECUTORS),
  ...Object.entries(ENGAGEMENT_EXECUTORS),
]);

/** An action is executable iff it carries a registered schema + executor pair
 *  (worker OR employer side). Everything else stays deep-link-only and is
 *  rejected by dispatch-core as `not_executable`. */
function isExecutable(actionId: string): actionId is ExecutableActionId {
  return SCHEMA_MAP.has(actionId) && EXECUTOR_MAP.has(actionId);
}

function schemaOf(actionId: string): AnyActionSchema | undefined {
  return SCHEMA_MAP.get(actionId);
}

function executorOf(actionId: string): AnyExecutor | undefined {
  return EXECUTOR_MAP.get(actionId);
}

/** Mint a confirmation token for an important/strong worker action, after
 *  re-checking auth + role + input shape and capturing current state. */
export async function prepareConfirmationAction(
  actionId: string,
  input: unknown,
): Promise<PrepareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const descriptor = getConversationAction(actionId);
  // The token is bound to the workspace it is minted in — resolved here, by
  // the same resolver the chip renders, never taken from the client. It is
  // also the membership arm of the role gate below.
  const ws = await getWorkspaceContext();
  const held = await heldRolesOf(supabase, user.id, ws);
  const authz = authorizeDispatch({ descriptor, heldRoles: held, executable: isExecutable(actionId) });
  if (!authz.ok) return { ok: false, code: authz.code };
  if (!descriptor || !requiresConfirmation(descriptor.confirmation)) {
    return { ok: false, code: "no_confirmation_needed" };
  }

  const schema = schemaOf(actionId);
  if (!schema) return { ok: false, code: "not_executable" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const fp = workspaceBoundFingerprint(
    ws.activeWorkspaceId,
    await stateFingerprint(supabase, user.id, actionId, parsed.data as Record<string, unknown>),
  );
  const token = issueConfirmationToken(tokenSecret(), {
    actionId,
    inputHash: canonicalInputHash(parsed.data),
    userId: user.id,
    stateFingerprint: fp,
    issuedAtMs: Date.now(),
  });
  return { ok: true, token, stateFingerprint: fp };
}

/** Execute a conversation action end-to-end (worker.* + company.* + agency.*).
 *  The name predates the employer executors (PR-E) and is kept because the
 *  existing client flows import it; it has always been the ONE dispatcher. */
export async function dispatchWorkerAction(
  actionId: string,
  input: unknown,
  opts?: {
    locale?: string;
    confirmationToken?: string;
    /** The workspace the client DISPLAYED when the person acted. Compared
     *  with the server-resolved one; a mismatch answers `stale_context`.
     *  Never authority — see `isStaleWorkspaceContext`. */
    expectedWorkspaceId?: string;
  },
): Promise<ExecResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const descriptor = getConversationAction(actionId);
  // THE ACTIVE WORKSPACE, resolved server-side by the ONE resolver the chip
  // renders (request-cached, identity read from the session — never a forced
  // "company"/"person" argument, which used to let this request hold a second
  // active workspace). Read FIRST: it is the membership arm of the role gate
  // (a manager of the active organization holds `company` for this dispatch)
  // and, below, the stale-context check.
  const ws = await getWorkspaceContext();
  const held = await heldRolesOf(supabase, user.id, ws);
  const authz = authorizeDispatch({ descriptor, heldRoles: held, executable: isExecutable(actionId) });
  if (!authz.ok) return { ok: false, code: authz.code };
  // descriptor is defined here (authz.ok implies it).
  const desc = descriptor!;

  const schema = schemaOf(actionId);
  if (!schema) return { ok: false, code: "not_executable" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  // A screen that displayed another workspace is refused before anything
  // runs: the write would land in an organization the person is not looking
  // at.
  if (isStaleWorkspaceContext(opts?.expectedWorkspaceId, ws.activeWorkspaceId)) {
    return { ok: false, code: "stale_context" };
  }

  if (requiresConfirmation(desc.confirmation)) {
    const token = opts?.confirmationToken;
    if (!token) return { ok: false, code: "confirmation_required" };
    const currentFp = workspaceBoundFingerprint(
      ws.activeWorkspaceId,
      await stateFingerprint(supabase, user.id, actionId, parsed.data as Record<string, unknown>),
    );
    const verdict = verifyConfirmationToken(tokenSecret(), token, {
      actionId,
      input: parsed.data,
      userId: user.id,
      currentStateFingerprint: currentFp,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      return { ok: false, code: verdict.reason === "stale_state" ? "stale_confirmation" : "confirmation_invalid" };
    }
    // SINGLE USE, atomically (decision 0024): a genuine token is spent before
    // the executor runs, so a retried or concurrent second submission of the
    // same token is refused as stale and never reaches the write.
    const spend = await spendConfirmation(supabase, token, actionId);
    if (spend === "already_spent") return { ok: false, code: "stale_confirmation" };
    if (spend === "error") return { ok: false, code: "error" };
  }

  const executor = executorOf(actionId);
  // typeof check (not just truthiness): the exact sanitizer CodeQL's
  // js/unvalidated-dynamic-method-call recognizes for a callee resolved
  // by a caller-supplied key - the call target is provably a function.
  if (typeof executor !== "function") return { ok: false, code: "not_executable" };

  // Rebuild W4: every executor receives the ACTIVE WORKSPACE resolved above
  // (never client-supplied). It used to be a SECOND read here with a forced
  // identity — "company" for employer actions, "person" otherwise — which,
  // with no stored pointer and one organization, could name a different
  // workspace than the chip in the same request; and no executor ever read
  // it (employer executors resolve their company through
  // `requireEmployerCompany`, which reads the same resolution). It is now the
  // same answer everything else in this request got.
  //
  // §7.1: `engagement.*` takes no workspace at all — the RPC re-derives
  // authority from the row, so a workspace handed to it is inert.
  const workspace: ExecWorkspace = {
    organizationId:
      ws.activeWorkspaceId === PERSONAL_WORKSPACE_ID ? null : ws.activeWorkspaceId,
  };

  // `parsed.data` came out of the SAME id's schema (schemaOf/executorOf share
  // the own-property key check), so this is the id-matched input by
  // construction; `never` is the safe common parameter type, not a cast away
  // from validation.
  // Chat-first execution funnel (2026-09-04): the attempt and the persisted
  // result are recorded HERE, in the one dispatcher every conversation write
  // passes through — so a surface cannot claim an action it never dispatched
  // and a dispatched action cannot go uncounted. Bounded: action id + coarse
  // role; fire-and-forget; never on the result path.
  emitServerFunnelEvent(FUNNEL_EVENTS.chatActionAttempted, {
    source: "conversation-dispatch",
    metadata: { surface: "conversation", step: actionId.slice(0, 64), role_context: roleContextForAction(actionId) },
  });
  const result = await executor(parsed.data as never, { locale: opts?.locale ?? "lt", workspace });
  if (result.ok) {
    emitServerFunnelEvent(FUNNEL_EVENTS.chatActionPersisted, {
      source: "conversation-dispatch",
      metadata: { surface: "conversation", step: actionId.slice(0, 64), role_context: roleContextForAction(actionId) },
    });
  }
  return result;
}
