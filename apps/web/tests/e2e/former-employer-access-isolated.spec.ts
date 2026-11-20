import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  BASE,
  PASSWORD,
  SB_ANON,
  SB_URL,
  accessToken,
  isolatedStack,
  lit,
  setUpCompany,
  signUp,
  sql,
  sqlExec,
  userId,
} from "./isolated-web-a-helpers";

/**
 * Former employer: limited access (owner decision 2026-11-17;
 * supabase/migrations/20261118164500_former_employer_limited_access_v1.sql),
 * on the THROWAWAY local stack of .github/workflows/signup-isolated.yml.
 * Synthetic people only. Every read and write below runs under the person's
 * OWN session (their JWT, their RLS), through the doors the app calls.
 *
 *   FE-0 O owns organization A, P owns organization B. W joins both through
 *        their join links, and records one entry for A, one for B and one in
 *        their personal journal.
 *   FE-1 While W works for A: O reads W's entry for A (positive control), and
 *        never W's personal entry or W's entry for B.
 *   FE-3 (owner option A) W corrects two retained records AFTER the end: an
 *        unconfirmed one (a superseding edit) and a confirmed one (a
 *        correction). Both corrections stay with A beside their originals,
 *        decided by the ORIGINAL record; the unrelated late entry does not.
 *        Each correction keeps its original, its author and its time.
 *   FE-4 (R2 P3-1) W moves a personal record and B's record into the ended
 *        context for A after the end: neither the copies nor the originals
 *        reach A, because the edit chain is walked only inside one context.
 *   FE-5 (owner 2026-11-18, R2 P3-4) a correction of a historical record
 *        stays in the employment's context: an edit into the personal journal
 *        is refused with nothing written; a correction of a confirmed record
 *        is stored under A whatever context was asked, and A reads it.
 *   FE-1b A PAUSE IS NOT AN END: while the relationship is paused, A keeps
 *        reading, adding to and deciding on W's records, and the entry W files
 *        during the pause belongs to the employment (retained after the end).
 *   FE-2 O ends W's employment through the product's end door. W then files a
 *        new entry under the ended relationship (the database allows a person
 *        to file into their own ended context). Then:
 *        · O still reads the entry recorded DURING the employment (retained);
 *        · O does not read the new entry, W's personal entry or W's entry
 *          for B;
 *        · O can no longer change W's work items, add metrics, confirm an
 *          entry, or switch review back on; the historical rows are unchanged;
 *        · nothing was deleted, and W still reads every one of their entries.
 *
 * One seeded clock step: an entry W files after the end is stamped today, the
 * same date as the end. A real late entry is stamped a later day, so the walk
 * moves that one row's created_at two days forward in the throwaway database
 * (the table's own triggers off for that one UPDATE, inside one transaction). Nothing else is seeded.
 */

test.skip(!isolatedStack() || !SB_ANON, "local stack only (SIGNUP_ISOLATED=1, app and Supabase on 127.0.0.1)");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const RUN = Date.now().toString(36);
const O = `fe-owner-a-${RUN}@example.test`;
const P = `fe-owner-b-${RUN}@example.test`;
const W = `fe-worker-${RUN}@example.test`;
const ORG_A = `Synthetic Former Employer A ${RUN}`;
const ORG_B = `Synthetic Other Employer B ${RUN}`;
const W_NAME = `Synthetic Former Employee ${RUN}`;
const TEXT = {
  during: `QA-SYNTHETIC ${RUN}: tiled the entrance hall for A`,
  during2: `QA-SYNTHETIC ${RUN}: grouted the corridor for A`,
  other: `QA-SYNTHETIC ${RUN}: painted the stairwell for B`,
  personal: `QA-SYNTHETIC ${RUN}: studied for the electrical licence`,
  after: `QA-SYNTHETIC ${RUN}: filed after A ended the employment`,
  paused: `QA-SYNTHETIC ${RUN}: inventory count during the pause, for A`,
};

