import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, type Browser, type BrowserContext, type Page } from "./prod-walk";

import { bearerOf, qaApi, qaServiceAddParticipants, qaStorage, subOf } from "./prod-qa-api";

/**
 * PRODUCTION — A PERSON REMOVED FROM A THREAD LOSES IT AT ONCE (P0 chat
 * privacy, owner scenario 2026-11-11, PR #3224). Ten steps, all synthetic:
 *
 *   1  A (QA owner) creates a private synthetic thread with B (QA worker) and
 *      C (QA second worker);
 *   2  A sends message 1 WITH an attachment, through the real composer;
 *   3  B and C read message 1 and its attachment; both hold a bell row;
 *   4  A removes C (the creator's `revoke_conversation_participant`);
 *   5  A sends message 2 through the real composer;
 *   6  B reads message 2;
 *   7  C cannot read the thread, any message or any attachment (row or file);
 *   8  C gets no new bell row; e-mail and push are reported, never assumed;
 *   9  C's old bell is not an active link, and the old URL shows the honest
 *      "no longer available" notice instead of the thread;
 *  10  C cannot re-add or un-revoke itself, nor add someone to read for it.
 *
 * HOW THE THREAD IS MADE. No product door opens a three-person thread (every
 * door is a gated two-person thread), so A creates the thread and its own
 * participant row with A's OWN token, and B and C are added through the one
 * service-role write a walk may make (`qaServiceAddParticipants`): exactly the
 * insert the app's server performs, refused for anything but synthetic
 * identities on a thread the synthetic creator owns. Both messages go through
 * the browser, so the real send path and the real alert fan-out run.
 *
 * CHANNELS NOT ACTIVE IN PRODUCTION ARE "NOT TESTED", never PASS: e-mail
 * (chat e-mail is off by default and the QA worker has no mailbox here) and
 * push (behind a flag and a device subscription). The bell check is
 * conclusive only when message 2 lands in a NEW 30-minute coalescing window
 * (`lib/notifications/message-coalescing.ts`); the walk waits for the next
 * window when it is at most 12 minutes away, and otherwise reports the bell
 * step NOT TESTED with that reason. Dispatch between :18-:30 or :48-:00 UTC
 * for a conclusive run.
 *
 * CLEANUP. A deletes the uploaded file (uploader-delete policy), and B and C
 * mark their own bell rows for the thread read. The thread and its messages
 * STAY: no role holds DELETE on the chat tables (append-only by design, and
 * the revocation's audit_logs row must stay too). The walk prints the
 * synthetic thread id; removing it is an owner SQL step:
 *   delete from public.conversations where id = '<id>'
 *     and subject like 'QA-SYNTHETIC %';   -- participants/messages cascade
 * Failure messages carry counts and states only, never message text.
 */
const RUN = process.env.GITHUB_RUN_ID ?? `local${Date.now().toString(36)}`;
const SUBJECT = `QA-SYNTHETIC ${RUN} chat removal walk`;
const MSG1 = `QA-SYNTHETIC ${RUN} message one`;
const MSG2 = `QA-SYNTHETIC ${RUN} message two`;
const WINDOW_MS = 30 * 60 * 1000;
const MAX_WAIT_MS = 12 * 60 * 1000;
const BUCKET = "conversation-attachments";
// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED =
  process.env.PROD_QA_WALK === "1" &&
  (process.env.PROD_QA_SUPABASE_URL ?? "") !== "" &&
  (process.env.PROD_QA_ANON_KEY ?? "") !== "" &&
  (process.env.PROD_QA_SERVICE_ROLE_KEY ?? "") !== "" &&
  ["owner", "worker", "worker2", "manager"].every((s) => existsSync(state(s)));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml with minted QA sessions");
test.describe.configure({ mode: "serial", timeout: 900_000, retries: 0 });
test.use({ actionTimeout: 30_000 });

const notTested = (step: string, why: string) =>
  test.info().annotations.push({ type: "NOT TESTED", description: `${step}: ${why}` });

async function as(browser: Browser, slot: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ storageState: state(slot), locale: "lt-LT" });
  return { ctx, page: await ctx.newPage() };
}

let A = "";
let B = "";
let C = "";
let conv = "";
let attachmentPath = "";
let msg1At = 0;

