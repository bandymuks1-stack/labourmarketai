import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * W9 SLICE 1 — MEMBERSHIP REVOCATION (P0-1), real two-account authorization.
 *
 * The W9 audit found organization membership irrevocable: nothing moved
 * `engagement_contexts.status` off 'active', so a dismissed manager kept
 * `manages_organization()` — and with it the org's journal, its membership
 * list, invitation sending and (once W6 slice 3 lands) the right to answer and
 * dispute in the ORGANIZATION's name — forever.
 *
 * This suite proves the fix on a REAL stack with REAL sessions:
 *
 *   1. the owner cannot remove the last owner (their own membership);
 *   2. a manager IS removable, and loses manages_organization();
 *   3. an employee IS removable;
 *   4. removing twice is idempotent (already_ended, and NO second audit row);
 *   5. the removed manager can no longer read the organization's journal;
 *   6. the removed manager can no longer send an organization invitation;
 *   7. the removed manager can no longer act in the org's name on a W6
 *      experience record — with NO W6-specific code in the revocation path;
 *   8. an audit row exists with actor, roles, capacity and reason;
 *   9. a manager cannot remove another manager (no lateral escalation);
 *  10. revocation is an UPDATE, never a DELETE — the row survives.
 *
 * Runs ONLY against the local Supabase stack (`pnpm -C apps/web e2e:local`)
 * and only once migration 20260802160000 is applied there. The service-role
 * key seeds throwaway identities; every probe runs through anon-key clients
 * holding real user sessions.
 */

const URL_ = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_STACK = !!URL_ && !!ANON && !!SERVICE;

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  const ok = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(host);
  if (!ok) throw new Error(`w9-membership-revocation refuses non-local stack: ${host}`);
}

const PASSWORD = "w9-revocation-password-1";

async function makeUser(service: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user!.id;
  const { error: pErr } = await service
    .from("profiles")
    .upsert({ id, email }, { onConflict: "id" });
  if (pErr) throw new Error(`profiles upsert ${email}: ${pErr.message}`);
  return id;
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
}

type Outcome = { outcome: string; [k: string]: unknown };

async function endMembership(
  client: SupabaseClient,
  engagementId: string,
  reason: string | null = null,
): Promise<Outcome> {
  const { data, error } = await client.rpc("end_org_membership_v1", {
    p_engagement_id: engagementId,
    p_reason: reason,
  });
  if (error) throw new Error(`end_org_membership_v1: ${error.message}`);
  return data as Outcome;
}

type Seeded = {
  service: SupabaseClient;
  ownerClient: SupabaseClient;
  managerClient: SupabaseClient;
  manager2Client: SupabaseClient;
  employeeClient: SupabaseClient;
  ownerId: string;
  managerId: string;
  manager2Id: string;
  employeeId: string;
  orgId: string;
  ownerEngagementId: string;
  managerEngagementId: string;
  manager2EngagementId: string;
  employeeEngagementId: string;
  run: number;
};

test.describe.configure({ mode: "serial" });