const s = {
  oId: "",
  pId: "",
  wId: "",
  workerId: "",
  orgA: "",
  orgB: "",
  ecA: "",
  ecB: "",
  ecPersonal: "",
  entryDuring: "",
  entryDuring2: "",
  entryOther: "",
  entryPersonal: "",
  entryAfter: "",
  entryPaused: "",
  workItem: "",
  edited: "",
  corrected: "",
};

const pages = new Map<string, Page>();
async function fresh(browser: Browser, address: string): Promise<Page> {
  const ctx = await browser.newContext({ timezoneId: "UTC" });
  const page = await ctx.newPage();
  pages.set(address, page);
  return page;
}
test.afterAll(async () => {
  for (const p of pages.values()) await p.context().close().catch(() => {});
});

function local(link: string): string {
  const u = new URL(link);
  return `${BASE}${u.pathname}${u.search}`;
}

async function signUpOwner(page: Page, address: string, name: string, org: string): Promise<void> {
  await signUp(page, BASE, address);
  await page.getByTestId("onboarding-intent-hire").click();
  await page.getByTestId("onboarding-intents-continue").click();
  await page.getByTestId("onboarding-display-name").fill(name);
  await page.getByTestId("onboarding-country").click();
  await page.getByRole("option", { name: /Lithuania/ }).first().click();
  await page.getByTestId("onboarding-submit").click();
  await setUpCompany(page, org);
}

function ownedOrg(profileId: string): string {
  const orgs = sql<{ id: string }>(
    `select id from public.organizations where owner_profile_id = ${lit(profileId)} and organization_type <> 'team'`,
  );
  if (orgs.length !== 1) throw new Error(`expected one owned organization, found ${orgs.length}`);
  return orgs[0]!.id;
}

/** The organization's owner mints a single-use "join my organization" link. */
async function joinLink(owner: Page, orgId: string, name: string): Promise<string> {
  await owner.goto(`${BASE}/en/dashboard/network?invite=1&type=join_organization&org=${orgId}#network-invite`);
  const panel = owner.getByRole("main").getByTestId("invite-panel");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId("invite-organization")).toHaveValue(orgId);
  await panel.getByTestId("invite-mode-link").click();
  await panel.getByTestId("invite-name").fill(name);
  await panel.getByTestId("invite-submit").click();
  const copy = panel.getByTestId("invite-copy-link").first();
  await expect(copy, "the invitation link is handed to the owner").toBeVisible({ timeout: 30_000 });
  const raw = await copy.getAttribute("data-invite-link");
  expect(raw, "an invitation link").toBeTruthy();
  return local(raw!);
}

