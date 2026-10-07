import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { sendMessageCore } from "@/lib/communication/communication-core";
import {
  getOrCreateDirectConversationCore,
  planDirectContact,
} from "@/lib/communication/direct-conversation-core";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * MESSAGING — the product's own conversations for an authorized assistant.
 *
 * CANONICAL CORE → MCP WRAPPER. Every write runs the SAME core the web
 * composer runs (`sendMessageCore`, `createConversationCore` via
 * `getOrCreateDirectConversationCore`): the same §8.1 contact gate, the same
 * §8.2 abuse caps, the same participant rules and RLS. There is no second
 * message system and nothing leaves the platform: a message is an in-app
 * message the recipient reads in LabourMarket.ai.
 *
 * The owner's acceptance standard (2026-09-30), applied here:
 *   AUTH → CONTEXT → PREVIEW/DRAFT → HUMAN CONFIRM → CANONICAL WRITE →
 *   READ-BACK → AUDIT RECEIPT (the receipt is written by the MCP door).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

// ── conversation.list ──────────────────────────────────────────────────────

const conversationListInput = z.object({ limit: z.number().int().min(1).max(50).optional() }).strict();

const conversationList: CapabilityDescriptor = {
  id: "conversation.list",
  kind: "read",
  title: "My conversations",
  description:
    "The caller's own in-app conversations (those they are a participant of), " +
    "newest activity first, with the other party's name when the product may " +
    "show it. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: conversationListInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { limit } = conversationListInput.parse(input);
    const { data: parts, error } = await asAny(caller.supabase)
      .from("conversation_participants")
      .select("conversation_id, revoked_at")
      .eq("profile_id", caller.userId);
    if (error) return { ok: false, code: "unavailable", message: "The conversation read failed." };
    const ids = [
      ...new Set(
        ((parts ?? []) as { conversation_id: string; revoked_at: string | null }[])
          .filter((p) => !p.revoked_at)
          .map((p) => p.conversation_id),
      ),
    ];
    if (ids.length === 0) return { ok: true, data: { conversations: [] } };
    const { data: convs, error: cErr } = await asAny(caller.supabase)
      .from("conversations")
      .select("id, subject, kind, updated_at, created_at")
      .in("id", ids)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 20);
    if (cErr) return { ok: false, code: "unavailable", message: "The conversation read failed." };
    const rows = (convs ?? []) as { id: string; subject: string | null; kind: string; updated_at: string }[];
    const { data: names } = await asAny(caller.supabase).rpc("conversation_counterpart_identities", {
      p_conversation_ids: rows.map((r) => r.id),
    });
    const nameOf = new Map(
      ((Array.isArray(names) ? names : []) as { conversation_id?: string; display_name?: string }[])
        .filter((n) => n.conversation_id && n.display_name)
        .map((n) => [n.conversation_id as string, (n.display_name as string).trim()]),
    );
    return {
      ok: true,
      data: {
        conversations: rows.map((r) => ({
          conversationId: r.id,
          subject: r.subject,
          kind: r.kind,
          withName: nameOf.get(r.id) ?? null,
          lastActivityAt: r.updated_at,
        })),
        structuredDestination: "/dashboard/communication",
      },
    };
  },
};

// ── conversation.get ───────────────────────────────────────────────────────

const conversationGetInput = z
  .object({ conversationId: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() })
  .strict();

async function readConversation(caller: CapabilityCaller, conversationId: string) {
  const { data } = await asAny(caller.supabase)
    .from("conversations")
    .select("id, subject, kind, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as { id: string; subject: string | null; kind: string; updated_at: string } | null) ?? null;
}

async function lastMessageId(caller: CapabilityCaller, conversationId: string): Promise<string> {
  const { data } = await asAny(caller.supabase)
    .from("conversation_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as { id: string } | undefined)?.id ?? "none";
}

const conversationGet: CapabilityDescriptor = {
  id: "conversation.get",
  kind: "read",
  title: "Read one of my conversations",
  description:
    "The latest messages of ONE conversation the caller participates in " +
    "(oldest first), each marked fromMe or not, with when it was written. " +
    "A conversation the caller is not part of is not found. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: conversationGetInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { conversationId, limit } = conversationGetInput.parse(input);
    const conv = await readConversation(caller, conversationId);
    if (!conv) return { ok: false, code: "not_found", message: "No such conversation for this account." };
    const { data, error } = await asAny(caller.supabase)
      .from("conversation_messages")
      .select("id, author_id, body, created_at, original_language")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 30);
    if (error) return { ok: false, code: "unavailable", message: "The message read failed." };
    const msgs = ((data ?? []) as {
      id: string;
      author_id: string;
      body: string;
      created_at: string;
      original_language: string | null;
    }[]).reverse();
    return {
      ok: true,
      data: {
        conversation: { id: conv.id, subject: conv.subject, kind: conv.kind },
        messages: msgs.map((m) => ({
          id: m.id,
          fromMe: m.author_id === caller.userId,
          body: m.body,
          language: m.original_language,
          at: m.created_at,
        })),
        structuredDestination: `/dashboard/communication/${conv.id}`,
      },
    };
  },
};

