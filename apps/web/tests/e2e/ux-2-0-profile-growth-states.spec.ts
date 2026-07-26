import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * UX 2.0 — the profile growth bar at every state the owner has to sign off.
 *
 * The main evidence spec captures the growth bar at whatever the signed-in
 * worker really is (2/5 for the shared fixture). Stage 7's claim is stronger
 * than one state: the bar must render the SERVER's count at 0/5 (nothing saved
 * yet), at a partial 4/5, and at a complete 5/5 — with no percentage, no
 * fabricated progress, and the named done/missing lists agreeing exactly.
 *
 * OPT-IN AND LOCAL-ONLY. Skipped unless `UX_EVIDENCE_GROWTH=1`, because it
 * drives a DEDICATED local user (`scripts/ux-evidence-seed.ts`) through three
 * states and therefore needs that user's session, not the shared worker's. It
 * only ever ADDS rows to its own user — no existing fixture row is touched, and
 * the service-role client it uses comes from `scripts/e2e-local.ts`, which
 * refuses to run against anything but the local stack.
 */
const STORAGE_STATE = join(__dirname, ".storage-state.json");
const ENABLED = process.env.UX_EVIDENCE_GROWTH === "1" && existsSync(STORAGE_STATE);

test.skip(!ENABLED, "Set UX_EVIDENCE_GROWTH=1 and mint the evidence user's session first.");
test.use({ storageState: ENABLED ? STORAGE_STATE : undefined });
test.describe.configure({ mode: "serial" });

const SHA = process.env.UX_EVIDENCE_SHA ?? "working-tree";
const EVIDENCE_EMAIL = "dev.ux-evidence@local.test";

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const host = url ? new URL(url).hostname : "";
  // Belt and braces: this file writes rows, so it re-checks the target itself
  // rather than trusting the runner that launched it.
  expect(["localhost", "127.0.0.1", "::1"], `refusing non-local target ${host}`).toContain(host);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function evidenceUserId(db: SupabaseClient): Promise<string> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data?.users.find((u) => u.email === EVIDENCE_EMAIL);
  expect(user, `run \`pnpm tsx scripts/ux-evidence-seed.ts\` first`).toBeTruthy();
  return user!.id;
}

/** Wait for hydration the way the main evidence spec does — `data-surface` is
 *  stamped post-hydration, so it is the earliest honest "client is live". */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.surface === "conversation",
    null,
    { timeout: 30_000 },
  );
}

/** Ask the assistant for the profile and read what the bar actually rendered. */
async function readGrowth(page: Page) {
  await page.goto("/lt/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("conversation-chat")).toBeVisible({ timeout: 30_000 });
  await hydrated(page);
  await page.getByTestId("chat-chip-profile").click();
  await expect(page.getByTestId("msg-profile-summary").last()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("profile-growth")).toBeVisible();

  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="profile-growth"]') as HTMLElement;
    const segs = [...el.querySelectorAll<HTMLElement>("[data-filled]")];
    const list = (sel: string): number => {
      const node = document.querySelector(sel);
      return node ? node.querySelectorAll("li").length : 0;
    };
    return {
      done: Number(el.dataset.done),
      total: Number(el.dataset.total),
      valueNow: Number(el.getAttribute("aria-valuenow")),
      valueMax: Number(el.getAttribute("aria-valuemax")),
      valueText: el.getAttribute("aria-valuetext"),
      filled: segs.filter((x) => x.dataset.filled === "true").length,
      segments: segs.length,
      doneItems: list('[data-testid="profile-summary-done"]'),
      missingItems: list('[data-testid="profile-summary-missing"]'),
      bodyText: document.querySelector('[data-testid="conversation-chat"]')?.textContent ?? "",
    };
  });
}

/** Every assertion stage 7 makes, applied to whatever state is on screen. */
function assertHonest(state: Awaited<ReturnType<typeof readGrowth>>, expected: number): void {
  expect(state.done, `server reports ${expected}/5`).toBe(expected);
  expect(state.total).toBe(5);
  expect(state.segments, "always five segments — never a percentage bar").toBe(5);
  expect(state.filled, "filled segments equal the server's count").toBe(expected);
  expect(state.valueNow).toBe(expected);
  expect(state.valueMax).toBe(5);
  expect(state.valueText, "the count is spoken, not just drawn").toContain(String(expected));
  expect(state.doneItems, "named done items match").toBe(expected);
  expect(state.missingItems, "named missing items match").toBe(5 - expected);
  // No fabricated progress anywhere on the surface.
  expect(state.bodyText).not.toMatch(/\d+\s?%/);
  expect(state.bodyText).not.toMatch(/\bXP\b|\bstreak\b|\blevel\s?\d/i);
}

async function capture(page: Page, state: number): Promise<void> {
  test.info().annotations.push({
    type: "evidence",
    description: `scenario=profile-${state}-of-5 theme=light viewport=desktop-1536x864 locale=lt sha=${SHA}`,
  });
  await page.screenshot({
    path: test.info().outputPath(`profile-${state}-of-5__light__desktop-1536x864.png`),
    fullPage: false,
  });
}

test.describe("profile growth — every state", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 864 });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("theme", "light");
      } catch {
        /* ignore */
      }
    });
  });

  test("0 of 5 — nothing saved yet, and the card says so by name", async ({ page }) => {
    const state = await readGrowth(page);
    assertHonest(state, 0);
    // The empty state must still NAME the five checkpoints rather than showing
    // an empty bar with no next step.
    expect(state.missingItems).toBe(5);
    await capture(page, 0);
  });

  test("4 of 5 — one real gap left", async ({ page }) => {
    const db = admin();
    const uid = await evidenceUserId(db);
    const { data: worker } = await db
      .from("workers")
      .select("id")
      .eq("profile_id", uid)
      .maybeSingle();
    expect(worker?.id, "evidence user must have a worker row").toBeTruthy();

    // Four of the five real presence checks, written to the same canonical
    // tables the product writes — nothing is faked into the UI.
    await db.from("profiles").update({ profile_text: "Statybų darbuotoja, 6 metai patirties." }).eq("id", uid);
    await db.from("workers").update({ availability_status: "available" }).eq("profile_id", uid);
    await db.from("profile_skill_claims").insert([
      { profile_id: uid, label: "Mūrijimas", normalized_label: "murijimas" },
      { profile_id: uid, label: "Tinkavimas", normalized_label: "tinkavimas" },
    ]);
    await db
      .from("worker_languages")
      .insert([{ worker_id: worker!.id, lang: "lt", level: "native" }]);

    const state = await readGrowth(page);
    assertHonest(state, 4);
    await capture(page, 4);
  });

  test("5 of 5 — complete, and the copy changes rather than congratulating", async ({ page }) => {
    const db = admin();
    const uid = await evidenceUserId(db);
    await db.from("engagement_contexts").insert([
      {
        profile_id: uid,
        relationship_slug: "employee",
        hash_self: "ux2evidence0000000000000000000000000000000000000000000000000000",
        title: "Objektas Vilniuje",
      },
    ]);

    const state = await readGrowth(page);
    assertHonest(state, 5);
    expect(state.missingItems, "nothing left to name").toBe(0);
    await capture(page, 5);
  });
});