const bellRows = async (token: string): Promise<number> => {
  const res = await qaApi(
    `/rest/v1/notification_events?select=id&event_type=eq.message_received&metadata->>conversationId=eq.${conv}`,
    token,
  );
  expect(res.status, "own bell rows answered").toBe(200);
  return ((await res.json()) as unknown[]).length;
};
const visibleMessages = async (token: string): Promise<string[]> => {
  const res = await qaApi(`/rest/v1/conversation_messages?select=body&conversation_id=eq.${conv}`, token);
  expect(res.status, "messages answered").toBe(200);
  return ((await res.json()) as { body: string }[]).map((m) => m.body);
};

/** A writes one message (with an optional file) through the real composer. */
async function sendAsA(browser: Browser, body: string, withFile: boolean): Promise<void> {
  const { ctx, page } = await as(browser, "owner");
  await page.goto(`/lt/dashboard/communication/${conv}`);
  const input = page.getByTestId("communication-composer-input");
  await expect(input).toBeVisible({ timeout: 60_000 });
  if (withFile) {
    await page.getByTestId("communication-attachment-input").setInputFiles({
      name: "qa-synthetic.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.locator('[data-testid="communication-attachment-uploaded"]').first()).toBeVisible({
      timeout: 60_000,
    });
  }
  await input.fill(body);
  await page.locator("form", { has: input }).locator('button[type="submit"]').click();
  await expect(page.getByText(body).first()).toBeVisible({ timeout: 60_000 });
  await ctx.close();
}

/** Does the person's bell show a row that links to the thread? */
async function bellLinksToThread(browser: Browser, slot: string): Promise<number> {
  const { ctx, page } = await as(browser, slot);
  await page.goto("/lt/dashboard");
  const bell = page.locator('[data-testid="notification-bell"]:visible').first();
  await expect(bell).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await bell.click();
  await page.waitForTimeout(3_000);
  const n = await page
    .locator(`[data-testid="notification-row"]:visible a[href*="/dashboard/communication/${conv}"]`)
    .count();
  await ctx.close();
  return n;
}

test("1. A creates a private synthetic thread with B and C", async () => {
  const a = bearerOf("owner");
  A = subOf(a);
  B = subOf(bearerOf("worker"));
  C = subOf(bearerOf("worker2"));
  const created = await qaApi("/rest/v1/conversations?select=id", a, {
    method: "POST",
    prefer: "return=representation",
    body: { subject: SUBJECT, kind: "team", created_by: A },
  });
  expect(created.status, "A creates the thread with A's own token").toBe(201);
  conv = ((await created.json()) as { id: string }[])[0]!.id;
  console.info(`[chat-removal] synthetic thread ${conv} (owner SQL cleanup, see the spec header)`);
  const own = await qaApi("/rest/v1/conversation_participants", a, {
    method: "POST",
    body: { conversation_id: conv, profile_id: A, added_by: A },
  });
  expect(own.status, "A adds itself").toBe(201);
  const added = await qaServiceAddParticipants(conv, a, [bearerOf("worker"), bearerOf("worker2")]);
  expect(added.status, "B and C are added the way the server adds them").toBe(201);
});

test("2. A sends message 1 with an attachment through the composer", async ({ browser }) => {
  await sendAsA(browser, MSG1, true);
  msg1At = Date.now();
});

test("3. B and C read message 1 and its attachment, and hold a bell row", async ({ browser }) => {
  for (const slot of ["worker", "worker2"]) {
    const t = bearerOf(slot);
    expect(await visibleMessages(t), `${slot} reads message 1`).toContain(MSG1);
    const att = await qaApi(`/rest/v1/conversation_message_attachments?select=storage_path&conversation_id=eq.${conv}`, t);
    const rows = (await att.json()) as { storage_path: string }[];
    expect(rows.length, `${slot} sees the attachment row`).toBe(1);
    attachmentPath = rows[0]!.storage_path;
    const file = await qaStorage(`/storage/v1/object/authenticated/${BUCKET}/${attachmentPath}`, t);
    expect(file.status, `${slot} downloads the file`).toBe(200);
    await expect.poll(() => bellRows(t), { timeout: 60_000 }).toBeGreaterThan(0);
  }
  expect(await bellLinksToThread(browser, "worker2"), "C's bell links to the thread before removal").toBeGreaterThan(0);
});

