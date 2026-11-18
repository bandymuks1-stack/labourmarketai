import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "./prod-walk";
import { bearerOf, qaApi } from "./prod-qa-api";
import { assertSyntheticAddress, imapConfigured, nextUid, waitForMailLink } from "./prod-qa-imap";

/**
 * PRODUCTION — THE INVITED WORKER WHO REGISTERS WITHOUT THE LINK (owner
 * decision 2026-10-28; the path the first real referred person took; owner
 * D-5 approval 2026-11-01).
 *
 * Runs only in `.github/workflows/prod-qa-walk.yml` (spec=invited-worker),
 * signed in to `qa.invited@labourmarket.ai`, and only when the owner's
 * read-only synthetic QA mailbox (D-4, `prod-qa-imap.ts`) is configured. The
 * owner's `prod-qa-invited-provision.yml` stored ONE synthetic partner
 * referral addressed to it (`QA-SYNTHETIC-invited-mbx1`) and created the
 * account (confirmed, passwordless, no role). The walk never creates either,
 * and it arrives at the site WITHOUT `?next=/invite/<token>` — the token was
 * discarded at provisioning, exactly like a person who opened the mail
 * elsewhere.
 *
 * An account created after the e-mail cutover (migration
 * 20261003151000_email_verified_boundary_v1) is UNVERIFIED until it proves its
 * mailbox, and until then no invitation addressed to it is shown or accepted —
 * the fail-closed boundary that stops someone claiming another person's
 * invitation. The walk proves the address the way a person does (the mailed
 * one-time link, read from the QA mailbox) and never writes a verification
 * itself.
 *
 *   I-0  API: before the proof the invitation is hidden (`email_unverified`),
 *        and an anonymous caller is refused;
 *   I-1  390 px phone: onboarding from the place a new person lands;
 *   I-2  390 px phone: the network page asks for the mailbox proof → the mail
 *        arrives in the QA mailbox → its link proves the address → exactly one
 *        join_platform invitation is now the person's;
 *   I-3  390 px phone: the person accepts it on the network page; API: it is no
 *        longer pending, accepting it again answers `already_accepted`, an
 *        unknown invitation answers `not_found`, and the role is worker;
 *   I-4  1280 desktop: the first Work Journal entry reaches the Living CV with
 *        the exact hours the person's own journal holds;
 *   I-5  768 tablet + 390 phone: home and Living CV never scroll sideways;
 *   I-6  390 phone: the person asks to delete the account and confirms it
 *        with a sign-in from the last 15 minutes (the mailed link above).
 *
 * Only synthetic text (QA-SYNTHETIC). Clean-up goes through the platform's own
 * erasure (I-6 → the system erasure runner), because a Work Journal entry is
 * append-only evidence that only the sanctioned erasure path may remove — a
 * plain SQL delete of the account is refused by the journal guard. When an
 * earlier step failed, afterAll requests and confirms the same deletion: on
 * the privacy page when the person can reach it, otherwise through the same
 * two database functions the page calls — an account without a role is sent
 * to onboarding and never sees the privacy page. Both paths act only on the
 * session whose signed e-mail is exactly the synthetic address. Erasure keeps
 * the invitation (pseudonymised); the owner removes that one synthetic row
 * with docs/qa/invited-worker-invitation-cleanup.sql, then
 * docs/qa/invited-worker-orphans.sql checks nothing is left.
 */