function activeEmployee(profileId: string, orgId: string): string[] {
  return sql<{ id: string }>(
    `select id from public.engagement_contexts
      where profile_id = ${lit(profileId)} and organization_id = ${lit(orgId)}
        and relationship_slug = 'employee' and status = 'active'`,
  ).map((r) => r.id);
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

async function rpc<T>(address: string, fn: string, args: Record<string, unknown>): Promise<{ status: number; body: T }> {
  const r = await rest(address, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
  const text = await r.text();
  return { status: r.status, body: (text ? JSON.parse(text) : null) as T };
}

/** Entry ids the person reads, out of the given ones, under their own RLS. */
async function readable(address: string, ids: string[]): Promise<string[]> {
  const r = await rest(address, `journal_entries?id=in.(${ids.join(",")})&select=id`);
  expect(r.ok, `journal read → ${r.status}`).toBe(true);
  return ((await r.json()) as Array<{ id: string }>).map((x) => x.id).sort();
}

/** One entry through the journal's own create door, as the worker. */
async function file(engagementId: string, text: string): Promise<{ status: number; id: string | null }> {
  const r = await rpc<string | { message?: string }>(W, "create_journal_entry_full", {
    p_worker_id: s.workerId,
    p_engagement_context_id: engagementId,
    p_entry_type_slug: "freeform",
    p_profession_id: null,
    p_original_text: text,
    p_original_language: "en",
    p_hash_prev: null,
    p_hash_self: "client",
    p_visibility_scope: "closed",
    p_metrics: [],
    p_project_id: null,
    p_project_explicit: false,
  });
  return { status: r.status, id: typeof r.body === "string" ? r.body : null };
}

test("FE-0. two organizations; W joins both and records work for each and in their own journal", async ({ browser }) => {
  const o = await fresh(browser, O);
  await signUpOwner(o, O, "Synthetic Owner A", ORG_A);
  s.oId = await userId(O);
  s.orgA = ownedOrg(s.oId);
  const p = await fresh(browser, P);
  await signUpOwner(p, P, "Synthetic Owner B", ORG_B);
  s.pId = await userId(P);
  s.orgB = ownedOrg(s.pId);

  // W registers through A's link, then accepts B's link signed in.
  const w = await fresh(browser, W);
  await w.goto(await joinLink(o, s.orgA, W_NAME));
  await w.getByTestId("invite-register").click();
  await w.waitForURL(/\/en\/auth\/signup/, { timeout: 30_000 });
  await w.locator('input[type="email"]').fill(W);
  await w.locator('input[name="password"]').fill(PASSWORD);
  const confirm = w.locator('input[name="confirm_password"]');
  if (await confirm.count()) await confirm.fill(PASSWORD);
  await w.locator('form button[type="submit"]').click();
  await w.waitForURL(/\/en\/(onboarding|invite|dashboard)/, { timeout: 60_000 });
  if (/\/onboarding/.test(w.url())) {
    await w.getByTestId("onboarding-intent-work").click();
    await w.getByTestId("onboarding-intents-continue").click();
    await w.getByTestId("onboarding-display-name").fill(W_NAME);
    await w.getByTestId("onboarding-country").click();
    await w.getByRole("option", { name: /Lithuania/ }).first().click();
    await w.getByTestId("onboarding-submit").click();
  }
  await w.waitForURL(/\/en\/(dashboard|invite)/, { timeout: 60_000 });
  if (/\/invite\//.test(w.url())) {
    const accept = w.getByTestId("invite-accept");
    if (await accept.isVisible().catch(() => false)) await accept.click();
  }
  s.wId = await userId(W);
  await expect.poll(() => activeEmployee(s.wId, s.orgA).length, { message: "W is A's employee", timeout: 30_000 }).toBe(1);
  await w.goto(await joinLink(p, s.orgB, W_NAME));
  await expect(w.getByTestId("invite-page")).toBeVisible({ timeout: 30_000 });
  await w.getByTestId("invite-accept").click();
  await expect.poll(() => activeEmployee(s.wId, s.orgB).length, { message: "W is B's employee too", timeout: 30_000 }).toBe(1);

  s.ecA = activeEmployee(s.wId, s.orgA)[0]!;
  s.ecB = activeEmployee(s.wId, s.orgB)[0]!;
  const personal = sql<{ id: string }>(
    `select id from public.engagement_contexts
      where profile_id = ${lit(s.wId)} and organization_id is null and relationship_slug = 'employee' and status = 'active'`,
  );
  expect(personal.length, "W keeps one personal (organization-less) journal context").toBe(1);
  s.ecPersonal = personal[0]!.id;
  s.workerId = sql<{ id: string }>(`select id from public.workers where profile_id = ${lit(s.wId)}`)[0]!.id;

  for (const [key, ec, text] of [
    ["entryDuring", s.ecA, TEXT.during],
    ["entryDuring2", s.ecA, TEXT.during2],
    ["entryOther", s.ecB, TEXT.other],
    ["entryPersonal", s.ecPersonal, TEXT.personal],
  ] as const) {
    const r = await file(ec, text);
    expect(r.id, `W records "${text}" (${r.status})`).toBeTruthy();
    s[key] = r.id!;
  }

  // One work item on the entry for A, written by W the way the journal does.
  const item = await rest(W, "journal_entry_work_items", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      journal_entry_id: s.entryDuring,
      worker_id: s.workerId,
      organization_id: s.orgA,
      title: "Entrance hall tiling",
      hours_numeric: 6,
      unit: "hours",
    }),
  });
  expect(item.status, "W adds a work item to their entry").toBe(201);
  s.workItem = ((await item.json()) as Array<{ id: string }>)[0]!.id;
});

