"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getOrgMembersData } from "@/lib/operations/org-members";
import { readCounterpartIdentities } from "./contact-permission";
import { getOrCreateDirectConversation } from "./direct-conversation";
import { matchPeopleByName } from "./person-name-match";

/**
 * THE chat door into the ONE conversation system (owner P0 2026-10-01:
 * "parašyk / atidaryk pokalbį su X" must land in the same CONVERSATION →
 * PARTICIPANTS → MESSAGE → PERMISSIONS the Messages page and every other
 * entry already use).
 *
 * The chat owns NO message logic: it asks `findConversationPeople` WHO the
 * person means, and — once exactly one is chosen — `openConversationWith`
 * resolves-or-creates the 1:1 thread through `getOrCreateDirectConversation`
 * (the §8.1 gate, the §8.2 caps, the dedupe rule, the same RLS) and returns
 * the route to open. Nothing is sent; the person writes in the conversation's
 * own composer. Reading is limited to what the caller's OWN session can see:
 *
 *   - the counterparts of conversations they already take part in (names via
 *     the permission-gated `conversation_counterpart_identities` read), and
 *   - the people of the organization they act for (the roster and the members
 *     the People door already shows them).
 *
 * No directory of the platform is searched: a person who is neither a
 * counterpart nor on the caller's own team is not offered, and the answer is
 * `none` — never a guess.
 */

export type ConversationPerson =
  | { readonly kind: "conversation"; readonly label: string; readonly conversationId: string }
  | { readonly kind: "person"; readonly label: string; readonly profileId: string };

export type FindConversationPeopleResult =
  | { readonly status: "none" }
  | { readonly status: "one"; readonly person: ConversationPerson }
  | { readonly status: "many"; readonly people: readonly ConversationPerson[] };

export type OpenConversationResult =
  | { readonly ok: true; readonly conversationId: string; readonly href: string }
  | { readonly ok: false; readonly reason: "not_authenticated" | "no_permission" | "not_found" | "failed" };

/** Who the typed reference means, among people the caller may already see. */
export async function findConversationPeople(query: string): Promise<FindConversationPeopleResult> {
  const text = (query ?? "").trim().slice(0, 200);
  if (!text) return { status: "none" };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "none" };

    const candidates: { name: string; item: ConversationPerson }[] = [];

    // 1) Counterparts of the conversations the caller is already in.
    const { data: convs } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (c: string, o: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: unknown }> };
        };
      };
    })
      .from("conversations")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(100);
    const ids = ((convs ?? []) as { id: string }[]).map((c) => c.id);
    const names = await readCounterpartIdentities(ids);
    for (const [conversationId, name] of names) {
      candidates.push({ name, item: { kind: "conversation", label: name, conversationId } });
    }

    // 2) The people of the organization the caller acts for.
    const ctx = await resolveEmployerCompanyContext();
    if (ctx.kind === "ok") {
      const [workers, members] = await Promise.all([
        listActiveCompanyWorkers(ctx.companyId).catch(() => null),
        getOrgMembersData("company", ctx.companyId).catch(() => null),
      ]);
      const seen = new Set<string>();
      const add = (profileId: string | null | undefined, name: string | null | undefined) => {
        if (!profileId || profileId === user.id || seen.has(profileId)) return;
        const label = (name ?? "").trim();
        if (!label || label === "—") return;
        seen.add(profileId);
        candidates.push({ name: label, item: { kind: "person", label, profileId } });
      };
      if (workers && workers.kind === "ok") for (const w of workers.rows) add(w.profileId, w.displayName);
      if (members) for (const m of members.members) add(m.profileId, m.name);
    }

    // A person already in a conversation is one match, not two.
    const matched = matchPeopleByName(text, candidates);
    const people: ConversationPerson[] = [];
    const labels = new Set<string>();
    for (const p of matched) {
      const key = `${p.label}`.toLowerCase();
      if (p.kind === "person" && labels.has(key)) continue;
      labels.add(key);
      people.push(p);
    }
    if (people.length === 0) return { status: "none" };
    if (people.length === 1) return { status: "one", person: people[0] };
    return { status: "many", people: people.slice(0, 5) };
  } catch {
    return { status: "none" };
  }
}

/** Open (or create, when the §8.1 gate allows) the thread and return its route. */
export async function openConversationWith(input: {
  readonly locale: string;
  readonly conversationId?: string | null;
  readonly profileId?: string | null;
  readonly projectId?: string | null;
}): Promise<OpenConversationResult> {
  const locale = /^[a-z]{2}$/.test(input.locale) ? input.locale : "lt";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };

  if (input.conversationId) {
    // RLS decides: a thread the caller does not take part in is not found.
    const { data } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!data?.id) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      conversationId: data.id as string,
      href: `/${locale}/dashboard/communication/${data.id as string}`,
    };
  }
  if (!input.profileId) return { ok: false, reason: "not_found" };
  const result = await getOrCreateDirectConversation(
    input.profileId,
    locale,
    null,
    undefined,
    null,
    input.projectId ?? null,
  );
  if (!result.ok) {
    return { ok: false, reason: result.code === "no_permission" ? "no_permission" : "failed" };
  }
  return {
    ok: true,
    conversationId: result.data.id,
    href: `/${locale}/dashboard/communication/${result.data.id}`,
  };
}
