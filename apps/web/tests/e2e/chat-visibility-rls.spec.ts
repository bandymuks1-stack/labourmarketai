import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * CHAT VISIBILITY AUDIT — hostile negative tests (doctrine §4 default-closed).
 *
 * These are the tests the platform's most sensitive promise rides on: a
 * conversation is visible ONLY to its non-revoked participants. Every test
 * here is a NEGATIVE test — it proves somebody sees NOTHING.
 *
 *   1. Same-organization colleague who is NOT a participant: list, direct-ID
 *      probe, message fetch — all empty.
 *   2. Different-organization outsider: same probes, including conversation-ID
 *      guessing — all empty.
 *   3. Object owner (customer/užsakovas): sees the conversation ONLY while an
 *      explicit, un-revoked participant (grant) row exists; loses access the
 *      moment revoked_at is set — both directions.
 *   4. anon role: zero access to all three tables (no grants at all).
 *   5. (static layer — lib/guards/chat-visibility-rls.test.ts) no service-role
 *      bypass in user-facing read paths.
 *   6. Revocation is an UPDATE (revoked_at), never a DELETE — and the revoked
 *      participant cannot un-revoke themselves.
 *
 * Runs ONLY against the local Supabase stack (pnpm -C apps/web e2e:local).
 * The service-role key is used EXCLUSIVELY to seed throwaway identities —
 * every probe runs through anon-key clients with real user sessions.
 */

const URL_ = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_STACK = !!URL_ && !!ANON && !!SERVICE;

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  const ok = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(host);
  if (!ok) throw new Error(`chat-visibility-rls refuses non-local stack: ${host}`);
}

type Seeded = {
  creator: SupabaseClient;
  partner: SupabaseClient;
  colleague: SupabaseClient;
  outsider: SupabaseClient;
  customer: SupabaseClient;
  customerId: string;
  conversationId: string;
};

const PASSWORD = "rls-audit-password-1";

