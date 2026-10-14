import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

/**
 * PRODUCTION MCP — AI-AGENT SCENARIOS, driven exactly as an external assistant
 * (ChatGPT / Claude) drives them: `POST /api/mcp`, JSON-RPC `tools/call`, the
 * person's OWN bearer token, no cookie. Each scenario is one agent acting for
 * one person:
 *
 *   A-1 BUYER AGENT      manager (QA-SYNTHETIC Gama) states a need, reads it back
 *   A-2 SERVICE SEARCH   the buyer's discovery / matching reads answer
 *   A-3 SUPPLIER AGENT   worker publishes a service, buyer requests it,
 *                        provider answers, buyer sees the answer
 *   A-4 PROPOSAL         agency (QA-SYNTHETIC Agentūra) records and deletes a
 *                        proposal; another person cannot delete it
 *   A-5 COMMUNICATION    one QA identity messages another; recipient reads it
 *   A-6 PROJECTS         owner (QA-SYNTHETIC Alfa/Beta) reads, creates and
 *                        starts a project; readiness, risk and evidence answer
 *   A-7 ISOLATION        the agency cannot read or change the buyer's need, the
 *                        owner's project or a thread it is not part of
 *   A-8 WRAP-UP          the need is closed and the project completed, once each
 *
 * Every write that has a prepare/confirm pair goes through it, and replaying a
 * spent confirmation is asserted refused. Runs only in
 * `.github/workflows/prod-qa-walk.yml` (spec=mcp-agents) with the synthetic
 * cast. Everything it creates is tagged QA-SYNTHETIC and removed (or, where
 * the product keeps history — a completed project, a sent message — left in a
 * terminal state inside the synthetic organizations) by the walk itself.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const TAG = `QA-SYNTHETIC ${RUN} agents`;
const ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "https://labourmarket.ai";
const SLOTS = ["owner", "manager", "worker", "worker2", "agency"] as const;
type Slot = (typeof SLOTS)[number];
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && SLOTS.every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
// 9 tests × 60 s + afterAll 60 s = 10 min ceiling.
test.describe.configure({ mode: "serial", timeout: 60_000, retries: 0 });

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
/** The caller's own profile id (the JWT `sub`) — what recipientProfileId names. */
function profileIdOf(token: string): string {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).sub as string;
}

type ToolResult = { ok: boolean; code?: string; data?: Record<string, unknown>; message?: string };
type CatalogTool = { name: string };
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
/** The one array a read answers under one of `keys` — absent is a failure,
 *  never an empty answer. */
function listOf<T>(r: ToolResult, ...keys: string[]): T[] {
  const d = r.data ?? {};
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  throw new Error(`no ${keys.join("/")} list in ${JSON.stringify(d).slice(0, 300)}`);
}
const ok = (r: ToolResult) => expect(r.ok, JSON.stringify(r)).toBe(true);
const refused = (r: ToolResult, what: string) => expect(r.ok, `${what} was accepted: ${JSON.stringify(r)}`).toBe(false);

/** prepare → confirm through a `<base>_draft` / `<base>_confirm` pair, then
 *  replay the spent token and assert it is refused. */
async function prepareConfirm(token: string, base: string, input: Record<string, unknown>, opts: { replay?: boolean } = {}) {
  const draft = await tool(token, `${base}_draft`, input);
  ok(draft);
  const confirmationToken = String(draft.data?.confirmationToken ?? "");
  expect(confirmationToken.length, `${base}_draft returned no token`).toBeGreaterThanOrEqual(10);
  const done = await tool(token, `${base}_confirm`, { ...input, confirmationToken });
  if (done.ok && opts.replay !== false) {
    const replay = await tool(token, `${base}_confirm`, { ...input, confirmationToken });
    refused(replay, `replayed ${base}_confirm`);
    console.info(`[agents] ${base}: confirmed once, replay → ${replay.code}`);
  }
  return { draft, done, confirmationToken };
}

const tok = {} as Record<Slot, string>;
let catalog: string[] = [];
let demandId = "";
let offeringId = "";
let requestId = "";
let conversationId = "";
let conversationParties: Slot[] = [];
let projectId = "";
const PROJECT_TITLE = `${TAG} objektas Kaunas`;