// ── message.send_draft / message.send_confirm ──────────────────────────────

const sendFields = z
  .object({
    /** An existing conversation the caller is part of … */
    conversationId: z.string().uuid().optional(),
    /** … or one person (profile id, e.g. workerProfileId from projects.list). */
    recipientProfileId: z.string().uuid().optional(),
    /** The project that makes the contact legitimate (the caller manages it
     *  and the recipient is actively assigned to it). */
    projectId: z.string().uuid().optional(),
    subject: z.string().trim().max(240).nullish(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict()
  .refine((v) => !!v.conversationId !== !!v.recipientProfileId, {
    message: "Give exactly one of conversationId or recipientProfileId.",
  });

type SendInput = z.infer<typeof sendFields>;

type SendPlan =
  | { ok: true; conversationId: string | null; permission: string; recipientName: string | null; lastId: string }
  | { ok: false; result: ExecResult };

async function planSend(caller: CapabilityCaller, input: SendInput): Promise<SendPlan> {
  if (input.conversationId) {
    const conv = await readConversation(caller, input.conversationId);
    if (!conv) return { ok: false, result: { ok: false, code: "not_found", message: "No such conversation for this account." } };
    return {
      ok: true,
      conversationId: conv.id,
      permission: "participant",
      recipientName: null,
      lastId: await lastMessageId(caller, conv.id),
    };
  }
  const plan = await planDirectContact(
    { supabase: caller.supabase, userId: caller.userId },
    input.recipientProfileId as string,
    { projectId: input.projectId ?? null },
  );
  if (plan.kind === "refused") {
    return {
      ok: false,
      result: {
        ok: false,
        code: "no_permission",
        message:
          "There is no relationship that allows starting a conversation with this person (for a project: you must manage the project and the person must be actively assigned to it).",
      },
    };
  }
  const { data: w } = await asAny(caller.supabase)
    .from("workers")
    .select("display_name")
    .eq("profile_id", input.recipientProfileId)
    .maybeSingle();
  const conversationId = plan.kind === "existing" ? plan.conversationId : null;
  return {
    ok: true,
    conversationId,
    permission: plan.permission,
    recipientName: (w?.display_name as string | null) ?? null,
    lastId: conversationId ? await lastMessageId(caller, conversationId) : "new",
  };
}

const bodyHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const tokenInput = (i: SendInput) => ({
  conversationId: i.conversationId ?? null,
  recipientProfileId: i.recipientProfileId ?? null,
  projectId: i.projectId ?? null,
  subject: i.subject ?? null,
  body: i.body,
});
const fingerprint = (p: Extract<SendPlan, { ok: true }>) => `message:${p.conversationId ?? "new"}:${p.lastId}:${p.permission}`;

const messageSendDraft: CapabilityDescriptor = {
  id: "message.send_draft",
  kind: "draft",
  title: "Draft an in-app message (nothing is sent)",
  description:
    "Prepares ONE in-app LabourMarket.ai message — to an existing conversation " +
    "of the caller, or to one person (recipientProfileId; add projectId when " +
    "the reason is a project the caller manages and the person is actively " +
    "assigned to). Checks the product's contact permission and says which " +
    "relationship allows it; names the recipient and shows the exact text. " +
    "NOTHING is sent. The person must confirm with message.send_confirm. The " +
    "message stays inside the platform (no email/SMS).",
  exposed: true,
  annotations: readOnly,
  inputSchema: sendFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = sendFields.parse(input);
    const plan = await planSend(caller, parsed);
    if (!plan.ok) return plan.result;
    const token = mintCapabilityConfirmation({
      actionId: "message.send_confirm",
      input: tokenInput(parsed),
      userId: caller.userId,
      stateFingerprint: fingerprint(plan),
    });
    return {
      ok: true,
      data: {
        preview: {
          to: parsed.conversationId ? { conversationId: parsed.conversationId } : { name: plan.recipientName, profileId: parsed.recipientProfileId },
          conversation: plan.conversationId ? "existing" : "new",
          permission: plan.permission,
          subject: parsed.subject ?? null,
          body: parsed.body,
          bodyFingerprint: bodyHash(parsed.body),
        },
        confirmationToken: token,
        note: "Nothing was sent. Show the person the exact text; only message.send_confirm with the same input and this token sends it.",
      },
    };
  },
};

const sendConfirmInput = z
  .object({
    conversationId: z.string().uuid().optional(),
    recipientProfileId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    subject: z.string().trim().max(240).nullish(),
    body: z.string().trim().min(1).max(4000),
    confirmationToken: z.string().min(10),
  })
  .strict();

const messageSendConfirm: CapabilityDescriptor = {
  id: "message.send_confirm",
  kind: "confirm",
  title: "Send the confirmed in-app message",
  description:
    "Verifies the token against the exact text and recipient and the CURRENT " +
    "conversation state (a new message in between voids it), re-checks the " +
    "contact permission, sends through the same core the web composer uses " +
    "(same limits and rules) and reads the message back, including whether " +
    "the recipient is a participant who can see it.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: sendConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...rest } = sendConfirmInput.parse(input);
    const parsed = sendFields.parse(rest);
    const plan = await planSend(caller, parsed);
    if (!plan.ok) return plan.result;
    const verdict = verifyCapabilityConfirmation({
      actionId: "message.send_confirm",
      token: confirmationToken,
      input: tokenInput(parsed),
      userId: caller.userId,
      currentStateFingerprint: fingerprint(plan),
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
    }
    const commCaller = { supabase: caller.supabase, userId: caller.userId };
    let conversationId = plan.conversationId;
    let created = false;
    if (!conversationId) {
      const opened = await getOrCreateDirectConversationCore(commCaller, parsed.recipientProfileId as string, {
        subject: parsed.subject ?? null,
        projectId: parsed.projectId ?? null,
        locale: caller.locale,
      });
      if (!opened.ok) return { ok: false, code: opened.code, message: opened.message };
      conversationId = opened.data.id;
      created = opened.data.created;
    }
    const sent = await sendMessageCore(commCaller, { conversationId, body: parsed.body, locale: caller.locale });
    if (!sent.ok) return { ok: false, code: sent.code, message: sent.message };

    // CANONICAL READ-BACK: the message row as the database holds it, and the
    // participant row that lets the recipient read it.
    const { data: msg } = await asAny(caller.supabase)
      .from("conversation_messages")
      .select("id, conversation_id, created_at, body")
      .eq("id", sent.data.id)
      .maybeSingle();
    let recipientIsParticipant: boolean | null = null;
    if (parsed.recipientProfileId) {
      const { data: part, error } = await asAny(caller.supabase)
        .from("conversation_participants")
        .select("profile_id, revoked_at")
        .eq("conversation_id", conversationId)
        .eq("profile_id", parsed.recipientProfileId)
        .maybeSingle();
      recipientIsParticipant = error ? null : !!part && !part.revoked_at;
    }
    return {
      ok: true,
      data: {
        status: "sent",
        conversationId,
        conversationCreated: created,
        permission: plan.permission,
        readBack: msg
          ? {
              id: msg.id as string,
              conversationId: msg.conversation_id as string,
              sentAt: msg.created_at as string,
              bodyMatches: (msg.body as string) === parsed.body,
              recipientIsParticipant,
            }
          : null,
        structuredDestination: `/dashboard/communication/${conversationId}`,
      },
    };
  },
};

export const MESSAGING_CAPABILITIES: readonly CapabilityDescriptor[] = [
  conversationList,
  conversationGet,
  messageSendDraft,
  messageSendConfirm,
];