test("FE-1. while W works for A, A reads W's entry for A only, and can still decide on it", async () => {
  const ids = [s.entryDuring, s.entryDuring2, s.entryOther, s.entryPersonal];
  expect(await readable(O, ids), "A reads its own entries, nothing else").toEqual([s.entryDuring, s.entryDuring2].sort());
  expect(await readable(P, ids), "B reads its own entry, nothing else").toEqual([s.entryOther]);

  // Positive control for FE-2's review refusal: while the employment runs, A
  // switches review on and decides on one entry through the product's door.
  const on = await rpc<string>(O, "set_engagement_journal_review", { p_engagement_id: s.ecA, p_enabled: true });
  expect(on.body, "an active employer may switch review on").toBe("enabled");
  const decided = await rpc<string>(O, "review_journal_entry", { p_entry_id: s.entryDuring, p_decision: "approved", p_note: null });
  expect(decided.body, "an active employer may confirm W's entry").toBe("approved");

  // Positive controls for FE-2's refusals: while the employment runs, the
  // employer's reviewer may set a work item's decision and add a metric.
  const patch = await rest(O, `journal_entry_work_items?id=eq.${s.workItem}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "confirmed", source: "reviewer_confirmed" }),
  });
  expect(patch.ok ? ((await patch.json()) as unknown[]).length : 0, "an active employer may decide on the work item").toBe(1);
  const metric = await rest(O, "journal_entry_metrics", {
    method: "POST",
    body: JSON.stringify({ entry_id: s.entryDuring, metric_slug: "qa_synthetic_note", value_text: "x", source: "manager_corrected" }),
  });
  expect(metric.status, "an active employer may add a metric").toBe(201);
});

test("FE-1b. a PAUSE is not an end: while paused, A keeps reading, adding to and deciding on W's records, and an entry filed during the pause belongs to the employment", async () => {
  // No product door sets `paused` today, so this seeded step puts the
  // relationship on pause in the throwaway database (and takes it off below).
  sqlExec(`update public.engagement_contexts set status = 'paused' where id = ${lit(s.ecA)}`);
  const during = await file(s.ecA, TEXT.paused);
  expect(during.id, `W can file into the paused relationship (${during.status})`).toBeTruthy();
  s.entryPaused = during.id!;

  expect(
    await readable(O, [s.entryDuring, s.entryDuring2, s.entryPaused, s.entryOther, s.entryPersonal]),
    "a paused relationship keeps A's reads, including the entry filed during the pause",
  ).toEqual([s.entryDuring, s.entryDuring2, s.entryPaused].sort());
  const metric = await rest(O, "journal_entry_metrics", {
    method: "POST",
    body: JSON.stringify({ entry_id: s.entryPaused, metric_slug: "qa_synthetic_note", value_text: "paused", source: "manager_corrected" }),
  });
  expect(metric.status, "a paused relationship keeps A's writes").toBe(201);
  const decided = await rpc<string>(O, "review_journal_entry", { p_entry_id: s.entryPaused, p_decision: "approved", p_note: null });
  expect(decided.body, "a paused relationship keeps A's review basis").toBe("approved");

  sqlExec(`update public.engagement_contexts set status = 'active' where id = ${lit(s.ecA)}`);
});

test("FE-2. A ends the employment: retained history stays readable; new records, other employers' and personal records do not; nothing historical can be changed", async () => {
  // The product's end door, under O's own session.
  const ended = await rpc<{ outcome?: string }>(O, "end_org_membership_v1", { p_engagement_id: s.ecA, p_reason: "QA-SYNTHETIC end" });
  expect(ended.status, `end_org_membership_v1 → ${JSON.stringify(ended.body)}`).toBe(200);
  const [ec] = sql<{ status: string; ended_at: string | null; review: boolean | null }>(
    `select status, ended_at::text, journal_review_enabled as review from public.engagement_contexts where id = ${lit(s.ecA)}`,
  );
  expect(ec?.status, "the employment is ended").toBe("ended");
  expect(ec?.ended_at, "with an end date").toBeTruthy();

  // W files a NEW entry under the ended relationship (allowed for the person),
  // stamped after the end date (the seeded clock step above).
  const late = await file(s.ecA, TEXT.after);
  expect(late.id, `W can still file into their own ended context (${late.status}); the walk needs that new record`).toBeTruthy();
  s.entryAfter = late.id!;
  {
    sqlExec(
      `begin;
       alter table public.journal_entries disable trigger user;
       update public.journal_entries set created_at = created_at + interval '2 days' where id = ${lit(s.entryAfter)};
       alter table public.journal_entries enable trigger user;
       commit;`,
    );
  }

  const all = [s.entryDuring, s.entryDuring2, s.entryPaused, s.entryOther, s.entryPersonal, s.entryAfter];
  expect(await readable(O, all), "A keeps only the entries recorded during the employment").toEqual(
    [s.entryDuring, s.entryDuring2, s.entryPaused].sort(),
  );
  expect((await readable(W, all)).length, "W still reads every one of their entries").toBe(all.length);

  // Writes: nothing historical changes through A any more.
  const before = sql<{ title: string; hours: string; status: string }>(
    `select title, hours_numeric::text as hours, status from public.journal_entry_work_items where id = ${lit(s.workItem)}`,
  )[0];
  const patch = await rest(O, `journal_entry_work_items?id=eq.${s.workItem}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ title: "rewritten by the former employer", hours_numeric: 1, status: "rejected" }),
  });
  expect(patch.ok ? ((await patch.json()) as unknown[]).length : 0, "A's update reaches no work item").toBe(0);
  expect(
    sql<{ title: string; hours: string; status: string }>(
      `select title, hours_numeric::text as hours, status from public.journal_entry_work_items where id = ${lit(s.workItem)}`,
    )[0],
    "the work item is unchanged",
  ).toEqual(before);

  const metric = await rest(O, "journal_entry_metrics", {
    method: "POST",
    body: JSON.stringify({ entry_id: s.entryDuring, metric_slug: "skill_rejected", value_text: "x", source: "manager_corrected" }),
  });
  expect(metric.status, "A cannot add a metric to the historical entry (row-level security)").toBe(403);

  const review = await rpc<string>(O, "set_engagement_journal_review", { p_engagement_id: s.ecA, p_enabled: true });
  expect(review.body, "review cannot be switched back on for an ended employment").toBe("engagement_not_active");
  expect(
    sql<{ review: boolean | null }>(`select journal_review_enabled as review from public.engagement_contexts where id = ${lit(s.ecA)}`)[0]?.review,
  ).not.toBe(true);

  const ownerCtx = sql<{ id: string }>(
    `select id from public.engagement_contexts where profile_id = ${lit(s.oId)} and organization_id = ${lit(s.orgA)} and status = 'active' limit 1`,
  )[0]?.id;
  const confirm = await rest(O, "journal_entry_confirmations", {
    method: "POST",
    body: JSON.stringify({
      entry_id: s.entryDuring,
      confirmer_id: s.oId,
      confirmer_engagement_context_id: ownerCtx,
      confirmer_role: "manager",
      confirmation_scope: { decision: "confirmed" },
    }),
  });
  // Pinned, not new: the guard trigger already refuses (review is off after
  // the end); this migration adds the same refusal to the insert policy.
  expect(confirm.ok, `A cannot confirm an entry of the ended employment (${confirm.status})`).toBe(false);

  const editEntry = await rest(O, `journal_entries?id=eq.${s.entryDuring}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ original_text: "rewritten" }),
  });
  expect(editEntry.ok ? ((await editEntry.json()) as unknown[]).length : 0, "A cannot rewrite the entry").toBe(0);
  const drop = await rest(O, `journal_entries?id=eq.${s.entryDuring}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  expect(drop.ok ? ((await drop.json()) as unknown[]).length : 0, "A cannot delete the entry").toBe(0);

  // Nothing was deleted: the entry and its text are as W recorded them.
  expect(
    sql<{ text: string; n: number }>(
      `select original_text as text, (select count(*)::int from public.journal_entries where worker_id = ${lit(s.workerId)}) as n
         from public.journal_entries where id = ${lit(s.entryDuring)}`,
    )[0],
    "the historical entry is intact and nothing was removed",
  ).toEqual({ text: TEXT.during, n: all.length });

  // R2 P2-1: an ended employment whose review switch was left ON (the
  // 2026-09-23 consolidation ended engagements that way) decides nothing. The
  // end door switches review off, so the walk sets it back on in the
  // throwaway database (a second seeded step) and calls the review door.
  sqlExec(`update public.engagement_contexts set journal_review_enabled = true where id = ${lit(s.ecA)}`);
  const late2 = await rpc<string>(O, "review_journal_entry", { p_entry_id: s.entryDuring2, p_decision: "approved", p_note: null });
  expect(late2.body, "an ended employment with review left on decides nothing").not.toBe("approved");
  expect(
    sql<{ n: number }>(
      `select count(*)::int as n from public.journal_entry_confirmations where entry_id = ${lit(s.entryDuring2)}`,
    )[0]?.n,
    "no confirmation is recorded on the historical entry",
  ).toBe(0);
  const queue = await rpc<string[]>(O, "reviewable_journal_entry_ids", {});
  expect(queue.body ?? [], "the ended employment's entries are not in A's review queue").not.toContain(s.entryDuring2);
  // The entry A confirmed while employed keeps its confirmation (retained history).
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.journal_entry_confirmations where entry_id = ${lit(s.entryDuring)}`)[0]?.n,
    "the confirmation made during the employment is kept",
  ).toBe(1);

  // B, still W's employer, is unaffected.
  expect(await readable(P, all), "B still reads its own entry").toEqual([s.entryOther]);
});

/** W edits or corrects one of their entries through the journal's own door. */
async function correct(oldId: string, text: string, engagementId: string = s.ecA): Promise<{ status: number; id: string | null }> {
  const r = await rpc<string | { message?: string }>(W, "journal_entry_supersede_v2", {
    p_old_entry_id: oldId,
    p_engagement_context_id: engagementId,
    p_entry_type_slug: "freeform",
    p_profession_id: null,
    p_original_text: text,
    p_original_language: "en",
    p_hash_self: "client",
    p_visibility_scope: "closed",
    p_metrics: [],
    p_selected_slugs: [],
    p_rejected_slugs: [],
  });
  return { status: r.status, id: typeof r.body === "string" ? r.body : null };
}

/** The one seeded clock step: a row W writes today is moved two days on, past the end date. */
function afterTheEnd(id: string): void {
  sqlExec(
    `begin;
     alter table public.journal_entries disable trigger user;
     update public.journal_entries set created_at = created_at + interval '2 days' where id = ${lit(id)};
     alter table public.journal_entries enable trigger user;
     commit;`,
  );
}

test("FE-3. after the end, W corrects two retained records: the corrections stay with A beside their originals, traceable; the unrelated late entry does not", async () => {
  // The originals as stored before any correction: text, author, time, hash.
  const snapshot = () =>
    sql<{ id: string; original_text: string; worker_id: string; created_at: string; hash_self: string }>(
      `select id, original_text, worker_id, created_at::text as created_at, hash_self
         from public.journal_entries where id in (${[s.entryDuring, s.entryDuring2].map(lit).join(",")}) order by id`,
    );
  const before = snapshot();
  expect(before).toHaveLength(2);

  // An unconfirmed retained entry: a superseding edit.
  const edited = await correct(s.entryDuring2, `${TEXT.during2} (corrected after the end)`);
  expect(edited.id, `W edits a retained entry (${edited.status})`).toBeTruthy();
  afterTheEnd(edited.id!);
  // A confirmed retained entry: a correction that keeps the confirmed original.
  const corrected = await correct(s.entryDuring, `${TEXT.during} (corrected after the end)`);
  expect(corrected.id, `W corrects a confirmed retained entry (${corrected.status})`).toBeTruthy();
  afterTheEnd(corrected.id!);

  const ids = [s.entryDuring, s.entryDuring2, s.entryPaused, edited.id!, corrected.id!, s.entryAfter, s.entryOther, s.entryPersonal];
  expect(await readable(O, ids), "W's corrections of retained records stay with A, beside their originals").toEqual(
    [s.entryDuring, s.entryDuring2, s.entryPaused, edited.id!, corrected.id!].sort(),
  );

  const rows = sql<{ id: string; superseded_by: string | null; correction_of: string | null; worker_id: string; late: boolean }>(
    `select id, superseded_by, correction_of, worker_id,
            created_at > (select (ended_at + 1)::timestamp at time zone 'UTC' from public.engagement_contexts where id = ${lit(s.ecA)}) as late
       from public.journal_entries where id in (${[s.entryDuring, s.entryDuring2, edited.id!, corrected.id!].map(lit).join(",")})`,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  expect(
    {
      editPointsBack: byId.get(s.entryDuring2)?.superseded_by,
      correctionPointsBack: byId.get(corrected.id!)?.correction_of,
      confirmedOriginalStaysCurrent: byId.get(s.entryDuring)?.superseded_by,
      authors: [...new Set(rows.map((r) => r.worker_id))],
      correctionsAfterTheEnd: [byId.get(edited.id!)?.late, byId.get(corrected.id!)?.late],
    },
    "each correction is traceable to its original, its author and its time",
  ).toEqual({
    editPointsBack: edited.id,
    correctionPointsBack: s.entryDuring,
    confirmedOriginalStaysCurrent: null,
    authors: [s.workerId],
    correctionsAfterTheEnd: [true, true],
  });
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.journal_entry_confirmations where entry_id = ${lit(s.entryDuring)}`)[0]?.n,
    "the original's confirmation is kept",
  ).toBe(1);

  expect(snapshot(), "the original's text, author, time and hash are unchanged by its corrections").toEqual(before);
  // A reads each original and each correction with its author and time.
  const seen = await rest(
    O,
    `journal_entries?id=in.(${[s.entryDuring, s.entryDuring2, edited.id!, corrected.id!].join(",")})&select=id,worker_id,created_at,correction_of`,
  );
  expect(seen.ok).toBe(true);
  const seenRows = (await seen.json()) as Array<{ id: string; worker_id: string; created_at: string; correction_of: string | null }>;
  expect(seenRows.map((r) => r.id).sort(), "A reads both originals and both corrections").toEqual(
    [s.entryDuring, s.entryDuring2, edited.id!, corrected.id!].sort(),
  );
  expect(new Set(seenRows.map((r) => r.worker_id)), "A sees W as the author of every version").toEqual(new Set([s.workerId]));
  expect(seenRows.every((r) => !!r.created_at), "A sees each version's time").toBe(true);
  expect(seenRows.find((r) => r.id === corrected.id)?.correction_of, "A sees which original the correction corrects").toBe(s.entryDuring);
  s.edited = edited.id!;
  s.corrected = corrected.id!;

  // Still no change and no re-confirmation by A after the end, on the corrections too.
  const reconfirm = await rpc<string>(O, "review_journal_entry", { p_entry_id: corrected.id!, p_decision: "approved", p_note: null });
  expect(reconfirm.body, "A cannot re-confirm a correction after the end").not.toBe("approved");
  expect(
    sql<{ n: number }>(`select count(*)::int as n from public.journal_entry_confirmations where entry_id = ${lit(corrected.id!)}`)[0]?.n,
  ).toBe(0);
});

