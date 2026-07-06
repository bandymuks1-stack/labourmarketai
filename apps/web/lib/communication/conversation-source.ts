import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  isConversationSourceType,
  resolveSourceRoute,
  type ConversationSourceContext,
} from "./conversation-source-model";

/**
 * Safe conversation source-context reader (owner-approved conversation
 * source relation v1 — review pack §4).
 *
 * Calls ONE gated SECURITY DEFINER read RPC (conversation_source_context,
 * migration 20260706210000 — DRAFT, owner-gated apply) that returns, for the
 * conversations the CALLER actually participates in, ONLY:
 *   - source_type (closed set),
 *   - a display title resolved LIVE from the source row,
 *   - a route-hint token (mapped here through the closed route map).
 *
 * RAW source_id is never returned by the RPC and never forwarded by this
 * reader. Until the owner applies the migration the RPC is absent (42883 —
 * undefined function) and this reader degrades to an EMPTY MAP, exactly like
 * readCounterpartIdentities: the UI keeps today's honest neutral label. Any
 * other error also degrades to the empty map — no fabricated context, ever.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export async function readConversationSourceContexts(
  conversationIds: readonly string[],
): Promise<ReadonlyMap<string, ConversationSourceContext>> {
  const out = new Map<string, ConversationSourceContext>();
  const ids = [...new Set(conversationIds.filter((id) => !!id))];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(
    "conversation_source_context",
    { p_conversation_ids: ids },
  );
  // Honest degradation: absent RPC (42883, migration merged but not applied)
  // or any read failure → empty map → the UI renders exactly today's state.
  if (error || !Array.isArray(data)) return out;
  for (const row of data as Array<{
    conversation_id?: string | null;
    source_type?: string | null;
    source_title?: string | null;
    source_route_hint?: string | null;
  }>) {
    const id =
      typeof row?.conversation_id === "string" ? row.conversation_id : null;
    const title =
      typeof row?.source_title === "string" ? row.source_title.trim() : "";
    // Only a real, closed-set type with a non-empty live title is mapped —
    // nothing is fabricated, and no raw source id exists to forward.
    if (id && title && isConversationSourceType(row?.source_type)) {
      out.set(id, {
        sourceType: row.source_type,
        title,
        href: resolveSourceRoute(row?.source_route_hint),
      });
    }
  }
  return out;
}