async function makeUser(
  service: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user!.id;
  // Ensure a profiles row exists (id FK), regardless of trigger behaviour.
  const { error: pErr } = await service
    .from("profiles")
    .upsert({ id }, { onConflict: "id" });
  if (pErr) throw new Error(`profiles upsert ${email}: ${pErr.message}`);
  return id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

// SERIAL: the suite shares one seeded fixture (beforeAll) and the tests
// build on each other (grant → revoke → assert). Playwright's default
// fullyParallel would distribute them across workers, each re-running
// beforeAll against a fresh thread — so state set by one test would be
// invisible to the next. Serial keeps the whole story in one worker.
test.describe.configure({ mode: "serial" });

test.describe("CHAT VISIBILITY — hostile negative tests (§4 default-closed)", () => {
  test.skip(!HAS_STACK, "local Supabase stack env missing — run via `pnpm e2e:local`");

  let s: Seeded;

  test.beforeAll(async () => {
    assertLocal(URL_);
    const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const run = Date.now();
    const ids = {
      creator: await makeUser(service, `rls.creator.${run}@local.test`),
      partner: await makeUser(service, `rls.partner.${run}@local.test`),
      colleague: await makeUser(service, `rls.colleague.${run}@local.test`),
      outsider: await makeUser(service, `rls.outsider.${run}@local.test`),
      customer: await makeUser(service, `rls.customer.${run}@local.test`),
    };

    // Same-organization context for creator + colleague — proves that org
    // membership grants NOTHING on conversations (§4: no "public to org").
    const { data: org, error: orgErr } = await service
      .from("organizations")
      .insert({
        organization_type: "company",
        display_name: `RLS Audit Org ${run}`,
        legal_name: `RLS Audit Org ${run}`,
      })
      .select("id")
      .single();
    if (orgErr) throw new Error(`org insert: ${orgErr.message}`);
    for (const profile of [ids.creator, ids.colleague]) {
      const { error } = await service.from("engagement_contexts").insert({
        profile_id: profile,
        organization_id: org!.id,
        relationship_slug: "employee",
        status: "active",
        hash_self: `rls-audit-${run}-${profile}`,
      });
      if (error) throw new Error(`engagement insert: ${error.message}`);
    }

    // The conversation is created through the REAL user path (creator's own
    // session), not service-role — the test must exercise the actual RLS.
    const creator = await signedInClient(`rls.creator.${run}@local.test`);
    const { data: conv, error: convErr } = await creator
      .from("conversations")
      .insert({ subject: "RLS audit thread", kind: "direct", created_by: ids.creator })
      .select("id")
      .single();
    if (convErr) throw new Error(`conversation insert: ${convErr.message}`);
    const conversationId = conv!.id as string;

    for (const profile of [ids.creator, ids.partner]) {
      const { error } = await creator.from("conversation_participants").insert({
        conversation_id: conversationId,
        profile_id: profile,
        added_by: ids.creator,
      });
      if (error) throw new Error(`participant insert: ${error.message}`);
    }
    const { error: msgErr } = await creator.from("conversation_messages").insert({
      conversation_id: conversationId,
      author_id: ids.creator,
      body: "Sensitive content — only participants may ever read this.",
    });
    if (msgErr) throw new Error(`message insert: ${msgErr.message}`);

    s = {
      creator,
      partner: await signedInClient(`rls.partner.${run}@local.test`),
      colleague: await signedInClient(`rls.colleague.${run}@local.test`),
      outsider: await signedInClient(`rls.outsider.${run}@local.test`),
      customer: await signedInClient(`rls.customer.${run}@local.test`),
      customerId: ids.customer,
      conversationId,
    };
  });

  // ── Sanity: participants DO see the thread (the tests are not vacuous) ──
  test("participant sees the conversation and its messages", async () => {
    const conv = await s.partner
      .from("conversations")
      .select("id")
      .eq("id", s.conversationId);
    expect(conv.error).toBeNull();
    expect(conv.data).toHaveLength(1);
    const msgs = await s.partner
      .from("conversation_messages")
      .select("id, body")
      .eq("conversation_id", s.conversationId);
    expect(msgs.error).toBeNull();
    expect(msgs.data!.length).toBeGreaterThan(0);
  });

  // ── 1. Same-org colleague, NOT a participant ───────────────────────────
  test("same-organization non-participant sees nothing (list + ID probe + messages)", async () => {
    const list = await s.colleague.from("conversations").select("id");
    expect(list.error).toBeNull();
    expect(list.data!.map((r) => r.id)).not.toContain(s.conversationId);

    const probe = await s.colleague
      .from("conversations")
      .select("*")
      .eq("id", s.conversationId);
    expect(probe.error).toBeNull();
    expect(probe.data).toHaveLength(0);

    const msgs = await s.colleague
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", s.conversationId);
    expect(msgs.error).toBeNull();
    expect(msgs.data).toHaveLength(0);

    const parts = await s.colleague
      .from("conversation_participants")
      .select("*")
      .eq("conversation_id", s.conversationId);
    expect(parts.error).toBeNull();
    expect(parts.data).toHaveLength(0);

    // And cannot write into the thread either.
    const write = await s.colleague.from("conversation_messages").insert({
      conversation_id: s.conversationId,
      author_id: (await s.colleague.auth.getUser()).data.user!.id,
      body: "intrusion attempt",
    });
    expect(write.error, "non-participant INSERT must be rejected").not.toBeNull();
  });

  // ── 2. Other-org outsider, incl. ID guessing ───────────────────────────
  test("other-organization user sees nothing, even guessing conversation IDs", async () => {
    const probe = await s.outsider
      .from("conversations")
      .select("*")
      .eq("id", s.conversationId);
    expect(probe.error).toBeNull();
    expect(probe.data).toHaveLength(0);

    const msgs = await s.outsider
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", s.conversationId);
    expect(msgs.error).toBeNull();
    expect(msgs.data).toHaveLength(0);

    const parts = await s.outsider
      .from("conversation_participants")
      .select("*")
      .eq("conversation_id", s.conversationId);
    expect(parts.error).toBeNull();
    expect(parts.data).toHaveLength(0);
  });

  // ── 3. Object owner grant + revocation (both directions) ───────────────
  test("customer sees the conversation ONLY with an un-revoked grant row", async () => {
    // Before any grant: nothing.
    const before = await s.customer
      .from("conversations")
      .select("*")
      .eq("id", s.conversationId);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(0);

    // Creator grants access (explicit participant/grant row — §4.3).
    const grant = await s.creator.from("conversation_participants").insert({
      conversation_id: s.conversationId,
      profile_id: s.customerId,
      added_by: (await s.creator.auth.getUser()).data.user!.id,
    });
    expect(grant.error).toBeNull();

    // With the grant: the customer sees the thread + messages.
    const during = await s.customer
      .from("conversations")
      .select("id")
      .eq("id", s.conversationId);
    expect(during.error).toBeNull();
    expect(during.data).toHaveLength(1);
    const msgs = await s.customer
      .from("conversation_messages")
      .select("id")
      .eq("conversation_id", s.conversationId);
    expect(msgs.data!.length).toBeGreaterThan(0);

    // Creator revokes — an UPDATE setting revoked_at, never a DELETE (§4.3).
    const revoke = await s.creator.rpc("revoke_conversation_participant", {
      p_conversation_id: s.conversationId,
      p_profile_id: s.customerId,
    });
    expect(revoke.error, `revoke RPC failed: ${revoke.error?.message}`).toBeNull();

    // The moment revoked_at is set: access is gone.
    const after = await s.customer
      .from("conversations")
      .select("*")
      .eq("id", s.conversationId);
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(0);
    const msgsAfter = await s.customer
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", s.conversationId);
    expect(msgsAfter.data).toHaveLength(0);

    // The grant row STILL EXISTS (history is evidence — §3/§4): the creator
    // sees the revoked row with revoked_at set.
    const history = await s.creator
      .from("conversation_participants")
      .select("profile_id, revoked_at")
      .eq("conversation_id", s.conversationId)
      .eq("profile_id", s.customerId);
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(1);
    expect(history.data![0].revoked_at).not.toBeNull();
  });

  test("revoked participant cannot un-revoke themselves", async () => {
    // The customer's own-row UPDATE may only touch last_read_at (column-level
    // grant) — clearing revoked_at must be rejected.
    const unrevoke = await s.customer
      .from("conversation_participants")
      .update({ revoked_at: null })
      .eq("conversation_id", s.conversationId)
      .eq("profile_id", s.customerId);
    expect(unrevoke.error, "un-revoke must be rejected").not.toBeNull();

    // Still no access.
    const probe = await s.customer
      .from("conversations")
      .select("*")
      .eq("id", s.conversationId);
    expect(probe.data).toHaveLength(0);
  });

  // ── 6. Revocation is never a DELETE (§3.1 append-only / §4.3 evidence) ──
  test("participant rows cannot be DELETEd by anyone (no DELETE policy/grant)", async () => {
    // Snapshot what the creator can see BEFORE any delete attempt — the
    // invariant is "a delete attempt removes NOTHING", independent of the
    // absolute count (which depends on prior tests in this shared thread).
    const before = await s.creator
      .from("conversation_participants")
      .select("profile_id, revoked_at")
      .eq("conversation_id", s.conversationId);
    expect(before.error).toBeNull();
    const beforeCount = before.data!.length;
    // creator + partner from beforeAll, plus the customer grant row added by
    // the (serial) customer test, which stays after revocation (§4.3).
    expect(beforeCount).toBeGreaterThanOrEqual(3);
    // The revoked grant row is still present from the customer test — proof
    // that revocation kept the row (history = evidence, §4.3).
    expect(before.data!.some((r) => r.revoked_at !== null)).toBe(true);

    for (const [who, client] of [
      ["creator", s.creator],
      ["partner", s.partner],
      ["outsider", s.outsider],
    ] as const) {
      const del = await client
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", s.conversationId);
      // No DELETE grant AND no DELETE policy → the call errors or affects 0
      // rows; either way the rows must survive untouched.
      void del;
      const still = await s.creator
        .from("conversation_participants")
        .select("profile_id")
        .eq("conversation_id", s.conversationId);
      expect(
        still.data!.length,
        `${who} must not delete grant rows`,
      ).toBe(beforeCount);
    }
  });

  // ── 7. Source-context reader RPC (conversation source relation v1) ──────
  test("non-participant probing conversation_source_context gets zero rows", async () => {
    // The participant-scoped SECURITY DEFINER reader (migration
    // 20260706210000 — DRAFT, owner-gated apply) must return NOTHING to a
    // non-participant, even when they guess a real conversation id. While
    // the migration is not applied locally the RPC is absent (42883) — the
    // probe then errors with no data, which is the same zero-leak outcome
    // the app's reader degrades to (empty map).
    for (const [who, client] of [
      ["colleague", s.colleague],
      ["outsider", s.outsider],
    ] as const) {
      const probe = await client.rpc("conversation_source_context", {
        p_conversation_ids: [s.conversationId],
      });
      expect(
        (probe.data as unknown[] | null) ?? [],
        `${who} must receive zero source-context rows`,
      ).toHaveLength(0);
    }
  });

  test("anon probing conversation_source_context gets zero rows", async () => {
    // Execute is revoked from anon; and even if reached, auth.uid() is null
    // → is_conversation_participant is false for every row. Either way:
    // an error and/or zero rows — never data.
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const probe = await anon.rpc("conversation_source_context", {
      p_conversation_ids: [s.conversationId],
    });
    expect((probe.data as unknown[] | null) ?? []).toHaveLength(0);
  });

  // ── 4. anon: zero access ────────────────────────────────────────────────
  test("anon role has zero access to all three tables", async () => {
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    for (const table of [
      "conversations",
      "conversation_participants",
      "conversation_messages",
    ]) {
      const res = await anon.from(table).select("*").limit(1);
      // No grants for anon → permission denied; and never any data.
      expect(
        res.error,
        `anon SELECT on ${table} must be rejected (got data: ${JSON.stringify(res.data)})`,
      ).not.toBeNull();
      expect(res.data ?? []).toHaveLength(0);
      const ins = await anon.from(table).insert({} as never);
      expect(ins.error, `anon INSERT on ${table} must be rejected`).not.toBeNull();
    }
  });
});
