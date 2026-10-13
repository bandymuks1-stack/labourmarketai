import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

/**
 * PRODUCTION MCP — the universal LLM integration (#2336) driven exactly as an
 * external assistant drives it: `POST /api/mcp` with the person's OWN bearer
 * token, JSON-RPC `tools/list` / `tools/call`, no cookie.
 *
 * read → prepare → confirm → execute → verify, then the safety properties:
 *   - a spent confirmation is refused (sequential replay),
 *   - of concurrent confirms with one token exactly one executes,
 *   - another person cannot act on this person's record (nothing changes),
 *   - no token → refused,
 *   - what the assistant did is what the website shows.
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=mcp-chain) with the
 * synthetic cast. Everything it creates is tagged QA-SYNTHETIC and deleted
 * again by the walk itself.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} mcp`;
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "https://labourmarket.ai";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state("worker")) && existsSync(state("agency"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 180_000, retries: 0 });

/** The access token out of a minted @supabase/ssr storage state. */
function bearerOf(slot: string): string {
  const s = JSON.parse(readFileSync(state(slot), "utf8")) as { cookies: { name: string; value: string }[] };
  const parts = s.cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  const raw = parts.map((c) => c.value).join("");
  const b64 = raw.startsWith("base64-") ? raw.slice(7) : raw;
  const json = JSON.parse(Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  return json.access_token as string;
}

type ToolResult = { ok: boolean; code?: string; data?: Record<string, unknown>; message?: string };
let rpcId = 0;
async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await res.text();
  let body: { result?: { structuredContent?: ToolResult; tools?: { name: string }[] }; error?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}
async function tool(token: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const r = await rpc(token, "tools/call", { name, arguments: args });
  const out = r.body?.result?.structuredContent;
  if (!out) throw new Error(`${name}: no structured result (HTTP ${r.status}) ${r.text.slice(0, 300)}`);
  return out;
}
const own = async (token: string) => {
  const r = await tool(token, "service_offering_list_own");
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const rows = (Array.isArray(r.data) ? r.data : ((r.data?.offerings ?? r.data?.items ?? []) as unknown[])) as { id: string; title: string }[];
  return rows.filter((o) => o.title?.startsWith(TAG));
};

let worker = "";
let agency = "";
let offeringId = "";

test("M-1. the published toolset is the universal one, and an anonymous caller is refused", async () => {
  worker = bearerOf("worker");
  agency = bearerOf("agency");
  const list = await rpc(worker, "tools/list");
  expect(list.status).toBe(200);
  const names = (list.body?.result?.tools ?? []).map((t) => t.name);
  console.info(`[mcp] tools/list → ${names.length} tools`);
  expect(names.length).toBeGreaterThanOrEqual(229);
  for (const n of ["context_list", "service_offering_create", "service_offering_delete_draft", "service_offering_delete_confirm"]) {
    expect(names, n).toContain(n);
  }
  const anon = await rpc(null, "tools/call", { name: "context_list", arguments: {} });
  expect([401, 403], `anonymous call answered ${anon.status}`).toContain(anon.status);
});

test("M-2. read: the caller's own workspaces", async () => {
  const r = await tool(worker, "context_list");
  expect(r.ok, JSON.stringify(r)).toBe(true);
});

test("M-3. execute a reversible write (a DRAFT service) and see it on the website", async ({ browser }) => {
  const created = await tool(worker, "service_offering_create", {
    title: `${TAG} brick laying`,
    description: "Synthetic production QA row; the walk deletes it.",
    remote: false,
  });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const mine = await own(worker);
  expect(mine).toHaveLength(1);
  offeringId = mine[0].id;
  // Website parity: the same person's services page shows the same record.
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  await page.goto("/lt/dashboard/services");
  await expect(page.getByText(`${TAG} brick laying`).first()).toBeVisible({ timeout: 30_000 });
  await ctx.close();
});

test("M-4. another person cannot delete it — refused, and nothing changes", async () => {
  const draft = await tool(agency, "service_offering_delete_draft", { offeringId });
  if (draft.ok) {
    const token = String(draft.data?.confirmationToken ?? "");
    const confirm = await tool(agency, "service_offering_delete_confirm", { offeringId, confirmationToken: token });
    expect(confirm.ok, `a stranger's delete was accepted: ${JSON.stringify(confirm)}`).toBe(false);
  }
  // And a token minted for the worker cannot be spent by the agency.
  const mine = await tool(worker, "service_offering_delete_draft", { offeringId });
  expect(mine.ok, JSON.stringify(mine)).toBe(true);
  const stolen = await tool(agency, "service_offering_delete_confirm", {
    offeringId,
    confirmationToken: String(mine.data?.confirmationToken ?? ""),
  });
  expect(stolen.ok).toBe(false);
  expect(await own(worker), "the record is untouched").toHaveLength(1);
});

test("M-5. prepare → confirm deletes once; a replayed confirm is refused", async () => {
  const draft = await tool(worker, "service_offering_delete_draft", { offeringId });
  expect(draft.ok, JSON.stringify(draft)).toBe(true);
  expect(await own(worker), "prepare writes nothing").toHaveLength(1);
  const token = String(draft.data?.confirmationToken ?? "");
  const first = await tool(worker, "service_offering_delete_confirm", { offeringId, confirmationToken: token });
  expect(first.ok, JSON.stringify(first)).toBe(true);
  const replay = await tool(worker, "service_offering_delete_confirm", { offeringId, confirmationToken: token });
  expect(replay.ok, `replay accepted: ${JSON.stringify(replay)}`).toBe(false);
  expect(await own(worker)).toHaveLength(0);
});

test("M-6. concurrent confirms of one token: exactly one executes", async () => {
  const created = await tool(worker, "service_offering_create", { title: `${TAG} concurrency`, remote: true });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const [row] = await own(worker);
  const draft = await tool(worker, "service_offering_status_set_draft", { offeringId: row.id, status: "paused" });
  expect(draft.ok, JSON.stringify(draft)).toBe(true);
  const token = String(draft.data?.confirmationToken ?? "");
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      tool(worker, "service_offering_status_set_confirm", { offeringId: row.id, status: "paused", confirmationToken: token }),
    ),
  );
  console.info(`[mcp] concurrent confirms → ${results.map((r) => (r.ok ? "ok" : r.code)).join(",")}`);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  // Clean up with the normal two steps.
  const del = await tool(worker, "service_offering_delete_draft", { offeringId: row.id });
  const done = await tool(worker, "service_offering_delete_confirm", {
    offeringId: row.id,
    confirmationToken: String(del.data?.confirmationToken ?? ""),
  });
  expect(done.ok, JSON.stringify(done)).toBe(true);
  expect(await own(worker)).toHaveLength(0);
});