test("4. A removes C", async () => {
  const res = await qaApi("/rest/v1/rpc/revoke_conversation_participant", bearerOf("owner"), {
    method: "POST",
    body: { p_conversation_id: conv, p_profile_id: C },
  });
  expect(res.status, "the creator's removal answered").toBe(200);
  expect(await res.json()).toBe("ok");
});

let bellConclusive = false;
let cBellsBefore = 0;
let bBellsBefore = 0;

test("5. A sends message 2 (in a new coalescing window when reachable)", async ({ browser }) => {
  cBellsBefore = await bellRows(bearerOf("worker2"));
  bBellsBefore = await bellRows(bearerOf("worker"));
  const nextWindow = (Math.floor(msg1At / WINDOW_MS) + 1) * WINDOW_MS;
  const wait = nextWindow - Date.now();
  if (wait <= 0) bellConclusive = true;
  else if (wait <= MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, wait + 5_000));
    bellConclusive = true;
  }
  await sendAsA(browser, MSG2, false);
});

test("6. B reads message 2 (and, in a new window, gets a new bell)", async () => {
  const b = bearerOf("worker");
  expect(await visibleMessages(b)).toEqual(expect.arrayContaining([MSG1, MSG2]));
  if (bellConclusive) {
    await expect.poll(() => bellRows(b), { timeout: 60_000 }).toBeGreaterThan(bBellsBefore);
  } else {
    notTested("6 (B's new bell)", "message 2 fell in message 1's 30-minute coalescing window");
  }
});

test("7. C cannot read the thread, any message or any attachment", async () => {
  const c = bearerOf("worker2");
  const thread = await qaApi(`/rest/v1/conversations?select=id&id=eq.${conv}`, c);
  expect(((await thread.json()) as unknown[]).length, "thread row hidden").toBe(0);
  expect(await visibleMessages(c), "no message visible, old or new").toEqual([]);
  const att = await qaApi(`/rest/v1/conversation_message_attachments?select=id&conversation_id=eq.${conv}`, c);
  expect(((await att.json()) as unknown[]).length, "attachment rows hidden").toBe(0);
  const file = await qaStorage(`/storage/v1/object/authenticated/${BUCKET}/${attachmentPath}`, c);
  expect(file.status, "the stored file is not served").not.toBe(200);
});

test("8. C gets no new bell; e-mail and push are reported, not assumed", async () => {
  const after = await bellRows(bearerOf("worker2"));
  if (bellConclusive) {
    expect(after, "no new bell row for C").toBe(cBellsBefore);
  } else {
    expect(after, "no new bell row for C").toBe(cBellsBefore);
    notTested("8 (bell)", "message 2 fell in message 1's coalescing window, so no row would be written for anyone");
  }
  notTested("8 (e-mail)", "chat e-mail is off by default in production and the QA worker has no inbox here");
  notTested("8 (push)", "push is behind a flag and needs a subscribed device");
});

test("9. C's old bell is not an active link; the old URL shows the honest notice", async ({ browser }) => {
  expect(await bellLinksToThread(browser, "worker2"), "no bell row links to the thread").toBe(0);
  const { ctx, page } = await as(browser, "worker2");
  await page.goto(`/lt/dashboard/communication/${conv}`);
  await expect(page).toHaveURL(/\/dashboard\/communication\?notice=unavailable/, { timeout: 60_000 });
  await expect(page.getByTestId("communication-unavailable")).toBeVisible({ timeout: 30_000 });
  const text = await page.locator("body").innerText();
  expect(text.includes(MSG1) || text.includes(MSG2) || text.includes(SUBJECT), "nothing of the thread").toBe(false);
  await ctx.close();
});

