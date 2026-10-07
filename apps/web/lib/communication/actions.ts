"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  createConversationCore,
  sendMessageCore,
  type CommunicationErrorCode,
  type CommunicationResult,
} from "@/lib/communication/communication-core";
import type { ConversationSourceHint } from "@/lib/communication/conversation-source-model";
import type { ConversationAttachmentInput } from "@/lib/communication/attachment-model";

/**
 * Communication v1 server actions. Read paths live in the page components
 * (server-side RLS-scoped fetches); write paths go through tagged-result
 * actions so the UI can render precise reasons for failure.
 *
 * Privacy / safety:
 *   - All routes through the user's authenticated supabase client. RLS
 *     enforces participation; this layer adds a small precheck to give
 *     better LT/EN errors than a bare 401.
 *   - Message bodies cap at 10 000 chars server-side. Empty bodies
 *     rejected.
 *   - §8.2 abuse/spam minimum: windowed rate caps (rate-caps.ts) run BEFORE
 *     every conversation/message insert — default-closed, no bypass path.
 *   - No service_role. No "delivered" / "read" flags beyond an honest
 *     per-participant `last_read_at` timestamp.
 *   - Conversation creation auto-adds the creator as a participant so the
 *     RLS SELECT works for them immediately.
 */
export type { CommunicationErrorCode, CommunicationResult };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

/**
 * Web door: the cookie session, then THE core (`communication-core.ts`).
 *
 * BROWSER-CALLABLE, therefore deliberately UNPRIVILEGED: it never passes a
 * `ContactAuthority`, so the core refuses any `participantProfileIds` naming
 * another person and drops `sourceHint`. What it can still open is a thread
 * with only the caller in it (the support launcher). A conversation with
 * another person is opened ONLY by `getOrCreateDirectConversation` /
 * `getOrCreateDirectConversationCore`, after the §8.1 gate (audit 2026-10-06
 * F-1; pinned by lib/guards/conversation-creation-authority.test.ts).
 */
export async function createConversation(input: {
  subject?: string | null;
  kind?: "direct" | "support" | "team";
  participantProfileIds?: string[];
  locale: string;
  /**
   * Conversation source relation v1 (owner-approved): the OPTIONAL typed
   * source stamp — which sanctioned context caller opened this thread and
   * which row it came from. Passed ONLY by the four gated context callers
   * AFTER their own server-side gate held (stamping cannot mint permission);
   * the generic open action and the support launcher pass nothing.
   * Default-closed: an off-set type or non-uuid id is dropped and the thread
   * is created WITHOUT a stamp. Forward-only; existing rows stay NULL.
   */
  sourceHint?: ConversationSourceHint | null;
}): Promise<CommunicationResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }
  const result = await createConversationCore({ supabase, userId: user.id }, input);
  if (result.ok) revalidatePath(`/${input.locale}/dashboard/communication`);
  return result;
}

/** Web door: the cookie session, then THE core (`communication-core.ts`). */
export async function sendMessage(input: {
  conversationId: string;
  body: string;
  locale: string;
  /** The language the author says they WROTE in, when it differs from the UI
   *  locale (a Georgian worker reading the product in Russian still writes
   *  Georgian). Must be a communication locale; anything else falls back to
   *  the UI-locale rule below. Never a guessed code. */
  originalLanguage?: string | null;
  /** Already-uploaded attachment descriptors (blobs live in the private
   *  bucket under `<conversationId>/<uid>/…`). Registered via the
   *  SECURITY DEFINER RPC after the message insert. */
  attachments?: ConversationAttachmentInput[];
}): Promise<CommunicationResult<{ id: string; attachmentsFailed: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko. Prisijunkite iš naujo.",
    };
  }
  const result = await sendMessageCore({ supabase, userId: user.id }, input);
  if (result.ok) {
    revalidatePath(`/${input.locale}/dashboard/communication/${input.conversationId}`);
    revalidatePath(`/${input.locale}/dashboard/communication`);
  }
  return result;
}

/** Admin joins an existing support / team conversation as a participant.
 *  Uses the existing `conversation_participants_insert` policy
 *  (admin OR conversation creator) — no new RPC needed. Idempotent
 *  via primary-key collision: re-clicking Join is a silent no-op. */
export async function joinConversationAsAdmin(input: {
  conversationId: string;
  locale: string;
}): Promise<CommunicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko.",
    };
  }
  const result = await asAny(supabase)
    .from("conversation_participants")
    .insert({
      conversation_id: input.conversationId,
      profile_id: user.id,
      added_by: user.id,
    });
  if (result.error) {
    const msg = result.error?.message ?? "";
    // Idempotent: collision on the (conversation_id, profile_id) PK
    // means the admin is already a participant — treat as success.
    if (/duplicate key|conversation_participants_pkey/i.test(msg)) {
      return { ok: true };
    }
    console.error("[communication] admin join failed:", msg);
    if (/row level security|policy/i.test(msg)) {
      return {
        ok: false,
        code: "not_a_participant",
        message: "Negalima prisijungti prie šio pokalbio (RLS atmetė).",
      };
    }
    return {
      ok: false,
      code: "insert_failed",
      message: `Prisijungti prie pokalbio nepavyko: ${msg || "nežinoma klaida"}`,
    };
  }
  revalidatePath(`/${input.locale}/dashboard/admin/support`);
  revalidatePath(`/${input.locale}/dashboard/communication/${input.conversationId}`);
  return { ok: true };
}

export async function markConversationRead(input: {
  conversationId: string;
  locale: string;
}): Promise<CommunicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: "not_authenticated",
      message: "Sesija nutrūko.",
    };
  }
  const result = await asAny(supabase)
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", input.conversationId)
    .eq("profile_id", user.id);
  if (result.error) {
    console.error("[communication] mark read failed:", result.error?.message);
    return {
      ok: false,
      code: "update_failed",
      message: `Nepavyko atnaujinti perskaitymo žymos: ${result.error?.message ?? "nežinoma klaida"}`,
    };
  }
  revalidatePath(`/${input.locale}/dashboard/communication`);
  return { ok: true };
}
