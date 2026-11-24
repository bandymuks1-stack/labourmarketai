import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * W9 SLICE 2 — ORGANIZATION RLS HARDENING, real two-account / two-organization
 * isolation against a REAL stack with REAL sessions.
 *
 * P0 being closed: `organizations_select` was `using (true)` (0013 line 327) and
 * `authenticated` held `GRANT SELECT` (0013 line 409), so ANY logged-in session
 * could read EVERY column of EVERY organization row directly through PostgREST —
 * owner_profile_id, legal_name, vat_number, public_contact_email/phone,
 * description, trust_score — regardless of `public_profile_enabled`. This is the
 * suite that proves the row is actually gone, not merely un-selected by our own
 * queries: every probe asks for `select=*`, the way an attacker would.
 *
 * P1 being closed: `engagement_contexts_write` (0013 line 334) permitted a
 * self-write, closed today only by the absence of a DML grant. The probes below
 * attempt the escalation directly.
 *
 * Runs ONLY against the local Supabase stack (`pnpm -C apps/web e2e:local`) and
 * only once migration 20260802170000 is applied there. The service-role key
 * seeds throwaway identities; every probe runs through anon-key clients holding
 * real user sessions.
 */

const URL_ = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_STACK = !!URL_ && !!ANON && !!SERVICE;

function assertLocal(url: string): void {
  const host = new URL(url).hostname;
  const ok = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(host);
  if (!ok) {
    throw new Error(`w9-organization-rls-hardening refuses non-local stack: ${host}`);
  }
}

const PASSWORD = "w9-org-rls-password-1";

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