test("10. C cannot re-add or un-revoke itself, nor add someone to read for it", async () => {
  const c = bearerOf("worker2");
  const unrevoke = await qaApi(
    `/rest/v1/conversation_participants?conversation_id=eq.${conv}&profile_id=eq.${C}`,
    c,
    { method: "PATCH", body: { revoked_at: null } },
  );
  expect(unrevoke.status, "un-revoke refused").toBeGreaterThanOrEqual(400);
  const readd = await qaApi("/rest/v1/conversation_participants", c, {
    method: "POST",
    body: { conversation_id: conv, profile_id: C, added_by: C },
  });
  expect(readd.status, "self re-add refused").toBeGreaterThanOrEqual(400);
  const friend = await qaApi("/rest/v1/conversation_participants", c, {
    method: "POST",
    body: { conversation_id: conv, profile_id: subOf(bearerOf("manager")), added_by: C },
  });
  expect(friend.status, "adding someone else refused").toBeGreaterThanOrEqual(400);
  const own = await qaApi(`/rest/v1/conversation_participants?select=revoked_at&conversation_id=eq.${conv}&profile_id=eq.${C}`, c);
  const rows = (await own.json()) as { revoked_at: string | null }[];
  expect(rows.length === 1 && rows[0]!.revoked_at !== null, "still removed").toBe(true);
});

test("cleanup dry-run: exactly the rows the owner SQL would delete, all of this thread", async () => {
  const a = bearerOf("owner");
  const list = async (path: `/${string}`, token: string) => {
    const res = await qaApi(path, token);
    expect(res.status, `dry-run read ${path.split("?")[0]}`).toBe(200);
    return (await res.json()) as { conversation_id?: string; id?: string; profile_id?: string }[];
  };
  const participants = await list(`/rest/v1/conversation_participants?select=conversation_id,profile_id&conversation_id=eq.${conv}`, a);
  const messages = await list(`/rest/v1/conversation_messages?select=id,conversation_id&conversation_id=eq.${conv}`, a);
  const attachments = await list(`/rest/v1/conversation_message_attachments?select=id,conversation_id&conversation_id=eq.${conv}`, a);
  // Every listed row belongs to THIS thread — the delete is by id, never by pattern.
  for (const r of [...participants, ...messages, ...attachments]) expect(r.conversation_id).toBe(conv);
  expect(new Set(participants.map((p) => p.profile_id)), "only A, B and C").toEqual(new Set([A, B, C]));
  const bells: Record<string, number> = {};
  for (const slot of ["worker", "worker2"]) bells[slot] = await bellRows(bearerOf(slot));
  console.info(
    `[chat-revocation] dry-run for thread ${conv}: conversations 1, participants ${participants.length}, ` +
      `messages ${messages.length}, attachments ${attachments.length}, bell rows B ${bells.worker} C ${bells.worker2}`,
  );
});

test("cleanup (thread): an owner SQL step", async () => {
  notTested("cleanup (thread)", `no role holds DELETE on the chat tables; owner SQL removes ${conv}`);
});

/**
 * ALWAYS-RUN cleanup (Codex review on #3239): it runs even when a step above
 * failed, so a failed walk never leaves its file or unread bells behind. It
 * keeps no state from the steps: the thread id is set right after creation,
 * and the stored files are re-read here with A's own token (A stays a
 * participant), so a failure between the upload and step 3 still deletes the
 * file. Best-effort per item; the outcome goes to the log, never a token.
 */
test.afterAll(async () => {
  if (!conv) return;
  const a = bearerOf("owner");
  const res = await qaApi(
    `/rest/v1/conversation_message_attachments?select=storage_path&conversation_id=eq.${conv}`,
    a,
  ).catch(() => null);
  const paths = res && res.ok ? ((await res.json()) as { storage_path: string }[]).map((r) => r.storage_path) : [];
  if (attachmentPath && !paths.includes(attachmentPath)) paths.push(attachmentPath);
  let deleted = 0;
  for (const p of paths) {
    const del = await qaStorage(`/storage/v1/object/${BUCKET}/${p}`, a, { method: "DELETE" }).catch(() => null);
    if (del && del.status < 300) deleted += 1;
  }
  for (const slot of ["worker", "worker2"]) {
    await qaApi(`/rest/v1/notification_events?metadata->>conversationId=eq.${conv}&read_at=is.null`, bearerOf(slot), {
      method: "PATCH",
      body: { read_at: new Date().toISOString() },
    }).catch(() => null);
  }
  console.info(
    `[chat-revocation] cleanup: files deleted ${deleted}/${paths.length}; bells marked read; ` +
      `thread ${conv} left for the owner SQL step`,
  );
});
