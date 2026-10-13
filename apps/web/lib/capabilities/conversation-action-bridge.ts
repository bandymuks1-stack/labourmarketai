import { z } from "zod";

import {
  CONVERSATION_ACTIONS,
  type ConfirmationTier,
  type ConversationActionDescriptor,
} from "@/lib/conversation/action-registry";
import { WORKER_ACTION_SCHEMAS } from "@/lib/conversation/worker-schemas";
import { COMPANY_ACTION_SCHEMAS } from "@/lib/conversation/company-schemas";
import { ENGAGEMENT_ACTION_SCHEMAS } from "@/lib/engagements/engagement-schemas";
import type { ExecResult } from "@/lib/conversation/executor-contract";
import enMessages from "@/messages/en.json";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * THE CONVERSATION-ACTION BRIDGE — the web chat's executable actions, as
 * capabilities, through the ONE dispatcher the web chat itself uses.
 *
 * The product already has a canonical catalogue of what a person can DO by
 * talking (`lib/conversation/action-registry.ts`), each entry with a zod
 * input schema, a role gate, a confirmation tier, a state-fingerprinted
 * one-time token, and an executor that calls the canonical server action. The
 * web chat runs them through `lib/conversation/dispatch.ts`. Until now an
 * external client could reach only the subset someone had re-wired by hand as
 * a capability, because the dispatcher and the server actions behind it
 * resolve the caller from cookies.
 *
 * The bearer caller scope (`lib/api/bearer-caller-scope.ts`) removed that
 * obstacle without a second copy of anything: inside it, the dispatcher's
 * `createClient()` IS the verified bearer caller. This module therefore adds
 * NO domain logic. Every tool below calls the SAME dispatcher function the
 * web chat calls, with the SAME id, schema, role gate, workspace resolution,
 * confirmation token and executor.
 *
 * ## The confirmation tier IS the operation class
 *
 *   tier                 → tools                      → external behaviour
 *   reversible_write     → `<id>` (execute)          → runs at once, like the
 *                                                       web chat (class B)
 *   important_write      → `<id>.prepare` (draft)    → returns a one-time
 *   strong_irreversible     + `<id>.confirm` (confirm)  token; nothing written
 *                                                       until confirm (class C)
 *
 * An external client can never run an action with LESS confirmation than the
 * web chat requires: the tier is read from the registry, not declared here.
 *
 * ## What is NOT bridged
 *
 * An action that already has a dedicated capability is skipped (`ALREADY_
 * CAPABILITIES`), so a client never sees two tools for one act. Actions with
 * no executor (`deep_link`, the read-only chat cards) are not executable by
 * the dispatcher and so are not bridged — their reads are separate
 * capabilities.
 */

/**
 * Conversation actions an existing capability already performs — bridging
 * them would publish a second tool for the same act. Each entry names the
 * capability that owns it (guard-checked against the registry).
 */
export const ALREADY_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  "worker.express-interest": ["interest.express_draft", "interest.express_confirm"],
  "worker.save-work-card": ["work_card.save_draft", "work_card.save_confirm"],
  "worker.log-work": ["journal.create_draft", "journal.confirm"],
  "company.create-demand": ["demand.create_draft", "demand.create_confirm"],
  "company.close-demand": ["demand.close_draft", "demand.close_confirm"],
  "company.reopen-demand": ["demand.reopen_draft", "demand.reopen_confirm"],
  "company.create-project": ["project.create_draft", "project.create_confirm"],
  "company.assign-worker": ["assignment.create_draft", "assignment.create_confirm"],
  "company.keep-assignment": ["assignment.keep_draft", "assignment.keep_confirm"],
  "company.shortlist-candidate": ["shortlist.add_draft", "shortlist.add_confirm", "shortlist.remove_draft", "shortlist.remove_confirm"],
};

/**
 * Reviewed behaviour claims beyond the tier (MCP annotations are hints for
 * clients; the server enforces regardless).
 *
 * OVERWRITES — the action replaces a stored value (a status, a name, a
 * preference) rather than appending. Honest `destructiveHint`; repeating it
 * with the same input lands on the same state, so it is also idempotent.
 */
export const OVERWRITES: ReadonlySet<string> = new Set([
  "worker.add-document", // upsert of the document row by type
  "worker.add-language", // upsert of the language level
  "worker.save-preferences",
  "company.update-stage-status",
  "company.update-task-status",
  "company.set-readiness-item",
  "company.enable-journal-review",
  "company.rename-organization",
  "company.move-worker", // ends the previous assignment
  "engagement.end", // final: an ended engagement cannot be reopened
]);

/** Actions that send an e-mail to someone outside the product. */
export const SENDS_EMAIL: ReadonlySet<string> = new Set([
  "company.invite-worker",
  "company.invite-learner",
  "agency.invite-client",
]);

/**
 * Actions whose dispatcher token is bound to a state the write itself changes
 * (`stateFingerprint` in lib/conversation/dispatch.ts) — so a spent token is
 * refused as stale. Every OTHER bridged confirm is bound to caller, exact
 * input and workspace for the token's TTL, but a repeat within it may repeat
 * the act (the domain refuses duplicates where it can: invitations answer
 * `duplicate_pending`, a booking is one per need and worker). Their confirm
 * tools therefore do NOT claim `idempotentHint`. Guard-checked against
 * dispatch.ts.
 */
