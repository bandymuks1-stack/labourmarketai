import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  onboard,
  setUpCompany,
  signUp,
  sql,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * Owner request 2026-11-23: a time-boxed READ-ONLY grant to one organization's
 * history (RED 20261124053000_history_read_grant_v1). On the THROWAWAY local
 * stack of signup-isolated.yml (every migration replayed); synthetic people
 * only; every check uses the grantee's OWN session.
 *
 *   HG-1 without a grant the QA account reads none of the organization's
 *        roster or places; with one it reads both (and the organization row).
 *   HG-2 with a grant it still cannot write: insert and update on the roster,
 *        and an insert of a place, are refused or change nothing.
 *   HG-3 the grant opens nothing outside the history: the organization's
 *        memberships stay invisible and manages_organization stays false.
 *   HG-4 a revoked grant and an expired grant read nothing again.
 *   HG-5 in the browser: a WORKER with a live grant opens the company history and
 *        one person's page read-only (no import / duplicate / photo / document
 *        controls) and nothing else of the company space; without the grant the
 *        same pages redirect exactly as before.
 */

test.skip(!isolatedStack(), "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const RUN = Date.now().toString(36);
const OWNER = `hg-owner-${RUN}@example.test`;
const QA = `hg-qa-${RUN}@example.test`;
const state = { orgId: "", ownerId: "", qaId: "", grantId: "" };

async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function rest(address: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${await accessToken(address)}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function count(address: string, table: string): Promise<number> {
  const r = await rest(address, `${table}?select=id&organization_id=eq.${state.orgId}`);
  expect(r.ok, `${table} read → ${r.status}`).toBe(true);
  return ((await r.json()) as unknown[]).length;
}

function grant(expiresIn = "1 hour"): string {
  // sql() wraps its query in a subquery, which cannot hold an INSERT: write,
  // then read the newest grant back.
  sqlExec(`insert into public.organization_history_read_grants_v1 (organization_id, profile_id, purpose, granted_by, expires_at)
           values (${lit(state.orgId)}, ${lit(state.qaId)}, 'qa_living_cv_screenshots', ${lit(state.ownerId)}, now() + interval ${lit(expiresIn)})`);
  const [g] = sql<{ id: string }>(
    `select id from public.organization_history_read_grants_v1 where profile_id = ${lit(state.qaId)} order by granted_at desc limit 1`,
  );
  return g!.id;
}

test("HG-1. no grant reads nothing; a live grant reads the roster, the places and the organization", async ({ browser }) => {
  const p = await fresh(browser);
  await signUp(p, BASE, OWNER);
  await onboard(p, "hire", "Synthetic History Owner");
  await setUpCompany(p, `Synthetic History Co ${RUN}`);
  state.ownerId = await userId(OWNER);
  const [org] = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(state.ownerId)} and organization_type = 'company'`,
  );
  state.orgId = org!.id;
  sqlExec(`insert into public.organization_people (organization_id, display_name, normalized_name, created_by)
           values (${lit(state.orgId)}, 'Synthetic Person A', 'synthetic person a', ${lit(state.ownerId)}),
                  (${lit(state.orgId)}, 'Synthetic Person B', 'synthetic person b', ${lit(state.ownerId)});
           insert into public.work_objects (organization_id, name, created_by)
           values (${lit(state.orgId)}, 'Synthetic Site ${RUN}', ${lit(state.ownerId)});`);

  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: QA, password: PASSWORD, data: { role: "company" } }),
  });
  expect(r.ok, `QA sign-up → ${r.status}`).toBe(true);
  state.qaId = await userId(QA);

  expect(await count(QA, "organization_people"), "no grant: roster").toBe(0);
  expect(await count(QA, "work_objects"), "no grant: places").toBe(0);

  state.grantId = grant();
  expect(await count(QA, "organization_people"), "grant: roster").toBe(2);
  expect(await count(QA, "work_objects"), "grant: places").toBe(1);
  const o = await rest(QA, `organizations?select=id&id=eq.${state.orgId}`);
  expect(((await o.json()) as unknown[]).length, "grant: the organization row").toBe(1);
  const mine = await rest(QA, "rpc/my_history_read_grants_v1", { method: "POST", body: "{}" });
  const rows = (await mine.json()) as Array<{ organization_id: string }>;
  expect(rows.map((x) => x.organization_id)).toEqual([state.orgId]);
});

test("HG-2. a grant never writes", async () => {
  const ins = await rest(QA, "organization_people", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ organization_id: state.orgId, display_name: "Injected", normalized_name: "injected" }),
  });
  expect(ins.ok, "roster insert refused").toBe(false);
  const upd = await rest(QA, `organization_people?organization_id=eq.${state.orgId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ display_name: "Changed" }),
  });
  const changed = upd.ok ? ((await upd.json()) as unknown[]).length : 0;
  expect(changed, "roster update changes nothing").toBe(0);
  const place = await rest(QA, "work_objects", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ organization_id: state.orgId, name: "Injected site", created_by: state.qaId }),
  });
  expect(place.ok, "place insert refused").toBe(false);
  const [n] = sql<{ n: number }>(
    `select count(*)::int as n from public.organization_people where organization_id = ${lit(state.orgId)} and display_name in ('Injected', 'Changed')`,
  );
  expect(n?.n, "nothing written").toBe(0);
});