// ── read helpers ─────────────────────────────────────────────────────────────
type Need = { id: string; title: string | null; status: string | null };
const needs = async (token: string, includeClosed = false) => {
  const r = await tool(token, "demand_list", includeClosed ? { includeClosed: true } : {});
  ok(r);
  return listOf<Need>(r, "needs");
};
type Offering = { id: string; title: string; status?: string };
const ownOfferings = async (token: string) => {
  const r = await tool(token, "service_offering_list_own");
  ok(r);
  return listOf<Offering>(r, "rows", "items");
};
type Req = { id: string; offeringId: string; offeringTitle: string | null; status: string; responseNote: string | null };
const outgoing = async (token: string) => {
  const r = await tool(token, "service_request_outgoing_list");
  ok(r);
  return listOf<Req>(r, "rows", "items");
};
const incoming = async (token: string) => {
  const r = await tool(token, "service_request_incoming_list");
  ok(r);
  return listOf<Req>(r, "rows", "items");
};
type Proposal = { id: string; title: string; status: string };
const proposals = async (token: string) => {
  const r = await tool(token, "commercial_get");
  ok(r);
  return listOf<Proposal>(r, "proposals");
};
type Project = { id: string; title: string; status: string | null };
const projects = async (token: string) => {
  const r = await tool(token, "projects_list");
  ok(r);
  return { r, rows: listOf<Project & { recordState?: string; record_state?: string }>(r, "projects") };
};

/** Rows this walk creates — this run's, or an earlier run's that stopped
 *  before its own cleanup — removed through the same steps a person uses. */
const WALK_ROW = /^QA-SYNTHETIC \S+ agents /;
test.afterAll(async () => {
  if (!tok.worker) return;
  // Buyer: withdraw still-open requests, close still-open needs.
  for (const r of (await outgoing(tok.manager)).filter((x) => x.status === "sent" && WALK_ROW.test(x.offeringTitle ?? ""))) {
    await prepareConfirm(tok.manager, "service_request_withdraw", { requestId: r.id }, { replay: false });
  }
  for (const n of (await needs(tok.manager)).filter((x) => WALK_ROW.test(x.title ?? ""))) {
    await prepareConfirm(tok.manager, "demand_close", { requestId: n.id }, { replay: false });
  }
  // Provider: delete the offerings (their requests cascade with them).
  for (const o of (await ownOfferings(tok.worker)).filter((x) => WALK_ROW.test(x.title ?? ""))) {
    await prepareConfirm(tok.worker, "service_offering_delete", { offeringId: o.id }, { replay: false });
  }
  // Supplier: delete the proposals.
  for (const p of (await proposals(tok.agency)).filter((x) => WALK_ROW.test(x.title ?? ""))) {
    await prepareConfirm(tok.agency, "proposal_delete", { proposalId: p.id }, { replay: false });
  }
  // Owner: a project is never deleted — it is completed and kept as history.
  for (const p of (await projects(tok.owner)).rows.filter((x) => WALK_ROW.test(x.title ?? "") && x.status !== "completed")) {
    if (p.status === "draft") await prepareConfirm(tok.owner, "project_status_set", { projectId: p.id, toStatus: "live" }, { replay: false });
    await prepareConfirm(tok.owner, "project_status_set", { projectId: p.id, toStatus: "completed" }, { replay: false });
  }
  expect((await needs(tok.manager)).filter((x) => WALK_ROW.test(x.title ?? "")), "open walk needs left behind").toHaveLength(0);
  expect((await ownOfferings(tok.worker)).filter((x) => WALK_ROW.test(x.title ?? "")), "walk offerings left behind").toHaveLength(0);
  expect((await proposals(tok.agency)).filter((x) => WALK_ROW.test(x.title ?? "")), "walk proposals left behind").toHaveLength(0);
  expect(
    (await projects(tok.owner)).rows.filter((x) => WALK_ROW.test(x.title ?? "") && x.status !== "completed"),
    "walk projects left open",
  ).toHaveLength(0);
});

