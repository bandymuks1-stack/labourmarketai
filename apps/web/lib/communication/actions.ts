"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  CONVERSATION_RATE_CAP,
  MESSAGE_RATE_CAP,
  evaluateRateCap,
  rateCapWindowStartIso,
  type RateCap,
} from "@/lib/communication/rate-caps";
import {
  normalizeConversationSourceHint,
  type ConversationSourceHint,
} from "@/lib/communication/conversation-source-model";
import {
  validateConversationAttachments,
  type ConversationAttachmentInput,
} from "@/lib/communication/attachment-model";

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
  | "update_failed"
  /** §8.1 contact-permission gate: no established relationship → no contact. */
  | "no_permission"
  /** §8.2 abuse cap: the windowed rate limit is reached — wait and retry. */
  | "rate_limited"
  /** §8.2 abuse cap: the safety count could not be read — write refused
   *  (default-closed; a failed check is never a bypass path). */
  | "rate_check_unavailable";

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

/**
 * §8.2 abuse/spam minimum — windowed count of the CALLER'S OWN recent writes
 * in one of the 0021 tables, via their RLS-scoped client (head-only count, no
 * rows read, no other user's data). Returns null when the count cannot be
 * read so the pure cap model resolves `unavailable` (default-closed).
 */
async function countRecentOwnRows(
  supabase: SupabaseClient,
  table: "conversations" | "conversation_messages",
  authorColumn: "created_by" | "author_id",
  userId: string,
  cap: RateCap,
): Promise<number | null> {
  const { count, error } = await asAny(supabase)
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(authorColumn, userId)
    .gte("created_at", rateCapWindowStartIso(cap));
  if (error) {
    // No message body / no ids in the log — table name + code only.
    console.error(`[communication] rate-cap count failed (${table}):`, error.code ?? "unknown");
    return null;
  }
  return typeof count === "number" ? count : null;
}

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

  // §8.2 abuse cap — enforced BEFORE the insert. Windowed count of the
  // caller's OWN recently created conversations (covers direct opens AND
  // support threads — every creation path goes through here). Default-closed:
  // an unreadable count refuses the write instead of bypassing the cap.
  const recentConversations = await countRecentOwnRows(
    supabase,
    "conversations",
    "created_by",
    user.id,
    CONVERSATION_RATE_CAP,
  );
  const conversationCapDecision = evaluateRateCap(
    recentConversations,
    CONVERSATION_RATE_CAP,
  );
  if (conversationCapDecision === "rate_limited") {
    return {
      ok: false,
      code: "rate_limited",
      message: `Saugumo riba: per parą galima pradėti iki ${CONVERSATION_RATE_CAP.max} pokalbių. Bandykite vėliau.`,
    };
  }
  if (conversationCapDecision !== "allowed") {
    return {
      ok: false,
      code: "rate_check_unavailable",
      message: "Saugumo patikros atlikti nepavyko, todėl pokalbis nesukurtas. Bandykite dar kartą.",
    };
  }

  // 1) Insert the conversation. created_by = auth.uid() is enforced by RLS.
  //    The optional source stamp (source_type/source_id, migration
  //    20260706210000 — DRAFT, owner-gated apply) rides the same INSERT
  //    policy; normalizeConversationSourceHint is default-closed (off-set
  //    type / non-uuid id → no stamp, never a bad row).
  const sourceHint = normalizeConversationSourceHint(input.sourceHint);
  let insertConv = await asAny(supabase)
    .from("conversations")
    .insert(
      sourceHint
        ? {
            subject,
            kind,
            created_by: user.id,
            source_type: sourceHint.type,
            source_id: sourceHint.id,
          }
        : { subject, kind, created_by: user.id },
    )
    .select("id")
    .single();
  // Honest degradation: the migration may be merged but NOT applied in
  // production yet — the columns are then absent (42703 = undefined column).
  // Fall back to the current no-source insert instead of breaking
  // conversation creation; the thread simply stays unstamped (NULL), which
  // is exactly the pre-migration behaviour.
  if (
    sourceHint &&
    (insertConv.error?.code === "42703" ||
      /source_type|source_id/.test(insertConv.error?.message ?? ""))
  ) {
    insertConv = await asAny(supabase)
      .from("conversations")
      .insert({ subject, kind, created_by: user.id })
      .select("id")
      .single();
  }
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
  const body = (input.body ?? "").trim();
  const attachments = input.attachments ?? [];
  // Text OR at least one attachment — attachment-only messages are a real
  // product case (work photos). The DB CHECK allows '' after 20260712130000.
  if (body.length < BODY_MIN && attachments.length === 0) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Žinutė tuščia — įveskite tekstą arba pridėkite priedą.",
    };
  }
  if (body.length > BODY_MAX) {
    return {
      ok: false,
      code: "invalid_input",
      message: `Žinutė per ilga (riba — ${BODY_MAX} simbolių).`,
    };
  }
  const attachmentError = validateConversationAttachments(attachments, {
    conversationId: input.conversationId,
    uploaderId: user.id,
  });
  if (attachmentError) {
    return {
      ok: false,
      code: "invalid_input",
      message:
        attachmentError === "too_many"
          ? "Per daug priedų — daugiausia 5 vienoje žinutėje."
          : attachmentError === "too_large"
            ? "Priedas per didelis (iki 10 MB)."
            : "Priedo pridėti nepavyko — nepalaikomas failas.",
    };
  }

  // §8.2 abuse cap — enforced BEFORE the insert. Windowed count of the
  // caller's OWN authored messages across all conversations. Default-closed:
  // an unreadable count refuses the send instead of bypassing the cap.
  const recentMessages = await countRecentOwnRows(
    supabase,
    "conversation_messages",
    "author_id",
    user.id,
    MESSAGE_RATE_CAP,
  );
  const messageCapDecision = evaluateRateCap(recentMessages, MESSAGE_RATE_CAP);
  if (messageCapDecision === "rate_limited") {
    return {
      ok: false,
      code: "rate_limited",
      message: `Saugumo riba: per valandą galima išsiųsti iki ${MESSAGE_RATE_CAP.max} žinučių. Palaukite ir bandykite vėliau.`,
    };
  }
  if (messageCapDecision !== "allowed") {
    return {
      ok: false,
      code: "rate_check_unavailable",
      message: "Saugumo patikros atlikti nepavyko, todėl žinutė neišsiųsta. Bandykite dar kartą.",
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
  // 11-locale set — matches the CHECK constraint widened by applied migration
  // 20260612130000 (added 'ru'). An unknown locale stamps NULL (honest
  // "language unknown"), never a guessed code.
  const KNOWN_LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
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
    // Attachment-only send against a DB where the body CHECK still requires
    // text (draft migration 20260712130000 not applied yet) — honest state,
    // with a working fallback the user can act on immediately.
    if (body.length === 0 && /body_check|check constraint/i.test(msg)) {
      return {
        ok: false,
        code: "rpc_unavailable",
        message:
          "Priedų siuntimas dar neįjungtas šioje aplinkoje — įrašykite ir tekstą.",
      };
    }
    return {
      ok: false,
      code: "insert_failed",
      message: `Žinutės išsiųsti nepavyko: ${msg || "nežinoma klaida"}`,
    };
  }

  // Register the pre-uploaded attachments against the new message via the
  // SECURITY DEFINER RPC (validates author/participant/path/MIME/size and
  // the 5-per-message cap inside Postgres). A failed registration never
  // un-sends the message — the count is reported honestly so the composer
  // can tell the user which part worked.
  let attachmentsFailed = 0;
  for (const a of attachments) {
    const { error: regError } = await asAny(supabase).rpc(
      "register_conversation_message_attachment",
      {
        p_attachment_id: a.id,
        p_message_id: result.data.id,
        p_file_name: a.fileName,
        p_mime_type: a.mimeType,
        p_file_size: a.sizeBytes,
        p_storage_path: a.storagePath,
      },
    );
    if (regError) {
      attachmentsFailed += 1;
      console.error(
        "[communication] attachment register failed:",
        regError.code ?? "unknown",
      );
    }
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
  return { ok: true, data: { id: result.data.id as string, attachmentsFailed } };
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