export const SINGLE_USE_FINGERPRINTED: ReadonlySet<string> = new Set([
  "worker.respond-booking",
  "worker.respond-invitation",
  "engagement.end",
  "company.rename-organization",
]);

type AnySchema = z.ZodTypeAny;

const SCHEMAS: ReadonlyMap<string, AnySchema> = new Map<string, AnySchema>([
  ...(Object.entries(WORKER_ACTION_SCHEMAS) as [string, AnySchema][]),
  ...(Object.entries(COMPANY_ACTION_SCHEMAS) as [string, AnySchema][]),
  ...(Object.entries(ENGAGEMENT_ACTION_SCHEMAS) as [string, AnySchema][]),
]);

/** Capability id for a conversation id: `company.create-task` → itself. */
export const bridgeCapabilityId = (actionId: string, step?: "prepare" | "confirm"): string =>
  step ? `${actionId}.${step}` : actionId;

/** The English label/description the web chat shows, for the tool text. */
function englishText(key: string): string | null {
  let node: unknown = enMessages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof node === "string" && node.trim().length > 0 ? node : null;
}

function roleText(a: ConversationActionDescriptor): string {
  return `Allowed for: ${a.allowedRoles.join(", ")} (re-checked against the roles the caller really holds in the active workspace).`;
}

const NEEDS_CONFIRMATION: ReadonlySet<ConfirmationTier> = new Set(["important_write", "strong_irreversible"]);

/**
 * A caller can only run the dispatcher as THEMSELVES: a bearer caller must be
 * inside the bearer caller scope (the MCP door enters it), otherwise the
 * dispatcher's `createClient()` would read cookies the client never sent and
 * answer "not signed in". Refuse honestly instead of degrading.
 */
export async function scopedCallerRefusal(caller: CapabilityCaller): Promise<ExecResult | null> {
  if (caller.transport !== "bearer") return null;
  const { currentBearerCaller } = await import("@/lib/api/bearer-caller-scope");
  const scoped = currentBearerCaller();
  if (!scoped || scoped.userId !== caller.userId) {
    return {
      ok: false,
      code: "not_supported",
      message: "This action can only run through the authorized LabourMarket.ai MCP endpoint. Nothing was changed.",
    };
  }
  return null;
}

/** Plain-language messages for the dispatcher's own refusal codes. */
const DISPATCH_MESSAGES: Readonly<Record<string, string>> = {
  auth: "The caller is not signed in. Nothing was changed.",
  not_authorized:
    "The caller does not hold a role that may do this in the workspace they are acting for. Check context_list / context_switch. Nothing was changed.",
  not_executable: "This action cannot be executed from a conversation. Nothing was changed.",
  invalid: "The input does not match the action's schema. Nothing was changed.",
  confirmation_required: "This action needs its prepare step first. Nothing was changed.",
  stale_confirmation:
    "The confirmation token was minted for a state that has since changed (or it was already used). Prepare again. Nothing was changed.",
  confirmation_invalid: "The confirmation token does not match this caller, action or input. Prepare again. Nothing was changed.",
  no_confirmation_needed: "This action runs in one step; call it without prepare.",
};

function withMessage(r: ExecResult): ExecResult {
  if (r.ok || r.message) return r;
  const message = DISPATCH_MESSAGES[r.code];
  return message ? { ...r, message } : r;
}

async function activeWorkspaceLabel(): Promise<{ id: string; name: string | null } | null> {
  try {
    const { getWorkspaceContext } = await import("@/lib/company/active-organization");
    const ws = await getWorkspaceContext();
    const active = ws.workspaces.find((w) => w.id === ws.activeWorkspaceId);
    return { id: ws.activeWorkspaceId, name: active?.name ?? null };
  } catch {
    return null;
  }
}

const SINGLE_STEP_NOTE =
  "Runs immediately (the web chat runs it without a confirmation card: a reversible write).";

/**
 * MCP requires a tool's input to be a JSON object. A web action whose input is
 * a union (e.g. `worker.respond-invitation`: invitation | roster) is taken as
 * `{ input: <the union> }` and unwrapped before the dispatcher sees it — the
 * dispatcher still validates against the action's OWN schema.
 */
function topLevel(schema: AnySchema): { schema: AnySchema; unwrap: (v: unknown) => unknown } {
  if (schema instanceof z.ZodObject) return { schema, unwrap: (v) => v };
  const wrapped = z.object({ input: schema }).strict();
  return { schema: wrapped, unwrap: (v) => (v as { input: unknown }).input };
}