test("A-0. the agent toolset carries every tool these scenarios call", async () => {
  for (const s of SLOTS) tok[s] = bearerOf(s);
  const list = await rpc(tok.manager, "tools/list");
  expect(list.status).toBe(200);
  catalog = (list.body?.result?.tools ?? []).map((t) => t.name);
  console.info(`[agents] tools/list → ${catalog.length} tools`);
  const used = [
    "demand_create_draft", "demand_create_confirm", "demand_list", "demand_close_draft", "demand_close_confirm",
    "service_offering_discover", "marketplace_listing_discover", "work_find", "candidate_search",
    "service_offering_create", "service_offering_list_own", "service_offering_status_set_draft", "service_offering_status_set_confirm",
    "service_offering_delete_draft", "service_offering_delete_confirm",
    "service_request_create_draft", "service_request_create_confirm", "service_request_incoming_list",
    "service_request_outgoing_list", "service_request_respond_draft", "service_request_respond_confirm",
    "service_request_withdraw_draft", "service_request_withdraw_confirm",
    "proposal_create", "commercial_get", "proposal_delete_draft", "proposal_delete_confirm",
    "message_send_draft", "message_send_confirm", "conversation_list", "conversation_get",
    "projects_list", "project_create_draft", "project_create_confirm", "project_status_set_draft", "project_status_set_confirm",
    "evidence_records_list", "project_readiness_get", "project_risk_get",
  ];
  expect(used.filter((n) => !catalog.includes(n)), "tools the scenarios need but the server does not publish").toEqual([]);
});

test("A-1. BUYER AGENT: the manager states a need (prepare → confirm), reads it back once, a replay is refused", async () => {
  const role = `${TAG} plytelių klojėjas`;
  const input = {
    intent: "hire_workers",
    description: "Synthetic production QA need created by an AI agent over MCP; the walk closes it.",
    role,
    workType: "tiler",
    skills: "tiling, grouting",
    country: "LT",
    teamSize: 1,
    urgency: "flexible",
  };
  // An earlier run that stopped before its wrap-up must not hold the plan's
  // open-need ceiling: synthetic needs left open by ANY earlier walk (this
  // one or another; walks never run concurrently — one concurrency group)
  // are closed first, the normal way. Only QA-SYNTHETIC titles are touched.
  for (const n of (await needs(tok.manager)).filter((x) => /^QA-SYNTHETIC /.test(x.title ?? ""))) {
    await prepareConfirm(tok.manager, "demand_close", { requestId: n.id }, { replay: false });
  }
  const draft = await tool(tok.manager, "demand_create_draft", input);
  ok(draft);
  const actingFor = String((draft.data?.preview as { actingFor?: unknown } | undefined)?.actingFor ?? "");
  console.info(`[agents] buyer acts for: ${actingFor}`);
  expect(actingFor, "the buyer must act for a synthetic organization").toMatch(/QA-SYNTHETIC/);
  expect((await needs(tok.manager)).filter((n) => n.title === role), "prepare writes nothing").toHaveLength(0);

  const confirmationToken = String(draft.data?.confirmationToken ?? "");
  const done = await tool(tok.manager, "demand_create_confirm", { ...input, confirmationToken });
  if (!done.ok && done.code === "over_open_need_limit") {
    // A real plan ceiling, not an error: Gama already holds its allowed open
    // positions. Recorded honestly; the need-dependent steps below say so.
    const open = await needs(tok.manager);
    console.info(`[agents] demand_create_confirm → over_open_need_limit (${open.length} open needs in ${actingFor})`);
    test.info().annotations.push({ type: "not-covered", description: `demand create refused by plan ceiling (${open.length} open)` });
    expect(open.length, "an open-need ceiling with no open need is a false refusal").toBeGreaterThan(0);
    return;
  }
  ok(done);
  demandId = String(done.data?.requestId ?? "");
  expect(demandId).toMatch(/^[0-9a-f-]{36}$/);
  const replay = await tool(tok.manager, "demand_create_confirm", { ...input, confirmationToken });
  refused(replay, "replayed demand_create_confirm");

  const mine = (await needs(tok.manager)).filter((n) => n.title === role);
  expect(mine, "exactly one need, even after the replay").toHaveLength(1);
  expect(mine[0].id).toBe(demandId);
  expect(mine[0].status).toBe("submitted");
});

test("A-2. SERVICE SEARCH: the buyer's discovery and matching tools answer", async () => {
  const services = await tool(tok.manager, "service_offering_discover", { country: "LT" });
  ok(services);
  const listings = await tool(tok.manager, "marketplace_listing_discover", {});
  ok(listings);
  console.info(
    `[agents] discover: services(LT)=${listOf(services, "rows", "items").length} listings=${listOf(listings, "rows", "items").length}`,
  );
  // Matching runs for the caller it applies to: candidates for the buyer's
  // own need, work for the person.
  if (demandId) {
    const candidates = await tool(tok.manager, "candidate_search", { requestId: demandId, limit: 5 });
    ok(candidates);
    expect((candidates.data?.need as { id?: string } | undefined)?.id).toBe(demandId);
    console.info(`[agents] candidate_search → ${String(candidates.data?.totalCandidates)} candidates`);
  } else {
    test.info().annotations.push({ type: "not-covered", description: "candidate_search: no need was created in A-1" });
  }
  const work = await tool(tok.worker, "work_find", { country: "LT" });
  ok(work);
});

