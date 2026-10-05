import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { getUnreadConversationIdsResult } from "./unread";

/**
 * ORGANIZATION SCOPE OF A CONVERSATION — derived, never stored.
 *
 * `conversations` has no organization column (and needs none): a conversation
 * is the people in it plus, sometimes, the work it is about. A conversation
 * belongs to an organization the CALLER acts for when
 *
 *   (a) another participant is ACTIVE on that organization's team (an active
 *       membership or an active engagement), or
 *   (b) it is stamped as about one of that organization's demands
 *       (`source_type` scouting | demand_interest → `customer_requests.
 *       organization_id`).
 *
 * Every read is the caller's OWN RLS read, so the database decides what is
 * visible: a manager sees the engaged people of the organizations they manage,
 * a member sees the members of theirs, and anything the database hides simply
 * does not scope (default-closed — an unscoped thread is NOT counted for the
 * organization, it is still counted for the person). One conversation can
 * belong to more than one of the caller's organizations; that is true, not a
 * defect.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface ConversationScopeFacts {
  readonly viewerId: string;
  readonly participantProfileIds: readonly string[];
  readonly sourceType: string | null;
  readonly sourceId: string | null;
}

/** PURE: does this conversation belong to the organization? */
export function conversationBelongsToOrganization(
  facts: ConversationScopeFacts,
  orgPeople: ReadonlySet<string>,
  orgDemandIds: ReadonlySet<string>,
): boolean {
  if (
    (facts.sourceType === "scouting" || facts.sourceType === "demand_interest") &&
    facts.sourceId !== null &&
    orgDemandIds.has(facts.sourceId)
  ) {
    return true;
  }
  return facts.participantProfileIds.some((id) => id !== facts.viewerId && orgPeople.has(id));
}

/**
 * Scoping outcome with the failure told apart from "does not scope". RLS HIDING
 * a row is the designed default-closed answer (an unscoped thread is not the
 * organization's); a read that ERRORED is a different fact — the scope could
 * not be established — and must never be reported as "nothing of the
 * organization's is unread".
 */
export type ConversationScopeResult =
  | { readonly status: "ok"; readonly ids: ReadonlySet<string> }
  | { readonly status: "unavailable" };

/** The caller's conversations (among `conversationIds`) that belong to the organization. */
export async function filterConversationsOfOrganization(
  supabase: SupabaseClient,
  viewerId: string,
  organizationId: string,
  conversationIds: readonly string[],
): Promise<ReadonlySet<string>> {
  // Historical shape: partial data still scopes what it can; errors are not reported.
  return (await scopeConversationsOfOrganization(supabase, viewerId, organizationId, conversationIds)).ids;
}

export async function filterConversationsOfOrganizationResult(
  supabase: SupabaseClient,
  viewerId: string,
  organizationId: string,
  conversationIds: readonly string[],
): Promise<ConversationScopeResult> {
  const scoped = await scopeConversationsOfOrganization(supabase, viewerId, organizationId, conversationIds);
  return scoped.failed ? { status: "unavailable" } : { status: "ok", ids: scoped.ids };
}

async function scopeConversationsOfOrganization(
  supabase: SupabaseClient,
  viewerId: string,
  organizationId: string,
  conversationIds: readonly string[],
): Promise<{ ids: ReadonlySet<string>; failed: boolean }> {
  const out = new Set<string>();
  if (!organizationId || conversationIds.length === 0) return { ids: out, failed: false };
  const db = asAny(supabase);
  const [mem, eng, demands, parts, convs] = await Promise.all([
    db.from("company_memberships").select("profile_id").eq("organization_id", organizationId).eq("status", "active"),
    db.from("engagement_contexts").select("profile_id").eq("organization_id", organizationId).eq("status", "active"),
    db.from("customer_requests").select("id").eq("organization_id", organizationId).limit(2000),
    db
      .from("conversation_participants")
      .select("conversation_id, profile_id")
      .in("conversation_id", [...conversationIds])
      .is("revoked_at", null),
    db.from("conversations").select("id, source_type, source_id").in("id", [...conversationIds]),
  ]);
  const failed = [mem, eng, demands, parts, convs].some((r) => Boolean((r as { error?: unknown }).error));
  const orgPeople = new Set<string>(
    [...((mem.data ?? []) as { profile_id: string | null }[]), ...((eng.data ?? []) as { profile_id: string | null }[])]
      .map((r) => r.profile_id)
      .filter((v): v is string => typeof v === "string"),
  );
  const orgDemandIds = new Set<string>(
    ((demands.data ?? []) as { id: string }[]).map((r) => r.id),
  );
  const participantsByConv = new Map<string, string[]>();
  for (const p of (parts.data ?? []) as { conversation_id: string; profile_id: string }[]) {
    const list = participantsByConv.get(p.conversation_id) ?? [];
    list.push(p.profile_id);
    participantsByConv.set(p.conversation_id, list);
  }
  const sourceByConv = new Map<string, { type: string | null; id: string | null }>();
  for (const c of (convs.data ?? []) as { id: string; source_type?: string | null; source_id?: string | null }[]) {
    sourceByConv.set(c.id, { type: c.source_type ?? null, id: c.source_id ?? null });
  }
  for (const id of conversationIds) {
    const src = sourceByConv.get(id);
    if (
      conversationBelongsToOrganization(
        {
          viewerId,
          participantProfileIds: participantsByConv.get(id) ?? [],
          sourceType: src?.type ?? null,
          sourceId: src?.id ?? null,
        },
        orgPeople,
        orgDemandIds,
      )
    ) {
      out.add(id);
    }
  }
  return { ids: out, failed };
}

/**
 * The caller's UNREAD conversations that belong to ONE organization they act
 * for — what an employer brief should count, instead of every thread the
 * person has (a person's private threads are not their company's inbox).
 * Same unread semantics as `getUnreadConversationIds` (one source, no drift).
 * TWO READERS, ONE BODY: the `…Result` reader tells a failed read from a
 * successful empty one (the company home must never render a failure as
 * "nothing unread"); the historical reader delegates and answers the empty
 * set on any failure (a badge must never crash a brief).
 */
export async function getUnreadConversationIdsForOrganizationResult(
  organizationId: string,
): Promise<ConversationScopeResult> {
  try {
    const unread = await getUnreadConversationIdsResult();
    if (unread.status !== "ok") return { status: "unavailable" };
    if (unread.ids.size === 0) return { status: "ok", ids: new Set() };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unavailable" };
    return await filterConversationsOfOrganizationResult(supabase, user.id, organizationId, [...unread.ids]);
  } catch {
    return { status: "unavailable" };
  }
}

export async function getUnreadConversationIdsForOrganization(
  organizationId: string,
): Promise<ReadonlySet<string>> {
  const result = await getUnreadConversationIdsForOrganizationResult(organizationId);
  return result.status === "ok" ? result.ids : new Set();
}
