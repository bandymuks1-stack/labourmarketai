import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createConversation, type CommunicationResult } from "./actions";

/**
 * Get-or-create a 1:1 ("direct") conversation between the current user and one
 * other profile. Dedupes against existing direct conversations so a worker and
 * a company owner never accumulate duplicate threads.
 *
 * Uses ONLY the existing 0021 communication backend + its RLS:
 *   - conversation_participants_select lets a participant read the participant
 *     rows of conversations they belong to → we can find a shared conversation;
 *   - createConversation pins created_by = auth.uid() and adds the creator +
 *     the other profile as participants (RLS-allowed for the creator).
 * No new table, no new policy, no fake messages.
 */
export async function getOrCreateDirectConversation(
  otherProfileId: string,
  locale: string,
  subject?: string | null,
): Promise<CommunicationResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "not_authenticated", message: "Sesija nutrūko. Prisijunkite iš naujo." };
  }
  if (!otherProfileId || otherProfileId === user.id) {
    return { ok: false, code: "invalid_input", message: "Netinkamas gavėjas." };
  }

  // 1) Dedupe: find an existing DIRECT conversation both profiles are in.
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("profile_id", user.id);
  const myConvIds = [
    ...new Set(
      (mine ?? [])
        .map((r) => (r as { conversation_id: string | null }).conversation_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  ];
  if (myConvIds.length > 0) {
    const { data: shared } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("profile_id", otherProfileId)
      .in("conversation_id", myConvIds);
    const sharedIds = [
      ...new Set(
        (shared ?? [])
          .map((r) => (r as { conversation_id: string | null }).conversation_id)
          .filter((v): v is string => typeof v === "string"),
      ),
    ];
    if (sharedIds.length > 0) {
      const { data: direct } = await supabase
        .from("conversations")
        .select("id, created_at")
        .in("id", sharedIds)
        .eq("kind", "direct")
        .order("created_at", { ascending: true })
        .limit(1);
      const existing = (direct ?? [])[0] as { id: string } | undefined;
      if (existing?.id) return { ok: true, data: { id: existing.id } };
    }
  }

  // 2) None found — create a fresh direct conversation with both participants.
  return createConversation({
    subject: subject ?? null,
    kind: "direct",
    participantProfileIds: [otherProfileId],
    locale,
  });
}