test("A-3. SUPPLIER AGENT: the provider publishes a service, the buyer requests it, the provider answers, the buyer sees it", async () => {
  // Provider (worker): a DRAFT offering, then published through prepare → confirm.
  const title = `${TAG} plytelių klojimas`;
  const created = await tool(tok.worker, "service_offering_create", {
    title,
    description: "Synthetic production QA service; the walk deletes it.",
    categorySlug: "tiling",
    locationCountry: "LT",
    remote: false,
    rateText: "25 EUR/m²",
  });
  ok(created);
  const row = (await ownOfferings(tok.worker)).find((o) => o.title === title);
  expect(row, "the created offering reads back").toBeTruthy();
  offeringId = row!.id;
  const publish = await prepareConfirm(tok.worker, "service_offering_status_set", { offeringId, status: "active" });
  ok(publish.done);

  // Buyer (manager) finds it.
  const found = listOf<{ id: string; title: string }>(await tool(tok.manager, "service_offering_discover", { country: "LT" }), "rows", "items");
  expect(found.map((o) => o.id), "the published service is discoverable to the buyer").toContain(offeringId);

  // Buyer requests it.
  const message = `${TAG}: ar galite kitą savaitę?`;
  const req = await prepareConfirm(tok.manager, "service_request_create", { offeringId, message });
  ok(req.done);
  const sent = (await outgoing(tok.manager)).filter((r) => r.offeringId === offeringId);
  expect(sent, "exactly one request, even after the replay").toHaveLength(1);
  requestId = sent[0].id;
  expect(sent[0].status).toBe("sent");

  // Provider sees it and answers.
  const inbox = (await incoming(tok.worker)).filter((r) => r.id === requestId);
  expect(inbox, "the provider sees the request").toHaveLength(1);
  const note = `${TAG}: taip, tinka.`;
  const answer = await prepareConfirm(tok.worker, "service_request_respond", { requestId, decision: "accepted", note });
  ok(answer.done);

  // Buyer sees the answer.
  const back = (await outgoing(tok.manager)).find((r) => r.id === requestId);
  expect(back?.status).toBe("accepted");
  expect(back?.responseNote).toBe(note);

  // An answered request is no longer withdrawable — refused honestly, nothing changes.
  const withdraw = await tool(tok.manager, "service_request_withdraw_draft", { requestId });
  if (withdraw.ok) {
    const w = await tool(tok.manager, "service_request_withdraw_confirm", {
      requestId,
      confirmationToken: String(withdraw.data?.confirmationToken ?? ""),
    });
    refused(w, "withdrawing an accepted request");
  }
  expect((await outgoing(tok.manager)).find((r) => r.id === requestId)?.status).toBe("accepted");

  // The agency, as a supplier, reads its own side of the market.
  ok(await tool(tok.agency, "service_offering_list_own"));
  ok(await tool(tok.agency, "service_request_incoming_list"));
});

test("A-4. PROPOSAL: the supplier records a proposal, reads it, and deletes it once; another person cannot delete it", async () => {
  const title = `${TAG} pasiūlymas plytelių darbams`;
  ok(await tool(tok.agency, "proposal_create", { title, amountCents: 125_000 }));
  const mine = (await proposals(tok.agency)).filter((p) => p.title === title);
  expect(mine, "the proposal reads back once").toHaveLength(1);
  const proposalId = mine[0].id;
  expect(mine[0].status).toBe("draft");

  // Another person (the buyer) cannot delete it.
  const foreign = await tool(tok.manager, "proposal_delete_draft", { proposalId });
  if (foreign.ok) {
    const c = await tool(tok.manager, "proposal_delete_confirm", {
      proposalId,
      confirmationToken: String(foreign.data?.confirmationToken ?? ""),
    });
    refused(c, "a stranger's proposal delete");
  }
  expect((await proposals(tok.agency)).filter((p) => p.id === proposalId), "untouched").toHaveLength(1);

  const del = await prepareConfirm(tok.agency, "proposal_delete", { proposalId });
  ok(del.done);
  expect((await proposals(tok.agency)).filter((p) => p.id === proposalId)).toHaveLength(0);
});