test("FE-4. after the end, W moves a personal record and B's record into the ended context for A: neither the moved copies nor their originals reach A (R2 P3-1)", async () => {
  // Both originals were filed DURING the employment, so a chain walk that left
  // the context would date them before the end and hand them to A.
  const movedPersonal = await correct(s.entryPersonal, `${TEXT.personal} (moved under A after the end)`);
  expect(movedPersonal.id, `W moves the personal record under A (${movedPersonal.status})`).toBeTruthy();
  afterTheEnd(movedPersonal.id!);
  const movedOther = await correct(s.entryOther, `${TEXT.other} (moved under A after the end)`);
  expect(movedOther.id, `W moves B's record under A (${movedOther.status})`).toBeTruthy();
  afterTheEnd(movedOther.id!);

  const ids = [s.entryPersonal, s.entryOther, movedPersonal.id!, movedOther.id!];
  expect(
    await readable(O, ids),
    "a personal or another organization's record moved into the ended context after the end stays out of A's reach",
  ).toEqual([]);
  // Positive control: A's own retained history is still there.
  expect(await readable(O, [s.entryDuring]), "A still reads its retained entry").toEqual([s.entryDuring]);
  // The person keeps everything, originals included.
  expect(await readable(W, ids), "W still reads the moved copies and their originals").toEqual([...ids].sort());
});

