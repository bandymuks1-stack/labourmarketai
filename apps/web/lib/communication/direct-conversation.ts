import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createConversation, type CommunicationResult } from "./actions";
import { resolveContactPermission } from "./contact-permission";
import {
  isContactPermitted,
  type ContactPermissionState,
} from "./communication-eligibility";

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
 *
 * §8.1 contact-permission gate (default-closed): creating a NEW direct
 * conversation requires an explicit ContactPermissionState. A dedupe hit IS
 * the `allowed_existing_conversation` state (the thread was opened through a
 * gated path before). Otherwise the caller either passes an already-verified
 * grant (`allowed_scouting_shortlist` from the Step 4A action) or this
 * function resolves the generic states (engagement / admin) server-side.
 * `no_permission` → tagged failure; nothing is created, nothing is sent.
 */
export async function getOrCreateDirectConversation(
  otherProfileId: string,
  locale: string,
  subject?: string | null,
  grantedPermission?: ContactPermissionState,
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
      // allowed_existing_conversation — reopening a shared thread is always
      // permitted; the conversation was opened through a gated path before.
      if (existing?.id) return { ok: true, data: { id: existing.id } };
    }
  }

  // 2) §8.1 gate — a NEW direct conversation needs an explicit permission
  //    state. Trust only an allowed_* grant from a caller that verified its
  //    own facts server-side (Step 4A scouting); otherwise resolve the
  //    generic states here. Default-closed.
  const permission = isContactPermitted(grantedPermission)
    ? (grantedPermission as ContactPermissionState)
    : await resolveContactPermission(otherProfileId);
  if (!isContactPermitted(permission)) {
    return {
      ok: false,
      code: "no_permission",
      message: "Nėra ryšio, leidžiančio pradėti pokalbį su šiuo asmeniu.",
    };
  }

  // 3) Permitted — create a fresh direct conversation with both participants.
  return createConversation({
    subject: subject ?? null,
    kind: "direct",
    participantProfileIds: [otherProfileId],
    locale,
  });
}