function bridgeOne(action: ConversationActionDescriptor, actionSchema: AnySchema): CapabilityDescriptor[] {
  const { schema, unwrap } = topLevel(actionSchema);
  const label = englishText(action.labelKey) ?? action.id;
  const description = englishText(action.descriptionKey) ?? "";
  const overwrites = OVERWRITES.has(action.id);
  const openWorld = SENDS_EMAIL.has(action.id);
  const sameAsWeb =
    `The SAME action, validation, role gate and confirmation as the LabourMarket.ai web chat action "${action.id}" ` +
    `(web screen: ${action.advancedRoute}). Acts in the caller's ACTIVE workspace (see context_list).`;

  if (!NEEDS_CONFIRMATION.has(action.confirmation)) {
    const annotations: CapabilityAnnotations = {
      readOnlyHint: false,
      destructiveHint: overwrites,
      idempotentHint: overwrites,
      openWorldHint: openWorld,
    };
    return [
      {
        id: bridgeCapabilityId(action.id),
        kind: "execute",
        conversationActionId: action.id,
        title: label,
        description: `${label}. ${description} ${SINGLE_STEP_NOTE} ${sameAsWeb} ${roleText(action)}`.trim(),
        exposed: true,
        annotations,
        inputSchema: schema,
        run: async (caller, input): Promise<ExecResult> => {
          const refused = await scopedCallerRefusal(caller);
          if (refused) return refused;
          const { dispatchWorkerAction } = await import("@/lib/conversation/dispatch");
          const r = await dispatchWorkerAction(action.id, unwrap(input), { locale: caller.locale });
          return withMessage(r.ok ? { ok: true, data: { action: action.id, ...(r.data ?? {}) } } : r);
        },
      },
    ];
  }

  const singleUse = SINGLE_USE_FINGERPRINTED.has(action.id);
  const prepareId = bridgeCapabilityId(action.id, "prepare");
  const confirmId = bridgeCapabilityId(action.id, "confirm");
  const confirmToolName = confirmId.replace(/\./g, "_");
  const confirmInput = z
    .object({
      /** EXACTLY the `input` object the prepare step returned. */
      input: actionSchema,
      confirmationToken: z.string().min(10),
    })
    .strict();
  const strength =
    action.confirmation === "strong_irreversible"
      ? "A STRONG step (it creates or ends a real relationship, or cannot be undone)."
      : "An important step.";

  return [
    {
      id: prepareId,
      kind: "draft",
      conversationActionId: action.id,
      title: `Prepare: ${label}`,
      description:
        `${label}. ${description} ${strength} This PREPARE step validates the input, checks the caller's role in the ` +
        `active workspace and returns a one-time confirmation token bound to the current state. NOTHING is written. ` +
        `Show the person what will happen, then call ${confirmToolName} with {input, confirmationToken}. ${sameAsWeb} ${roleText(action)}`,
      exposed: true,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: schema,
      run: async (caller, input): Promise<ExecResult> => {
        const refused = await scopedCallerRefusal(caller);
        if (refused) return refused;
        const { prepareConfirmationAction } = await import("@/lib/conversation/dispatch");
        const actionInput = unwrap(input);
        const r = await prepareConfirmationAction(action.id, actionInput);
        if (!r.ok) return withMessage({ ok: false, code: r.code });
        return {
          ok: true,
          data: {
            action: action.id,
            label,
            tier: action.confirmation,
            actingIn: await activeWorkspaceLabel(),
            input: actionInput,
            confirmationToken: r.token,
            confirmWith: confirmToolName,
            note: `Nothing was written. To carry it out, call ${confirmToolName} with this exact input and token after the person agrees.`,
          },
        };
      },
    },
    {
      id: confirmId,
      kind: "confirm",
      conversationActionId: action.id,
      title: `Confirm: ${label}`,
      description:
        `Carries out "${label}" after its prepare step: verifies the confirmation token against the caller, the exact input ` +
        `and the active workspace, then runs the canonical action. ` +
        (singleUse
          ? "The token is bound to the record's CURRENT state, so once used (or once the state changes) it is refused. "
          : "Call it ONCE per prepare: repeating it within the token's lifetime may repeat the action. ") +
        sameAsWeb,
      exposed: true,
      annotations: { readOnlyHint: false, destructiveHint: overwrites, idempotentHint: singleUse, openWorldHint: openWorld },
      inputSchema: confirmInput,
      run: async (caller, raw): Promise<ExecResult> => {
        const refused = await scopedCallerRefusal(caller);
        if (refused) return refused;
        const { input, confirmationToken } = confirmInput.parse(raw);
        const { dispatchWorkerAction } = await import("@/lib/conversation/dispatch");
        const r = await dispatchWorkerAction(action.id, input, { locale: caller.locale, confirmationToken });
        return withMessage(r.ok ? { ok: true, data: { action: action.id, ...(r.data ?? {}) } } : r);
      },
    },
  ];
}

/** The bridged conversation actions, in registry order. */
export function bridgedConversationActions(): readonly ConversationActionDescriptor[] {
  return CONVERSATION_ACTIONS.filter((a) => SCHEMAS.has(a.id) && !(a.id in ALREADY_CAPABILITIES));
}

export const CONVERSATION_ACTION_BRIDGE_CAPABILITIES: readonly CapabilityDescriptor[] =
  bridgedConversationActions().flatMap((a) => bridgeOne(a, SCHEMAS.get(a.id)!));
