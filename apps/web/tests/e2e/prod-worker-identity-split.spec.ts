import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "./prod-walk";

import { bearerOf, qaApi } from "./prod-qa-api";

/**
 * PRODUCTION — a found worker is anonymous IN THE API (#2477, decision 0027).
 *
 * Driven exactly as any signed-in employer could drive it: the publishable
 * anon key plus the person's OWN bearer token, straight at PostgREST — no
 * page, no server code in between. For each synthetic employer identity:
 *
 *   - every `workers` row the API returns is one the caller has a WORKING
 *     RELATIONSHIP with (`caller_has_worker_relation_v1` answers true for it),
 *     so the raw row — name, free text — of an unrelated worker never comes back;
 *   - discovery still works: the discoverable ids and the professional
 *     projection answer, and no projection row carries a name, free text,
 *     a profile id or an exact timestamp;
 *   - an anonymous caller gets no worker row and cannot call the projection.
 *
 * Read-only: it writes nothing. Failure messages carry COUNTS only — never a
 * name, an id or a field value. Runs only in `.github/workflows/prod-qa-walk.yml`
 * (spec=worker-identity-split) with the minted synthetic cast, and only after
 * migration 20261018160000 is applied (before it the doors do not exist).
 */
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const EMPLOYER_SLOTS = ["owner", "manager", "agency"] as const;
const ENABLED =
  process.env.PROD_QA_WALK === "1" && SUPA !== "" && ANON !== "" && EMPLOYER_SLOTS.every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

/** The projection's EXACT public schema (migration 20261018160000, `returns table (...)`). Any other
 *  key — a name, contact, free text, profile id, timestamp, trust or consent field — is a leak. */
const PROJECTION_KEYS = new Set([
  "id",
  "experience_years",
  "current_location_country",
  "preferred_countries",
  "availability_status",
  "available_from",
  "salary_min_eur",
  "salary_max_eur",
  "preferred_contract_type",
  "pay_basis_preference",
  "night_shifts_ok",
  "weekend_shifts_ok",
  "overtime_ok",
  "driving_licence_categories",
  "own_vehicle",
  "own_tools",
  "last_active_week",
  "is_synthetic_fixture",
  "has_available_from",
  "detail_unlocked",
]);

async function workerRows(token: string | null): Promise<{ status: number; rows: { id: string }[] }> {
  const res = await qaApi("/rest/v1/workers?select=id&limit=1000", token);
  const body = res.ok ? ((await res.json()) as { id: string }[]) : [];
  return { status: res.status, rows: body };
}

async function rpc(token: string | null, fn: string, args: Record<string, unknown>): Promise<{ status: number; data: unknown }> {
  const res = await qaApi(`/rest/v1/rpc/${fn}`, token, { method: "POST", body: args });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

for (const slot of EMPLOYER_SLOTS) {
  test(`I-1 (${slot}). every worker row the API returns has a working relationship`, async () => {
    const token = bearerOf(slot);
    const { status, rows } = await workerRows(token);
    expect(status, "workers read answered").toBe(200);
    let unrelated = 0;
    for (const row of rows) {
      const r = await rpc(token, "caller_has_worker_relation_v1", { p_worker_id: row.id });
      expect(r.status, "relationship predicate answered").toBe(200);
      if (r.data !== true) unrelated += 1;
    }
    expect(unrelated, `${unrelated} of ${rows.length} worker rows had no working relationship`).toBe(0);
  });
}

test("I-2. discovery still works, and the projection carries no identity", async () => {
  const token = bearerOf("owner");
  const ids = await rpc(token, "list_discoverable_worker_ids_v1", { p_country: null, p_limit: 500 });
  expect(ids.status, "discoverable ids answered").toBe(200);
  // returns table (id uuid) → [{ id }]
  const idList = (Array.isArray(ids.data) ? (ids.data as { id?: unknown }[]) : [])
    .map((x) => x?.id)
    .filter((x): x is string => typeof x === "string");
  expect(idList.length, "discoverable workers are still found").toBeGreaterThan(0);

  const proj = await rpc(token, "list_discoverable_worker_profiles_v1", { p_worker_ids: idList });
  expect(proj.status, "projection answered").toBe(200);
  const rows = (Array.isArray(proj.data) ? proj.data : []) as Record<string, unknown>[];
  expect(rows.length, "the projection returns the found workers").toBeGreaterThan(0);
  const leaking = rows.filter((r) => Object.keys(r).some((k) => !PROJECTION_KEYS.has(k))).length;
  expect(leaking, `${leaking} projection rows carried a field outside the professional projection`).toBe(0);
});

test("I-3. an anonymous caller gets no worker row and no projection", async () => {
  const { rows } = await workerRows(null);
  expect(rows.length, `${rows.length} worker rows answered without a session`).toBe(0);
  const ids = await rpc(null, "list_discoverable_worker_ids_v1", { p_country: null, p_limit: 5 });
  expect(ids.status, "anonymous call to the discovery door is refused").not.toBe(200);
  // The projection itself, with any uuid-shaped input, must refuse an anonymous caller too.
  const proj = await rpc(null, "list_discoverable_worker_profiles_v1", {
    p_worker_ids: ["00000000-0000-4000-8000-000000000000"],
  });
  expect(proj.status, "anonymous call to the projection is refused").not.toBe(200);
});
