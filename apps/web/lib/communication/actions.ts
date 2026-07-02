"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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
 *   - No service_role. No "delivered" / "read" flags beyond an honest
 *     per-participant `last_read_at` timestamp.
 *   - Conversation creation auto-adds the creator as a participant so the
 *     RLS SELECT works for them immediately.
 */
export type CommunicationResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; code: CommunicationErrorCode; message: string };

export type CommunicationErrorCode =
  | "not_authenticated"
  | "invalid_input"
  | "not_a_participant"
  | "conversation_not_found"
  | "rpc_unavailable"
  | "insert_failed"
  | "update_failed";

const SUBJECT_MAX = 240;
const BODY_MIN = 1;
const BODY_MAX = 10000;
const MAX_PARTICIPANTS = 20;

// The generated Supabase Database type doesn't include the v1 tables
// until `pnpm db:types` is regenerated after 0021. Cast through `any`
// for these calls — RLS still enforces row-level access at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export async function createConversation(input: {
  subject?: string | null;
  kind?: "direct" | "support" | "team";
  participantProfileIds?: string[];
  locale: string;
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

  const subject = input.subject
    ? input.subject.trim().slice(0, SUBJECT_MAX)
    : null;
  const kind = input.kind ?? "direct";
  if (!["direct", "support", "team"].includes(kind)) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Pokalbio tipas neteisingas.",
    };
  }

  // Bounded fan-out: creator-adds are RLS-permitted by design, so cap the
  // participant count to keep the surface unusable for bulk spam. Checked
  // BEFORE the conversation insert so a rejected request leaves no row.
  const requestedParticipants = (input.participantProfileIds ?? []).filter(
    (id) => id && id !== user.id,
  );
  if (requestedParticipants.length > MAX_PARTICIPANTS) {
    return {
      ok: false,
      code: "invalid_input",
      message: `Per daug dalyvių (daugiausia ${MAX_PARTICIPANTS}).`,
    };
  }

  // 1) Insert the conversation. created_by = auth.uid() is enforced by RLS.
  const insertConv = await asAny(supabase)
    .from("conversations")
    .insert({ subject, kind, created_by: user.id })
    .select("id")
    .single();
  if (insertConv.error || !insertConv.data?.id) {
    console.error("[communication] create conversation failed:", insertConv.error?.message);
    return {
      ok: false,
      code: "insert_failed",
      message: `Pokalbio sukurti nepavyko: ${insertConv.error?.message ?? "nežinoma klaida"}`,
    };
  }
  const conversationId = insertConv.data.id as string;

  // 2) Auto-add the creator as a participant. RLS allows because they're
  //    the conversation's `created_by`.
  const participantRows = [
    { conversation_id: conversationId, profile_id: user.id, added_by: user.id },
    ...requestedParticipants.map((id) => ({
      conversation_id: conversationId,
      profile_id: id,
      added_by: user.id,
    })),
  ];
  const insertPart = await asAny(supabase)
    .from("conversation_participants")
    .insert(participantRows);
  if (insertPart.error) {
    console.error("[communication] add participants failed:", insertPart.error?.message);
    // Best-effort: leave the conversation row in place. The creator can
    // still see it (via created_by RLS) and add participants by message.
    return {
      ok: false,
      code: "insert_failed",
      message: `Pokalbio dalyviai nepridėti: ${insertPart.error?.message ?? "nežinoma klaida"}`,
    };
  }

  revalidatePath(`/${input.locale}/dashboard/communication`);
  return { ok: true, data: { id: conversationId } };
}

export async function sendMessage(input: {
  conversationId: string;
  body: string;
  locale: string;
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
  const body = (input.body ?? "").trim();
  if (body.length < BODY_MIN) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Žinutė tuščia — įveskite tekstą.",
    };
  }
  if (body.length > BODY_MAX) {
    return {
      ok: false,
      code: "invalid_input",
      message: `Žinutė per ilga (riba — ${BODY_MAX} simbolių).`,
    };
  }

  // Table is `conversation_messages`, NOT `messages` — see migration
  // 0021's header for the naming rationale (legacy `public.messages`
  // chain pre-existed in prod and is left untouched).
  //
  // §2.3: stamp the author's language (their UI locale) so viewers can get
  // translation-on-read later. The column ships as a DRAFT migration
  // (20260610190000) — until the owner applies it, the insert degrades to
  // the legacy shape (42703 = undefined column) instead of failing sends.
  const KNOWN_LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"];
  const originalLanguage = KNOWN_LOCALES.includes(input.locale) ? input.locale : null;
  let result = await asAny(supabase)
    .from("conversation_messages")
    .insert({
      conversation_id: input.conversationId,
      author_id: user.id,
      body,
      original_language: originalLanguage,
    })
    .select("id")
    .single();
  if (result.error?.code === "42703" || /original_language/.test(result.error?.message ?? "")) {
    result = await asAny(supabase)
      .from("conversation_messages")
      .insert({
        conversation_id: input.conversationId,
        author_id: user.id,
        body,
      })
      .select("id")
      .single();
  }
  if (result.error || !result.data?.id) {
    console.error("[communication] send message failed:", result.error?.message);
    // RLS denial surfaces as a 42501 / "row level security" message —
    // map to a precise LT string so the UI doesn't show a generic blob.
    const msg = result.error?.message ?? "";
    if (/row level security|policy/i.test(msg)) {
      return {
        ok: false,
        code: "not_a_participant",
        message: "Negalima rašyti šiame pokalbyje — neturite prieigos.",
      };
    }
    return {
      ok: false,
      code: "insert_failed",
      message: `Žinutės išsiųsti nepavyko: ${msg || "nežinoma klaida"}`,
    };
  }

  // Bump conversation.updated_at so the thread list sorts correctly.
  // updated_at is owner-side (RLS allows the creator to update; others
  // get a no-op). We deliberately don't error out if this fails.
  await asAny(supabase)
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);

  revalidatePath(`/${input.locale}/dashboard/communication/${input.conversationId}`);
  revalidatePath(`/${input.locale}/dashboard/communication`);
  return { ok: true, data: { id: result.data.id as string } };
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