test("FE-5. a correction of a historical record stays in the employment's context: an edit into the personal journal is refused, a correction of a confirmed record lands under A (owner 2026-11-18, R2 P3-4)", async () => {
  expect(s.edited && s.corrected && s.ecPersonal, "FE-3 left an edit and a correction").toBeTruthy();
  const count = () => sql<{ n: number }>(`select count(*)::int as n from public.journal_entries where worker_id = ${lit(s.workerId)}`)[0]?.n;
  const rowsBefore = count();

  // An unconfirmed historical record cannot be edited into another context: the whole edit rolls back.
  const refused = await correct(s.edited, `${TEXT.during2} (moved to the personal journal)`, s.ecPersonal);
  expect(refused.id, `the edit into the personal journal is refused (${refused.status})`).toBeNull();
  expect(count(), "an edit of a historical record into the personal journal is refused, and nothing is written").toBe(rowsBefore);
  expect(
    sql<{ superseded_by: string | null }>(`select superseded_by from public.journal_entries where id = ${lit(s.edited)}`)[0]?.superseded_by,
    "the record stays current",
  ).toBeNull();

  // A correction carrying a confirmed original is created in that original's context, whatever was asked.
  const kept = await correct(s.corrected, `${TEXT.during} (second correction, asked for the personal journal)`, s.ecPersonal);
  expect(kept.id, `W corrects the correction (${kept.status})`).toBeTruthy();
  const row = sql<{ engagement_context_id: string; correction_of: string | null }>(
    `select engagement_context_id, correction_of from public.journal_entries where id = ${lit(kept.id!)}`,
  )[0];
  expect(row, "the correction is stored in A's context and still points at the confirmed original").toEqual({
    engagement_context_id: s.ecA,
    correction_of: s.entryDuring,
  });
  afterTheEnd(kept.id!);
  expect(
    await readable(O, [kept.id!]),
    "a correction of a confirmed historical record stays in the employment's context, and A reads it",
  ).toEqual([kept.id!]);
});