/** Every probe uses `select("*")` — the attacker's query, not ours. */
async function readOrgIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from("organizations").select("*");
  if (error) throw new Error(`organizations select: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

type Seeded = {
  service: SupabaseClient;
  anonClient: SupabaseClient;
  ownerAClient: SupabaseClient;
  ownerBClient: SupabaseClient;
  employeeAClient: SupabaseClient;
  strangerClient: SupabaseClient;
  ownerAId: string;
  ownerBId: string;
  employeeAId: string;
  strangerId: string;
  orgAId: string;
  orgBId: string;
  employeeAEngagementId: string;
  run: number;
};

test.describe.configure({ mode: "serial" });

test.describe("W9 slice 2 — organization RLS hardening", () => {
  test.skip(!HAS_STACK, "local Supabase stack env missing — run via `pnpm e2e:local`");

  let s: Seeded;

  test.beforeAll(async () => {
    assertLocal(URL_);
    const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const run = Date.now();

    const ownerAId = await makeUser(service, `w9s2.ownera.${run}@local.test`);
    const ownerBId = await makeUser(service, `w9s2.ownerb.${run}@local.test`);
    const employeeAId = await makeUser(service, `w9s2.employeea.${run}@local.test`);
    const strangerId = await makeUser(service, `w9s2.stranger.${run}@local.test`);

    async function makeOrg(
      ownerId: string,
      label: string,
      publicProfile: boolean,
    ): Promise<string> {
      const { data, error } = await service
        .from("organizations")
        .insert({
          organization_type: "company",
          display_name: `W9S2 ${label} ${run}`,
          legal_name: `W9S2 ${label} Legal ${run}`,
          owner_profile_id: ownerId,
          vat_number: `VAT${run}`,
          public_profile_enabled: publicProfile,
          public_slug: publicProfile ? `w9s2-${label.toLowerCase()}-${run}` : null,
          public_contact_email: `contact.${label.toLowerCase()}.${run}@local.test`,
          public_contact_phone: "+37000000000",
        })
        .select("id")
        .single();
      if (error) throw new Error(`org insert ${label}: ${error.message}`);
      return data!.id as string;
    }

    // Org A is PRIVATE (the default, and the state of all 10 production rows).
    // Org B is PUBLISHED — it must still not be readable row-wise, because the
    // public contract is the allowlisted RPC, not a table read.
    const orgAId = await makeOrg(ownerAId, "OrgA", false);
    const orgBId = await makeOrg(ownerBId, "OrgB", true);

    const { data: ec, error: ecErr } = await service
      .from("engagement_contexts")
      .insert({
        profile_id: employeeAId,
        organization_id: orgAId,
        relationship_slug: "employee",
        status: "active",
        hash_self: `w9s2-${run}-${employeeAId}-employee`,
      })
      .select("id")
      .single();
    if (ecErr) throw new Error(`engagement insert: ${ecErr.message}`);

    s = {
      service,
      anonClient: createClient(URL_, ANON, { auth: { persistSession: false } }),
      ownerAClient: await signedInClient(`w9s2.ownera.${run}@local.test`),
      ownerBClient: await signedInClient(`w9s2.ownerb.${run}@local.test`),
      employeeAClient: await signedInClient(`w9s2.employeea.${run}@local.test`),
      strangerClient: await signedInClient(`w9s2.stranger.${run}@local.test`),
      ownerAId,
      ownerBId,
      employeeAId,
      strangerId,
      orgAId,
      orgBId,
      employeeAEngagementId: ec!.id as string,
      run,
    };
  });

  test.afterAll(async () => {
    if (!s?.service) return;
    await s.service
      .from("engagement_contexts")
      .delete()
      .in("organization_id", [s.orgAId, s.orgBId]);
    await s.service.from("organizations").delete().in("id", [s.orgAId, s.orgBId]);
    for (const id of [s.ownerAId, s.ownerBId, s.employeeAId, s.strangerId]) {
      await s.service.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  // ── organizations SELECT isolation ────────────────────────────────────────

  test("an unrelated authenticated user sees NEITHER organization", async () => {
    const ids = await readOrgIds(s.strangerClient);
    expect(ids).not.toContain(s.orgAId);
    expect(ids).not.toContain(s.orgBId);
  });

  test("an owner sees their OWN organization", async () => {
    const ids = await readOrgIds(s.ownerAClient);
    expect(ids).toContain(s.orgAId);
  });

  test("an owner does NOT see another owner's organization", async () => {
    const a = await readOrgIds(s.ownerAClient);
    expect(a).not.toContain(s.orgBId);
    const b = await readOrgIds(s.ownerBClient);
    expect(b).not.toContain(s.orgAId);
  });

  test("an active member sees the organization they belong to", async () => {
    const ids = await readOrgIds(s.employeeAClient);
    expect(ids).toContain(s.orgAId);
    // Membership grants visibility of THAT org only.
    expect(ids).not.toContain(s.orgBId);
  });

  test("a PUBLISHED organization is still not readable row-wise", async () => {
    // public_profile_enabled = true must NOT become a row-level read arm: a row
    // policy cannot hide columns, so that would leak legal_name / vat_number /
    // owner_profile_id for every published org.
    const ids = await readOrgIds(s.strangerClient);
    expect(ids).not.toContain(s.orgBId);
  });

  test("no owner_profile_id / VAT / contact detail leaks to a stranger", async () => {
    const { data, error } = await s.strangerClient.from("organizations").select("*");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    const seeded = rows.filter((r) => [s.orgAId, s.orgBId].includes(r.id as string));
    expect(seeded).toHaveLength(0);
    // Belt and braces: not a single seeded VAT/contact value anywhere in the
    // stranger's result set, whatever other rows the fixture stack may hold.
    const blob = JSON.stringify(rows);
    expect(blob).not.toContain(`VAT${s.run}`);
    expect(blob).not.toContain(`W9S2 OrgA Legal ${s.run}`);
    expect(blob).not.toContain(`W9S2 OrgB Legal ${s.run}`);
    expect(blob).not.toContain(s.ownerAId);
    expect(blob).not.toContain(s.ownerBId);
  });

  test("an anon session reads no organization row at all", async () => {
    // `anon` holds no table grant, so this is a privilege error, not an empty
    // set. Either way it must never return a seeded row.
    const { data, error } = await s.anonClient.from("organizations").select("*");
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    expect(ids).not.toContain(s.orgAId);
    expect(ids).not.toContain(s.orgBId);
    if (!error) expect(ids).toHaveLength(0);
  });

  test("ending the membership removes the member's organization visibility", async () => {
    const before = await readOrgIds(s.employeeAClient);
    expect(before).toContain(s.orgAId);

    // Through the canonical W9 slice 1 path — no direct table write.
    const { data, error } = await s.ownerAClient.rpc("end_org_membership_v1", {
      p_engagement_id: s.employeeAEngagementId,
      p_reason: "w9 slice 2 visibility proof",
    });
    if (error) throw new Error(`end_org_membership_v1: ${error.message}`);
    expect((data as { outcome: string }).outcome).toBe("ended");

    const after = await readOrgIds(s.employeeAClient);
    expect(after).not.toContain(s.orgAId);
  });

  // ── the directory RPC ─────────────────────────────────────────────────────

  test("the directory finds an organization the caller is not a member of", async () => {
    const { data, error } = await s.strangerClient.rpc(
      "search_organizations_directory_v1",
      { p_term: `W9S2 OrgA ${s.run}` },
    );
    if (error) throw new Error(`directory rpc: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    expect(rows.map((r) => r.id)).toContain(s.orgAId);
  });

  test("the directory projection carries no private field", async () => {
    const { data, error } = await s.strangerClient.rpc(
      "search_organizations_directory_v1",
      { p_term: `W9S2 OrgA ${s.run}` },
    );
    if (error) throw new Error(`directory rpc: ${error.message}`);
    const row = ((data ?? []) as Record<string, unknown>[])[0];
    expect(row).toBeTruthy();
    expect(Object.keys(row).sort()).toEqual([
      "country",
      "display_name",
      "id",
      "organization_type",
    ]);
    const blob = JSON.stringify(data);
    expect(blob).not.toContain(`VAT${s.run}`);
    expect(blob).not.toContain(s.ownerAId);
    expect(blob).not.toContain("contact.orga.");
  });

  test("the directory refuses a one-character wildcard dump", async () => {
    for (const term of ["a", "%", "_", ""]) {
      const { data, error } = await s.strangerClient.rpc(
        "search_organizations_directory_v1",
        { p_term: term },
      );
      if (error) throw new Error(`directory rpc "${term}": ${error.message}`);
      expect((data ?? []) as unknown[]).toHaveLength(0);
    }
  });

  test("anon cannot execute the directory RPC", async () => {
    const { error } = await s.anonClient.rpc("search_organizations_directory_v1", {
      p_term: `W9S2 OrgA ${s.run}`,
    });
    expect(error).toBeTruthy();
  });

  // ── engagement_contexts write hardening ───────────────────────────────────

  test("a user cannot INSERT themselves a manager engagement", async () => {
    const { error } = await s.strangerClient.from("engagement_contexts").insert({
      profile_id: s.strangerId,
      organization_id: s.orgAId,
      relationship_slug: "manager",
      status: "active",
      hash_self: `w9s2-escalation-${s.run}`,
    });
    expect(error).toBeTruthy();

    // And the authority helper must still say no.
    const { data } = await s.strangerClient.rpc("manages_organization", {
      org: s.orgAId,
    });
    expect(data).toBe(false);
  });

  test("a member cannot UPDATE their own engagement to manager", async () => {
    const { error } = await s.employeeAClient
      .from("engagement_contexts")
      .update({ relationship_slug: "manager" })
      .eq("id", s.employeeAEngagementId);
    expect(error).toBeTruthy();

    const { data: row } = await s.service
      .from("engagement_contexts")
      .select("relationship_slug")
      .eq("id", s.employeeAEngagementId)
      .single();
    expect((row as { relationship_slug: string }).relationship_slug).toBe("employee");
  });

  test("a user cannot reactivate their own ended engagement", async () => {
    // The membership was ended by the visibility test above.
    const { error } = await s.employeeAClient
      .from("engagement_contexts")
      .update({ status: "active" })
      .eq("id", s.employeeAEngagementId);
    expect(error).toBeTruthy();

    const { data: row } = await s.service
      .from("engagement_contexts")
      .select("status")
      .eq("id", s.employeeAEngagementId)
      .single();
    expect((row as { status: string }).status).toBe("ended");
  });

  test("a user cannot DELETE an engagement", async () => {
    const { error } = await s.employeeAClient
      .from("engagement_contexts")
      .delete()
      .eq("id", s.employeeAEngagementId);
    expect(error).toBeTruthy();

    const { count } = await s.service
      .from("engagement_contexts")
      .select("id", { count: "exact", head: true })
      .eq("id", s.employeeAEngagementId);
    expect(count).toBe(1);
  });

  test("reading your OWN memberships still works (select was not revoked)", async () => {
    const { data, error } = await s.employeeAClient
      .from("engagement_contexts")
      .select("id, status")
      .eq("id", s.employeeAEngagementId);
    if (error) throw new Error(error.message);
    expect((data ?? []).length).toBe(1);
  });
});