const ADDRESS = "qa.invited@labourmarket.ai";
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SLOT = "invited";
const state = resolve(__dirname, `.storage-state.prod-qa.${SLOT}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1" && existsSync(state) && imapConfigured();
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with the owner-created invited worker and the QA mailbox (owner D-4)");
test.describe.configure({ mode: "serial", timeout: 420_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };
const NAME = "QA-SYNTHETIC Pakviestas darbuotojas";
const ENTRY = `[QA-SYNTHETIC] Šiandien sumūrijau 6 m² sienos, 7 val. (${RUN})`;
const inMain = (page: Page): Locator => page.getByRole("main");

// The mailed link may point at the site's callback or at the auth server's
// verify endpoint; nothing else is followed.
const TRUSTED_HOSTS = [process.env.E2E_BASE_URL, process.env.PROD_QA_SUPABASE_URL]
  .filter((v): v is string => Boolean(v))
  .map((v) => new URL(v).host);
const PROOF_LINK = (u: string) => {
  let host = "";
  try {
    host = new URL(u).host;
  } catch {
    return false;
  }
  return TRUSTED_HOSTS.includes(host) && /verify|callback|token/.test(u);
};

type Invitation = { id: string; invitation_type: string };

function claims(): { sub: string; email?: string } {
  const token = bearerOf(SLOT);
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { sub: string; email?: string };
}
const subOf = (): string => claims().sub;

/**
 * The mailed one-time link signs the browser in with a NEW session that no
 * storage-state file records, so the workflow's session clean-up cannot see
 * it. Revoke it here (`scope=local`: only that session), after checking it is
 * the synthetic person's, issued by production, and not the minted session the
 * later steps use.
 */
async function revokeMailedLinkSession(ctx: BrowserContext): Promise<void> {
  const raw = (await ctx.cookies())
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .map((c) => c.value)
    .join("");
  if (!raw) return;
  const b64 = raw.startsWith("base64-") ? raw.slice(7) : raw;
  const token = (JSON.parse(Buffer.from(b64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { access_token?: string })
    .access_token;
  if (!token) return;
  type Claims = { email?: string; session_id?: string; iss?: string };
  const decode = (t: string) => JSON.parse(Buffer.from(t.split(".")[1] ?? "", "base64url").toString("utf8")) as Claims;
  const mailed = decode(token);
  const minted = decode(bearerOf(SLOT));
  if (mailed.email !== ADDRESS || mailed.iss !== minted.iss) throw new Error("the browser session is not the synthetic person's");
  if (!mailed.session_id || mailed.session_id === minted.session_id) return;
  const res = await qaApi("/auth/v1/logout?scope=local", token, { method: "POST" });
  console.info(`[invited] mailed-link session revoked: ${res.status}`);
  expect([204, 401, 403], "the mailed-link session is revoked").toContain(res.status);
}

/** Every clean-up path acts only on the synthetic person's own session. */
function assertSyntheticSession(): void {
  assertSyntheticAddress(ADDRESS);
  if ((claims().email ?? "").toLowerCase() !== ADDRESS) throw new Error("refused: the walk session is not the synthetic invited worker");
}

async function invitationsForMe(): Promise<{ items: Invitation[]; unverified: boolean }> {
  const r = await qaApi("/rest/v1/rpc/list_invitations_for_me_v1", bearerOf(SLOT), { method: "POST", body: {} });
  expect(r.status, "my invitations answered").toBe(200);
  const body = (await r.json()) as { items?: Invitation[]; email_unverified?: boolean };
  return { items: body.items ?? [], unverified: body.email_unverified === true };
}

async function acceptById(id: string): Promise<string> {
  const r = await qaApi("/rest/v1/rpc/accept_invitation_by_id_v2", bearerOf(SLOT), { method: "POST", body: { p_invitation_id: id } });
  expect(r.status, "accepting answered").toBe(200);
  return String(((await r.json()) as { outcome?: string }).outcome ?? "");
}

async function ownJournalHours(): Promise<{ entries: number; hours: number }> {
  const token = bearerOf(SLOT);
  const w = await qaApi(`/rest/v1/workers?select=id&profile_id=eq.${encodeURIComponent(subOf())}`, token);
  expect(w.status).toBe(200);
  const [worker] = (await w.json()) as { id: string }[];
  expect(worker, "the person has a worker row").toBeTruthy();
  const r = await qaApi(
    `/rest/v1/journal_entries?select=id,journal_entry_metrics(metric_slug,value_numeric,unit_slug)&worker_id=eq.${worker.id}`,
    token,
  );
  expect(r.status).toBe(200);
  const rows = (await r.json()) as { journal_entry_metrics: { metric_slug: string; value_numeric: number | null; unit_slug: string | null }[] }[];
  let hours = 0;
  for (const e of rows) {
    for (const m of e.journal_entry_metrics ?? []) {
      if (m.metric_slug === "fragment_time" && m.unit_slug === "hours") hours += Number(m.value_numeric ?? 0);
    }
  }
  return { entries: rows.length, hours };
}

async function open(browser: Browser, viewport: { width: number; height: number }, mobile: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    storageState: state,
    locale: "lt-LT",
    viewport,
    ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
}

async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  console.info(`[invited] ${where}: scrollWidth=${scroll} innerWidth=${inner}`);
  expect(scroll, `${where} is wider than the viewport`).toBeLessThanOrEqual(inner + 1);
}

test("I-0. API: before the mailbox proof the invitation is hidden, and an anonymous caller is refused", async () => {
  const before = await invitationsForMe();
  console.info(`[invited] before the proof: unverified=${before.unverified} visible=${before.items.length}`);
  expect(before.unverified, "a new account starts unverified (fail-closed boundary)").toBe(true);
  expect(before.items, "no invitation is shown to an unproved address").toHaveLength(0);
  const anon = await qaApi("/rest/v1/rpc/list_invitations_for_me_v1", null, { method: "POST", body: {} });
  console.info(`[invited] anonymous call answered ${anon.status}`);
  expect(anon.status, "an anonymous caller cannot list invitations").not.toBe(200);
});

test("I-1. 390 px: onboarding WITHOUT the link, from where a new person lands", async ({ browser }) => {
  const { ctx, page } = await open(browser, PHONE, true);
  try {
    // The synthetic referral is Lithuanian (locale lt), so the person arrives on
    // the LT site: the wizard's country list is then labelled in Lithuanian
    // ("Lietuva"). From /en it would read "Lithuania" (review on #2847).
    await page.goto("/lt/dashboard");
    await settle(page);
    const url = new URL(page.url());
    console.info(`[invited] landed on ${url.pathname}${url.search}`);
    expect(url.pathname, "a new account lands on onboarding").toMatch(/\/onboarding$/);
    expect(url.searchParams.get("next") ?? "", "the walk carries no invitation link").not.toMatch(/\/invite\//);
    const t0 = Date.now();
    const roleAsked = await page.getByTestId("onboarding-intent-work").isVisible().catch(() => false);
    console.info(`[invited] role question asked=${roleAsked}`);
    if (roleAsked) {
      await page.getByTestId("onboarding-intent-work").click();
      await page.getByTestId("onboarding-intents-continue").click();
    }
    await expect(page.getByTestId("onboarding-display-name")).toBeVisible();
    await page.getByTestId("onboarding-display-name").fill(NAME);
    await page.getByTestId("onboarding-country").click();
    await page.getByTestId("onboarding-country-field").locator('input:not([type="hidden"])').first().fill("Liet");
    await page.getByRole("option", { name: /^Lietuva$/ }).first().click();
    const profession = page.getByTestId("onboarding-profession-input");
    if (await profession.isVisible().catch(() => false)) {
      await profession.fill("Mūrinink");
      const suggestion = page.getByTestId("onboarding-profession-suggestions").getByRole("button").first();
      if (await suggestion.isVisible().catch(() => false)) await suggestion.click();
      else await page.getByTestId("onboarding-profession-add").click();
    }
    await expectNoSidewaysScroll(page, "onboarding (390)");
    await page.getByTestId("onboarding-submit").click();
    await page.waitForURL((u) => !/\/onboarding/.test(u.pathname), { timeout: 60_000 });
    await settle(page);
    console.info(`[invited] onboarding done in ${Math.round((Date.now() - t0) / 1000)} s → ${new URL(page.url()).pathname}`);
  } finally {
    await ctx.close();
  }
});

test("I-2. 390 px: the mailed one-time link proves the address, and the invitation becomes the person's", async ({ browser }) => {
  assertSyntheticAddress(ADDRESS);
  const { ctx, page } = await open(browser, PHONE, true);
  try {
    await page.goto("/lt/dashboard/network");
    await settle(page);
    const prompt = inMain(page).getByTestId("network-email-unverified").getByTestId("verify-email-prompt");
    await expect(prompt, "the network page asks for the mailbox proof").toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "network, proof prompt (390)");
    const since = await nextUid();
    await prompt.getByTestId("verify-email-send").click();
    await expect(prompt.getByTestId("verify-email-sent").or(prompt.getByTestId("verify-email-failed"))).toBeVisible({ timeout: 30_000 });
    expect(await prompt.getByTestId("verify-email-failed").isVisible(), "the proof mail was refused").toBe(false);
    const mail = await waitForMailLink(ADDRESS, since, PROOF_LINK);
    console.info(`[invited] proof mail arrived after ~${mail.seconds} s`);
    let opened = true;
    try {
      await page.goto(mail.link);
      await page.waitForURL((u) => TRUSTED_HOSTS.includes(u.host) && /\/dashboard|\/lt\b/.test(u.pathname), { timeout: 60_000 });
      await settle(page);
    } catch {
      opened = false;
    }
    if (!opened) throw new Error("the mailed link did not bring the person back to the site (URL withheld: it carries a token)");
    const v = await qaApi("/rest/v1/rpc/my_email_verification_v1", bearerOf(SLOT), { method: "POST", body: {} });
    expect(v.status).toBe(200);
    const verified = ((await v.json()) as { verified?: boolean }).verified === true;
    console.info(`[invited] address verified=${verified}`);
    expect(verified, "the mailed link proved the address").toBe(true);
    const after = await invitationsForMe();
    const joinPlatform = after.items.filter((i) => i.invitation_type === "join_platform");
    console.info(`[invited] after the proof: unverified=${after.unverified} visible=${after.items.length} join_platform=${joinPlatform.length}`);
    expect(after.unverified).toBe(false);
    expect(joinPlatform, "the owner's synthetic referral is now the person's").toHaveLength(1);
  } finally {
    try {
      await revokeMailedLinkSession(ctx);
    } finally {
      await ctx.close();
    }
  }
});

test("I-3. 390 px: the person accepts the invitation; a second accept and an unknown one are refused", async ({ browser }) => {
  const [invitation] = (await invitationsForMe()).items.filter((i) => i.invitation_type === "join_platform");
  expect(invitation, "the invitation is waiting").toBeTruthy();
  const { ctx, page } = await open(browser, PHONE, true);
  try {
    await page.goto("/lt/dashboard/network");
    await settle(page);
    const row = inMain(page).getByTestId(`incoming-invitation-${invitation.id}`);
    await expect(row, "the network page lists the invitation").toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "network, incoming invitation (390)");
    await row.getByTestId(`incoming-invitation-accept-${invitation.id}`).click();
    await expect(inMain(page).getByTestId("incoming-invitations-notice")).toBeVisible({ timeout: 30_000 });
  } finally {
    await ctx.close();
  }
  const stillPending = (await invitationsForMe()).items.filter((i) => i.invitation_type === "join_platform").length;
  console.info(`[invited] join_platform still pending after accepting=${stillPending}`);
  expect(stillPending, "the invitation was accepted").toBe(0);
  const again = await acceptById(invitation.id);
  const unknown = await acceptById("00000000-0000-4000-8000-000000000000");
  console.info(`[invited] second accept=${again} unknown invitation=${unknown}`);
  expect(again, "an accepted invitation cannot be used again").toBe("already_accepted");
  expect(unknown, "an invitation that is not the person's is refused").toBe("not_found");
  const p = await qaApi(`/rest/v1/profiles?select=active_role,onboarded_at&id=eq.${encodeURIComponent(subOf())}`, bearerOf(SLOT));
  expect(p.status).toBe(200);
  const [profile] = (await p.json()) as { active_role: string | null; onboarded_at: string | null }[];
  console.info(`[invited] profile active_role=${profile?.active_role} onboarded=${Boolean(profile?.onboarded_at)}`);
  expect(profile?.active_role).toBe("worker");
  expect(profile?.onboarded_at).toBeTruthy();
});

test("I-4. 1280: the first Work Journal entry reaches the Living CV with the person's exact hours", async ({ browser }) => {
  const { ctx, page } = await open(browser, DESKTOP, false);
  try {
    await page.goto("/lt/dashboard/journal");
    await settle(page);
    await inMain(page).getByTestId("journal-quick-record-text").fill(ENTRY);
    await inMain(page).getByTestId("journal-quick-record-understand").click();
    await expect(inMain(page).getByTestId("worklog-flow")).toBeVisible({ timeout: 30_000 });
    const done = inMain(page).getByTestId("worklog-done");
    const failed = inMain(page).getByTestId("worklog-error").or(inMain(page).getByTestId("worklog-blocked"));
    for (const id of ["worklog-save", "worklog-confirm"]) {
      if (await done.isVisible().catch(() => false)) break;
      const button = inMain(page).getByTestId(id);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await expect(done.or(failed).or(inMain(page).getByTestId("worklog-confirm"))).toBeVisible({ timeout: 30_000 });
      }
    }
    await expect(done.or(failed)).toBeVisible({ timeout: 30_000 });
    expect(await failed.isVisible(), "the journal entry was refused").toBe(false);
    const db = await ownJournalHours();
    await done.getByTestId("worklog-living-cv-link").click();
    await page.waitForURL(/\/cv/, { timeout: 30_000 });
    await settle(page);
    const recorded = (await page.getByTestId("cv-recorded-hours").filter({ visible: true }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const m = /Užfiksuota darbo: ([\d.,]+) val\..*patvirtinta ([\d.,]+) val/.exec(recorded);
    console.info(`[invited] DB: entries=${db.entries} hours=${db.hours} | CV: recorded=${m?.[1] ?? "?"} confirmed=${m?.[2] ?? "?"}`);
    expect(m, "the Living CV states recorded and confirmed hours").not.toBeNull();
    expect(Number(m![1].replace(",", "."))).toBe(db.hours);
    expect(Number(m![2].replace(",", "."))).toBe(0);
  } finally {
    await ctx.close();
  }
});

test("I-5. 768 tablet and 390 phone: home and Living CV never scroll sideways", async ({ browser }) => {
  for (const [label, viewport, mobile] of [["768", TABLET, true], ["390", PHONE, true]] as const) {
    const { ctx, page } = await open(browser, viewport, mobile);
    try {
      await page.goto("/lt/dashboard");
      await settle(page);
      await expectNoSidewaysScroll(page, `worker home (${label})`);
      await page.goto("/lt/cv");
      await settle(page);
      await expectNoSidewaysScroll(page, `Living CV (${label})`);
    } finally {
      await ctx.close();
    }
  }
});

/** Requests and confirms the synthetic person's account deletion on a phone,
 *  so the system erasure runner removes the account. Returns false when the
 *  confirmation window has passed (the owner then confirms by hand). */
async function deleteOwnAccount(browser: Browser): Promise<boolean> {
  assertSyntheticSession();
  const { ctx, page } = await open(browser, PHONE, true);
  try {
    await page.goto("/lt/dashboard/privacy#privacy-deletion");
    await settle(page);
    const section = page.getByTestId("privacy-deletion");
    await expect(section, "the deletion section is on the privacy page").toBeVisible({ timeout: 30_000 });
    if (await section.getByTestId("privacy-deletion-confirmed").isVisible().catch(() => false)) return true;
    if (await section.getByTestId("privacy-deletion-submit").isVisible().catch(() => false)) {
      await section.getByTestId("privacy-deletion-confirm").check();
      await section.getByTestId("privacy-deletion-submit").click();
      // The submitted note is transient: the page refreshes into the
      // confirmation step as soon as it reads the open request.
      await expect(
        section.getByTestId("privacy-deletion-submitted").or(section.getByTestId("privacy-deletion-confirm-step")),
      ).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await settle(page);
    }
    // The confirmation needs a sign-in from the last 15 minutes; a re-auth
    // door instead means the walk outlasted it.
    const final = section.getByTestId("privacy-deletion-confirm-final");
    const reauth = section.getByTestId("privacy-deletion-reauth");
    await expect(final.or(reauth), "the confirmation step is shown").toBeVisible({ timeout: 30_000 });
    if (await reauth.isVisible()) return false;
    await final.click();
    await expect(section.getByTestId("privacy-deletion-confirmed")).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page, "privacy deletion (390)");
    return true;
  } finally {
    await ctx.close();
  }
}

/** The same deletion through the two functions the privacy page calls, for an
 *  account the page cannot reach (no role yet: it is sent to onboarding).
 *  Acts only on the synthetic person's own session; nothing else is touched. */
async function deleteOwnAccountByApi(): Promise<"confirmed" | "reauth_required" | "failed"> {
  assertSyntheticSession();
  const token = bearerOf(SLOT);
  const submitted = await qaApi("/rest/v1/rpc/submit_privacy_request_v1", token, {
    method: "POST",
    body: { p_request_type: "account_deletion", p_note: `QA-SYNTHETIC walk clean-up (${RUN})` },
  });
  // An open deletion request from an earlier attempt answers too_many_open; the
  // confirmation below then confirms that one.
  if (submitted.status !== 200 && !/too_many_open/.test(await submitted.text())) return "failed";
  const confirmed = await qaApi("/rest/v1/rpc/privacy_confirm_account_deletion_v1", token, { method: "POST", body: {} });
  if (confirmed.status !== 200) return "failed";
  const body = (await confirmed.json()) as { ok?: boolean; error?: string };
  return body.ok ? "confirmed" : body.error === "reauth_required" ? "reauth_required" : "failed";
}

let deletionConfirmed = false;

test("I-6. 390 phone: the person deletes the account through the privacy page (the walk's clean-up)", async ({ browser }) => {
  deletionConfirmed = await deleteOwnAccount(browser);
  expect(deletionConfirmed, "the walk's sign-in is older than the confirmation window").toBe(true);
  console.info("[invited] I-6 account deletion requested and confirmed; the erasure runner removes the account");
});

// A serial suite skips I-6 after any earlier failure — exactly the runs that
// most need the clean-up — so the deletion is also requested here, always.
test.afterAll(async ({ browser }) => {
  if (deletionConfirmed) return;
  test.setTimeout(180_000);
  try {
    deletionConfirmed = await deleteOwnAccount(browser);
  } catch {
    deletionConfirmed = false;
  }
  if (deletionConfirmed) {
    console.info("[invited] clean-up: account deletion confirmed on the privacy page");
    return;
  }
  try {
    const outcome = await deleteOwnAccountByApi();
    deletionConfirmed = outcome === "confirmed";
    console.info(`[invited] clean-up through the privacy functions: ${outcome}`);
  } catch {
    console.info("[invited] clean-up: the account deletion could not be requested; the owner confirms it by hand");
  }
});
