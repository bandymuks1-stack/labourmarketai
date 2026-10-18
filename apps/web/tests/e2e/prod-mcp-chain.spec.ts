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
type JsonSchema = {
  type?: string;
  format?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  minItems?: number;
  minLength?: number;
};
type CatalogTool = { name: string; inputSchema: JsonSchema; annotations?: { readOnlyHint?: boolean } };
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
  let body: { result?: { structuredContent?: ToolResult; tools?: CatalogTool[] }; error?: unknown } | null = null;
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
/** Every offering the caller owns. `listOwnServiceOfferings` answers
 *  `{ kind: "ok", rows }`, which the read wrapper passes through as `data.rows`. */
const ownAll = async (token: string) => {
  const r = await tool(token, "service_offering_list_own");
  expect(r.ok, JSON.stringify(r)).toBe(true);
  const d = r.data ?? {};
  return (Array.isArray(r.data) ? r.data : ((d.rows ?? d.offerings ?? d.items ?? []) as unknown[])) as { id: string; title: string }[];
};
const own = async (token: string) => (await ownAll(token)).filter((o) => o.title?.startsWith(TAG));

let worker = "";
let agency = "";
let offeringId = "";
let catalog: CatalogTool[] = [];

/** Rows this walk creates — this run's, or an earlier run's that stopped
 *  before its own delete — removed through the same two steps a person uses. */
const WALK_ROW = /^QA-SYNTHETIC \S+ mcp /;
test.afterAll(async () => {
  if (!worker) return;
  for (const row of (await ownAll(worker)).filter((o) => WALK_ROW.test(o.title ?? ""))) {
    const draft = await tool(worker, "service_offering_delete_draft", { offeringId: row.id });
    if (!draft.ok) continue;
    await tool(worker, "service_offering_delete_confirm", {
      offeringId: row.id,
      confirmationToken: String(draft.data?.confirmationToken ?? ""),
    });
  }
  expect((await ownAll(worker)).filter((o) => WALK_ROW.test(o.title ?? "")), "walk rows left behind").toHaveLength(0);
});

test("M-1. the published toolset is the universal one, and an anonymous caller is refused", async () => {
  worker = bearerOf("worker");
  agency = bearerOf("agency");
  const list = await rpc(worker, "tools/list");
  expect(list.status).toBe(200);
  catalog = list.body?.result?.tools ?? [];
  const names = catalog.map((t) => t.name);
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

/**
 * A well-formed placeholder for one required argument: the shape is valid, the
 * referent does not exist (nil-like UUID, `.invalid` e-mail, a future date), so
 * a read answers "not found / not yours / invalid" — it never finds anything.
 */
function placeholder(schema: JsonSchema | undefined, key: string): unknown {
  const s = schema?.anyOf?.find((b) => b.type && b.type !== "null") ?? schema ?? {};
  if (s.enum?.length) return s.enum[0];
  switch (s.type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return false;
    case "array":
      return s.minItems ? Array.from({ length: s.minItems }, () => placeholder(s.items, key)) : [];
    case "object":
      return argsFor(s);
    default:
      if (s.format === "uuid" || /Id$/.test(key)) return "00000000-0000-4000-8000-000000000000";
      if (s.format === "email" || /email/i.test(key)) return "qa.nobody@example.invalid";
      if (s.format === "date" || /date/i.test(key)) return "2099-01-04";
      return `QA-SYNTHETIC ${RUN} probe`.padEnd(s.minLength ?? 0, ".");
  }
}
function argsFor(schema: JsonSchema): Record<string, unknown> {
  const parts = [schema, ...(schema.allOf ?? [])];
  const props = Object.assign({}, ...parts.map((p) => p.properties ?? {})) as Record<string, JsonSchema>;
  const required = parts.flatMap((p) => p.required ?? []);
  return Object.fromEntries(required.map((k) => [k, placeholder(props[k], k)]));
}

test("M-7. every read-only tool is callable: each answers a structured result, none errors", async () => {
  test.setTimeout(600_000);
  const reads = catalog.filter((t) => t.annotations?.readOnlyHint);
  expect(reads.length, "the catalog was not captured in M-1").toBeGreaterThanOrEqual(100);
  const broken: string[] = [];
  const outcomes = new Map<string, number>();
  for (const t of reads) {
    const r = await rpc(worker, "tools/call", { name: t.name, arguments: argsFor(t.inputSchema) });
    const out = r.body?.result?.structuredContent;
    if (r.status !== 200 || !out || typeof out.ok !== "boolean") {
      broken.push(`${t.name}: HTTP ${r.status} ${r.text.slice(0, 160)}`);
      continue;
    }
    const k = out.ok ? "ok" : (out.code ?? "error");
    outcomes.set(k, (outcomes.get(k) ?? 0) + 1);
  }
  console.info(`[mcp] read sweep: ${reads.length} read-only tools → ${JSON.stringify(Object.fromEntries(outcomes))}`);
  expect(broken, "read-only tools that did not answer a structured result").toEqual([]);
});