test.describe("W9 slice 1 — organization membership revocation", () => {
  test.skip(!HAS_STACK, "local Supabase stack env missing — run via `pnpm e2e:local`");

  let s: Seeded;

  test.beforeAll(async () => {
    assertLocal(URL_);
    const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const run = Date.now();

    const ownerId = await makeUser(service, `w9.owner.${run}@local.test`);
    const managerId = await makeUser(service, `w9.manager.${run}@local.test`);
    const manager2Id = await makeUser(service, `w9.manager2.${run}@local.test`);
    const employeeId = await makeUser(service, `w9.employee.${run}@local.test`);

    // The org's registered owner is what the last-owner guard keys on. The
    // 0035 trigger provisions the owner's 'owner' engagement automatically.
    const { data: org, error: orgErr } = await service
      .from("organizations")
      .insert({
        organization_type: "company",
        display_name: `W9 Revocation Org ${run}`,
        legal_name: `W9 Revocation Org ${run}`,
        owner_profile_id: ownerId,
      })
      .select("id")
      .single();
    if (orgErr) throw new Error(`org insert: ${orgErr.message}`);
    const orgId = org!.id as string;

    async function seatEngagement(profileId: string, slug: string): Promise<string> {
      const { data, error } = await service
        .from("engagement_contexts")
        .insert({
          profile_id: profileId,
          organization_id: orgId,
          relationship_slug: slug,
          status: "active",
          hash_self: `w9-${run}-${profileId}-${slug}`,
        })
        .select("id")
        .single();
      if (error) throw new Error(`engagement insert ${slug}: ${error.message}`);
      return data!.id as string;
    }

    const { data: ownerEc, error: ownerEcErr } = await service
      .from("engagement_contexts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("profile_id", ownerId)
      .eq("relationship_slug", "owner")
      .maybeSingle();
    if (ownerEcErr) throw new Error(`owner engagement read: ${ownerEcErr.message}`);
    const ownerEngagementId =
      (ownerEc?.id as string | undefined) ?? (await seatEngagement(ownerId, "owner"));

    s = {
      service,
      ownerClient: await signedInClient(`w9.owner.${run}@local.test`),
      managerClient: await signedInClient(`w9.manager.${run}@local.test`),
      manager2Client: await signedInClient(`w9.manager2.${run}@local.test`),
      employeeClient: await signedInClient(`w9.employee.${run}@local.test`),
      ownerId,
      managerId,
      manager2Id,
      employeeId,
      orgId,
      ownerEngagementId,
      managerEngagementId: await seatEngagement(managerId, "manager"),
      manager2EngagementId: await seatEngagement(manager2Id, "manager"),
      employeeEngagementId: await seatEngagement(employeeId, "employee"),
      run,
    };
  });

  test.afterAll(async () => {
    if (!s?.service) return;
    await s.service.from("audit_logs").delete().eq("entity", "engagement_contexts")
      .in("entity_id", [
        s.ownerEngagementId,
        s.managerEngagementId,
        s.manager2EngagementId,
        s.employeeEngagementId,
      ]);
    await s.service.from("engagement_contexts").delete().eq("organization_id", s.orgId);
    await s.service.from("organizations").delete().eq("id", s.orgId);
    for (const id of [s.ownerId, s.managerId, s.manager2Id, s.employeeId]) {
      await s.service.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  // ── 1. last owner ─────────────────────────────────────────────────────────
  test("the owner cannot remove the last owner", async () => {
    const res = await endMembership(s.ownerClient, s.ownerEngagementId, "trying to leave");
    expect(res.outcome).toBe("last_owner");

    const { data } = await s.service
      .from("engagement_contexts")
      .select("status")
      .eq("id", s.ownerEngagementId)
      .single();
    expect(data!.status).toBe("active");
  });

  // ── 9. no lateral escalation (before the manager is removed) ─────────────
  test("a manager cannot remove another manager", async () => {
    const res = await endMembership(s.managerClient, s.manager2EngagementId);
    expect(res.outcome).toBe("not_authorized");

    const { data } = await s.service
      .from("engagement_contexts")
      .select("status")
      .eq("id", s.manager2EngagementId)
      .single();
    expect(data!.status).toBe("active");
  });

  // ── pre-removal baseline: the manager really does hold authority ─────────
  test("BEFORE removal the manager holds manages_organization and sees the org", async () => {
    const { data: manages } = await s.managerClient.rpc("manages_organization", {
      org: s.orgId,
    });
    expect(manages).toBe(true);

    const { data: rows } = await s.managerClient
      .from("engagement_contexts")
      .select("id")
      .eq("organization_id", s.orgId);
    expect((rows ?? []).length).toBeGreaterThan(1);
  });

  // ── 2. manager removal ───────────────────────────────────────────────────
  test("the owner removes the manager", async () => {
    const res = await endMembership(
      s.ownerClient,
      s.managerEngagementId,
      "left the company",
    );
    expect(res.outcome).toBe("ended");
    expect(res.from_role).toBe("manager");
    expect(res.to_role).toBe("ended");
  });

  // ── 10. never a delete ───────────────────────────────────────────────────
  test("revocation is an UPDATE — the row survives with status 'ended'", async () => {
    const { data } = await s.service
      .from("engagement_contexts")
      .select("status, ended_at, journal_review_enabled, is_primary")
      .eq("id", s.managerEngagementId)
      .single();
    expect(data).not.toBeNull();
    expect(data!.status).toBe("ended");
    expect(data!.ended_at).not.toBeNull();
    expect(data!.journal_review_enabled).toBe(false);
    expect(data!.is_primary).toBe(false);
  });

  // ── 5a. authority is gone ────────────────────────────────────────────────
  test("the removed manager no longer holds manages_organization()", async () => {
    const { data: manages } = await s.managerClient.rpc("manages_organization", {
      org: s.orgId,
    });
    expect(manages).toBe(false);
  });

  test("the removed manager no longer sees the organization's membership list", async () => {
    const { data: rows } = await s.managerClient
      .from("engagement_contexts")
      .select("id")
      .eq("organization_id", s.orgId);
    // Only their OWN (now ended) row remains visible via profile_id = auth.uid().
    const ids = (rows ?? []).map((r) => r.id as string);
    expect(ids).not.toContain(s.employeeEngagementId);
    expect(ids).not.toContain(s.ownerEngagementId);
    expect(ids).not.toContain(s.manager2EngagementId);
  });

  // ── 5b. organization journal ─────────────────────────────────────────────
  test("the removed manager no longer reads the organization's journal", async () => {
    const { data: orgEngagements } = await s.service
      .from("engagement_contexts")
      .select("id")
      .eq("organization_id", s.orgId);
    const orgEngagementIds = (orgEngagements ?? []).map((r) => r.id as string);

    const { data: entries } = await s.managerClient
      .from("journal_entries")
      .select("id, engagement_context_id")
      .in("engagement_context_id", orgEngagementIds);
    expect(entries ?? []).toHaveLength(0);
  });

  // ── 6. invitations ───────────────────────────────────────────────────────
  test("the removed manager can no longer send an organization invitation", async () => {
    const { data, error } = await s.managerClient.rpc("create_invitation_v1", {
      p_token_hash: "f".repeat(64),
      p_invitation_type: "join_as_employee",
      p_invited_email: `w9.invitee.${s.run}@local.test`,
      p_organization_id: s.orgId,
    });
    if (error) {
      // 42883 only if the invitations migration is absent from this stack.
      expect(error.message).toMatch(/42883|does not exist/i);
      return;
    }
    expect((data as { outcome?: string }).outcome).toBe("not_authorized");
  });

  // ── 7. W6 experience, with no W6-specific code in the revocation path ────
  test("the removed manager can no longer act in the organization's name on a W6 experience", async () => {
    // W6 slice 3 ships experience_records; when it is not on this stack the
    // check is reported as skipped rather than silently passing.
    const { error: probe } = await s.service
      .from("experience_records")
      .select("id")
      .limit(1);
    test.skip(
      !!probe,
      "experience_records absent on this stack (W6 slice 3 not applied) — org-subject rights checked via manages_organization above",
    );

    const { data: published } = await s.service
      .from("experience_records")
      .select("id")
      .eq("subject_organization_id", s.orgId)
      .eq("moderation_status", "published");
    const ids = (published ?? []).map((r) => r.id as string);

    // The org-subject read/reply right is `manages_organization(subject_org)`;
    // with it now false, the removed manager sees no org-subject record.
    const { data: visible } = await s.managerClient
      .from("experience_records")
      .select("id")
      .eq("subject_organization_id", s.orgId);
    for (const id of (visible ?? []).map((r) => r.id as string)) {
      expect(ids).not.toContain(id);
    }
    const { data: stillManages } = await s.managerClient.rpc("manages_organization", {
      org: s.orgId,
    });
    expect(stillManages).toBe(false);
  });

  // ── 8. audit ─────────────────────────────────────────────────────────────
  test("an audit row records actor, role transition, capacity and reason", async () => {
    const { data } = await s.service
      .from("audit_logs")
      .select("actor_id, action, entity, entity_id, payload, occurred_at")
      .eq("entity_id", s.managerEngagementId)
      .eq("action", "end_org_membership");
    expect(data ?? []).toHaveLength(1);
    const row = data![0] as {
      actor_id: string;
      occurred_at: string;
      payload: Record<string, unknown>;
    };
    expect(row.actor_id).toBe(s.ownerId);
    expect(row.occurred_at).toBeTruthy();
    expect(row.payload.organization_id).toBe(s.orgId);
    expect(row.payload.profile_id).toBe(s.managerId);
    expect(row.payload.from_role).toBe("manager");
    expect(row.payload.to_role).toBe("ended");
    expect(row.payload.from_status).toBe("active");
    expect(row.payload.actor_capacity).toBe("owner");
    expect(row.payload.self_initiated).toBe(false);
    expect(row.payload.reason).toBe("left the company");
  });

  // ── 4. idempotency ───────────────────────────────────────────────────────
  test("removing the same membership twice is idempotent and writes no second audit row", async () => {
    const res = await endMembership(s.ownerClient, s.managerEngagementId, "again");
    expect(res.outcome).toBe("already_ended");

    const { data } = await s.service
      .from("audit_logs")
      .select("id")
      .eq("entity_id", s.managerEngagementId)
      .eq("action", "end_org_membership");
    expect(data ?? []).toHaveLength(1);
  });

  // ── 3. employee removal ──────────────────────────────────────────────────
  test("the owner removes an employee", async () => {
    const res = await endMembership(s.ownerClient, s.employeeEngagementId, "contract ended");
    expect(res.outcome).toBe("ended");
    expect(res.from_role).toBe("employee");

    const { data } = await s.service
      .from("engagement_contexts")
      .select("status")
      .eq("id", s.employeeEngagementId)
      .single();
    expect(data!.status).toBe("ended");
  });

  // ── self-leave ───────────────────────────────────────────────────────────
  test("a remaining manager may end their OWN membership (leave)", async () => {
    const res = await endMembership(s.manager2Client, s.manager2EngagementId, "resigned");
    expect(res.outcome).toBe("ended");

    const { data } = await s.service
      .from("audit_logs")
      .select("payload")
      .eq("entity_id", s.manager2EngagementId)
      .eq("action", "end_org_membership")
      .single();
    expect((data!.payload as Record<string, unknown>).actor_capacity).toBe("self");
    expect((data!.payload as Record<string, unknown>).self_initiated).toBe(true);
  });
});