test("A-5. COMMUNICATION: one QA identity messages another (prepare → confirm); the recipient reads it", async () => {
  // The contact gate decides who may start a thread: an existing thread, a
  // shared team, or a managed project. An accepted service request opens a
  // thread only from the web (openServiceRequestConversationAction) — there is
  // no MCP tool for it — so the buyer → provider pair is tried first and the
  // walk falls back to another QA pair the gate admits. Every answer is logged.
  const pairs: [Slot, Slot][] = [
    ["manager", "worker"],
    ["worker2", "worker"],
    ["worker", "worker2"],
    ["owner", "manager"],
    ["manager", "owner"],
    ["owner", "worker"],
    ["agency", "worker"],
  ];
  const body = `${TAG}: sveiki, ar rytoj 8:00 tinka?`;
  const drafts: { from: Slot; to: Slot; r: ToolResult }[] = [];
  for (const [from, to] of pairs) {
    const r = await tool(tok[from], "message_send_draft", { recipientProfileId: profileIdOf(tok[to]), body });
    drafts.push({ from, to, r });
    console.info(
      `[agents] message_send_draft ${from}→${to}: ${r.ok ? `ok (${String((r.data?.preview as { conversation?: string })?.conversation)})` : r.code}`,
    );
  }
  for (const d of drafts) {
    if (!d.r.ok) expect(d.r.code, "a refused contact names why").toBeTruthy();
  }
  // Prefer a thread that already exists: nothing new is opened.
  const conv = (d: (typeof drafts)[number]) => (d.r.data?.preview as { conversation?: string } | undefined)?.conversation;
  const pick = drafts.find((d) => d.r.ok && conv(d) === "existing") ?? drafts.find((d) => d.r.ok);
  expect(pick, "no QA pair may contact another — the contact gate admits none").toBeTruthy();
  const { from, to } = pick!;
  if (!(from === "manager" && to === "worker")) {
    test.info().annotations.push({ type: "fallback", description: `messaged ${from}→${to}; manager→worker answered ${drafts[0].r.ok ? "ok" : drafts[0].r.code}` });
  }

  const input = { recipientProfileId: profileIdOf(tok[to]), body };
  const sent = await prepareConfirm(tok[from], "message_send", input);
  ok(sent.done);
  conversationId = String(sent.done.data?.conversationId ?? "");
  conversationParties = [from, to];
  const readBack = sent.done.data?.readBack as { bodyMatches?: boolean; recipientIsParticipant?: boolean | null } | null;
  expect(readBack?.bodyMatches).toBe(true);
  expect(readBack?.recipientIsParticipant).toBe(true);

  // The recipient reads it.
  const list = await tool(tok[to], "conversation_list", { limit: 50 });
  ok(list);
  expect(listOf<{ conversationId: string }>(list, "conversations").map((c) => c.conversationId)).toContain(conversationId);
  const thread = await tool(tok[to], "conversation_get", { conversationId, limit: 30 });
  ok(thread);
  const got = listOf<{ body: string; fromMe: boolean }>(thread, "messages").filter((m) => m.body === body);
  expect(got, "the recipient sees the message once, not from themselves").toHaveLength(1);
  expect(got[0].fromMe).toBe(false);
});