test("HG-3. a grant opens nothing outside the history", async () => {
  expect(await count(QA, "company_memberships"), "memberships stay closed").toBe(0);
  const m = await rest(QA, "rpc/manages_organization", { method: "POST", body: JSON.stringify({ org: state.orgId }) });
  expect(await m.json(), "no manager right").toBe(false);
  const table = await rest(QA, "organization_history_read_grants_v1?select=id");
  expect(table.ok, "the grant table itself is closed to the API").toBe(false);
});

test("HG-4. a revoked or expired grant reads nothing", async () => {
  sqlExec(`update public.organization_history_read_grants_v1 set revoked_at = now() where id = ${lit(state.grantId)}`);
  expect(await count(QA, "organization_people"), "revoked: roster").toBe(0);
  const g = grant("1 second");
  sqlExec(`select pg_sleep(1.5)`);
  expect(await count(QA, "organization_people"), "expired: roster").toBe(0);
  expect(() =>
    sqlExec(`insert into public.organization_history_read_grants_v1 (organization_id, profile_id, purpose, expires_at)
             values (${lit(state.orgId)}, ${lit(state.qaId)}, 'qa_living_cv_screenshots', now() + interval '5 hours')`),
  ).toThrow();
  sqlExec(`update public.organization_history_read_grants_v1 set revoked_at = now() where id = ${lit(g)}`);
});

test("HG-5. a worker with a grant opens the two history pages read-only, and nothing else", async ({ browser }) => {
  const WORKER = `hg-worker-${RUN}@example.test`;
  const p = await fresh(browser);
  await signUp(p, BASE, WORKER);
  await onboard(p, "work", "Synthetic History Reader");
  const workerId = await userId(WORKER);
  const [person] = sql<{ id: string }>(
    `select id from public.organization_people where organization_id = ${lit(state.orgId)} order by display_name limit 1`,
  );
  const history = `${BASE}/en/dashboard/company/history?org=${state.orgId}`;
  const personPage = `${BASE}/en/dashboard/company/people/${person!.id}?org=${state.orgId}`;

  // No grant: the company pages refuse exactly as before.
  await p.goto(history);
  await expect(p).not.toHaveURL(/\/dashboard\/company\/history/);

  sqlExec(`insert into public.organization_history_read_grants_v1 (organization_id, profile_id, purpose, granted_by, expires_at)
           values (${lit(state.orgId)}, ${lit(workerId)}, 'qa_living_cv_screenshots', ${lit(state.ownerId)}, now() + interval '1 hour')`);

  await p.goto(history);
  await expect(p.getByTestId("company-history")).toHaveAttribute("data-access", "read-grant");
  for (const write of ["evidence-import-zone", "history-quality-fold", "history-duplicates-fold", "company-history-neighbours"]) {
    await expect(p.locator(`#${write}, [data-testid="${write}"]`), write).toHaveCount(0);
  }

  await p.goto(personPage);
  await expect(p.getByTestId("company-person")).toBeVisible();
  await expect(p.getByTestId("linked-documents-not-linked")).toHaveCount(0);
  await expect(p.getByTestId("company-person-open-profile")).toHaveCount(0);
  await expect(p.getByTestId("company-person-back")).toHaveAttribute("href", /\/dashboard\/company\/history\?org=/);

  // Every other company page stays closed.
  await p.goto(`${BASE}/en/dashboard/company/people`);
  await expect(p).not.toHaveURL(/\/dashboard\/company\/people$/);

  // Revoked: back to the refusal.
  sqlExec(`update public.organization_history_read_grants_v1 set revoked_at = now() where profile_id = ${lit(workerId)}`);
  await p.goto(history);
  await expect(p).not.toHaveURL(/\/dashboard\/company\/history/);
});