test("A-6. PROJECTS: the owner reads, creates and starts a project; readiness, risk and evidence answer", async () => {
  const before = await projects(tok.owner);
  const actingFor = String(before.r.data?.actingFor ?? "");
  console.info(`[agents] owner acts for: ${actingFor}; projects total=${String(before.r.data?.total)}`);
  expect(actingFor, "the owner must act for a synthetic organization").toMatch(/QA-SYNTHETIC/);
  expect(typeof before.r.data?.total, "total is a number").toBe("number");
  const ids = before.rows.map((p) => p.id);
  expect(new Set(ids).size, "no project listed twice").toBe(ids.length);
  expect(
    before.rows.filter((p) => p.recordState === "duplicate" || p.record_state === "duplicate"),
    "a duplicate fragment is not a project",
  ).toEqual([]);

  const title = PROJECT_TITLE;
  const created = await prepareConfirm(tok.owner, "project_create", { title, city: "Kaunas" });
  ok(created.done);
  projectId = String(created.done.data?.projectId ?? "");
  expect(projectId).toMatch(/^[0-9a-f-]{36}$/);
  const listed = (await projects(tok.owner)).rows.filter((p) => p.title === title);
  expect(listed, "exactly one project, even after the replay").toHaveLength(1);
  expect(listed[0].status).toBe("draft");

  const start = await prepareConfirm(tok.owner, "project_status_set", { projectId, toStatus: "live" });
  ok(start.done);
  expect((start.done.data?.readBack as { status?: string } | null)?.status).toBe("live");

  const readiness = await tool(tok.owner, "project_readiness_get", { projectId });
  ok(readiness);
  expect(readiness.data?.kind, JSON.stringify(readiness).slice(0, 300)).toBe("ok");
  expect(readiness.data?.projectId).toBe(projectId);
  ok(await tool(tok.owner, "project_risk_get", {}));
  const evidence = await tool(tok.owner, "evidence_records_list", { limit: 5 });
  ok(evidence);
  console.info(`[agents] evidence_records_list → ${listOf(evidence, "records").length} records (read only)`);
});

test("A-7. ISOLATION: the agency cannot read or change the buyer's need, the owner's project or a foreign thread", async () => {
  if (demandId) {
    const close = await tool(tok.agency, "demand_close_draft", { requestId: demandId });
    refused(close, "the agency preparing to close the buyer's need");
    const theirs = await tool(tok.agency, "demand_list", { includeClosed: true });
    if (theirs.ok) expect(listOf<Need>(theirs, "needs").map((n) => n.id), "the agency lists the buyer's need").not.toContain(demandId);
    // A token minted for the buyer cannot be spent by the agency.
    const buyers = await tool(tok.manager, "demand_close_draft", { requestId: demandId });
    ok(buyers);
    const stolen = await tool(tok.agency, "demand_close_confirm", {
      requestId: demandId,
      confirmationToken: String(buyers.data?.confirmationToken ?? ""),
    });
    refused(stolen, "the agency spending the buyer's close token");
    expect((await needs(tok.manager)).find((n) => n.id === demandId)?.status, "the need is untouched").toBe("submitted");
  } else {
    test.info().annotations.push({ type: "not-covered", description: "demand isolation: no need was created in A-1" });
  }

  const project = await tool(tok.agency, "project_status_set_draft", { projectId, toStatus: "completed" });
  refused(project, "the agency preparing to complete the owner's project");
  const ownersToken = await tool(tok.owner, "project_status_set_draft", { projectId, toStatus: "paused" });
  ok(ownersToken);
  const stolen = await tool(tok.agency, "project_status_set_confirm", {
    projectId,
    toStatus: "paused",
    confirmationToken: String(ownersToken.data?.confirmationToken ?? ""),
  });
  refused(stolen, "the agency spending the owner's status token");
  // A read of a foreign project answers "not found / nothing here", never the project.
  const peek = await tool(tok.agency, "project_readiness_get", { projectId });
  console.info(`[agents] agency project_readiness_get(owner's project) → ${peek.ok ? String(peek.data?.kind) : peek.code}`);
  expect(peek.ok && peek.data?.kind === "ok", `the agency read the owner's project: ${JSON.stringify(peek).slice(0, 300)}`).toBe(false);
  expect(JSON.stringify(peek)).not.toContain(PROJECT_TITLE);
  expect((await projects(tok.owner)).rows.find((p) => p.id === projectId)?.status, "the project is untouched").toBe("live");

  if (conversationId && !conversationParties.includes("agency")) {
    const thread = await tool(tok.agency, "conversation_get", { conversationId });
    refused(thread, "the agency reading a thread it is not part of");
  }
});

test("A-8. WRAP-UP: the buyer closes the need and the owner completes the project — once each", async () => {
  if (demandId) {
    const close = await prepareConfirm(tok.manager, "demand_close", { requestId: demandId });
    ok(close.done);
    expect((await needs(tok.manager)).map((n) => n.id), "a closed need leaves the open list").not.toContain(demandId);
    expect((await needs(tok.manager, true)).find((n) => n.id === demandId)?.status).toBe("closed");
  }
  const done = await prepareConfirm(tok.owner, "project_status_set", { projectId, toStatus: "completed" });
  ok(done.done);
  expect((await projects(tok.owner)).rows.find((p) => p.id === projectId)?.status).toBe("completed");
});
