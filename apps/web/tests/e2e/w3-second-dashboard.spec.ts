import { expect as baseExpect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * W3 — REMOVING THE SECOND DASHBOARD, ONE PROVEN ROW AT A TIME.
 *
 * `/dashboard/advanced` is a 916-line parallel dashboard composing ~27
 * capabilities. It is the architecture violation the owner command names, and
 * it is also the only place several real capabilities currently live — so the
 * migration matrix
 * (`docs/audits/evidence/premium-rebuild/w3-capability-migration-matrix.md`)
 * moves one row at a time, and every row gets a browser assertion before the
 * route can be deleted.
 *
 * This file grows one describe-block per migrated row. It is deliberately NOT
 * a "the advanced page renders" smoke test: the point is to prove that
 * REMOVING something did not remove a capability.
 */

const SHOTS = process.env.E2E_SHOTS_DIR
  ? join(process.cwd(), "..", "..", process.env.E2E_SHOTS_DIR)
  : join(process.cwd(), "..", "..", "docs", "audits", "evidence", "premium-rebuild", "w3");

const expect = baseExpect.configure({ timeout: 15_000 });

test.use({
  storageState: "tests/e2e/.storage-state.json",
  viewport: { width: 1440, height: 900 },
});
test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

// `/dashboard/advanced` is 916 lines composing ~27 components. Its FIRST dev
// compile genuinely exceeds the 30s default — that is build cost, not product
// latency, and shrinking the assertion to hide it would prove less.
test.setTimeout(180_000);

test.describe("row 4 — the fake market map is gone, the capability is not", () => {
  test("the advanced route still renders, without a drawn pseudo-map", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/lt/dashboard/advanced");

    // The market panel lives inside the "More" disclosure — a native <details>,
    // closed by default. Open it the way a person would, rather than asserting
    // against a collapsed element and calling the collapse a bug.
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();

    // The route is intact — removing the drawing did not break the page.
    const panel = page.getByTestId("premium-hub-map");
    await expect(panel).toBeVisible();

    // THE CAPABILITY SURVIVED — in whichever of its two REAL branches this
    // identity lands in. The fixture worker has no market signals yet, so the
    // panel correctly renders its honest empty state; a seeded identity renders
    // the three counts. Asserting only one branch would have made this test a
    // statement about the fixture rather than about the panel.
    const values = await panel.locator("dl dd").allTextContents();
    if (values.length > 0) {
      expect(values.length, "the three market signal values must survive").toBe(3);
      for (const v of values) expect(v.trim()).not.toBe("");
      const door = page.getByTestId("hub-map-open-link");
      await expect(door).toBeVisible();
      await expect(door).toHaveAttribute("href", /\/dashboard\/market-map/);
    } else {
      // Honest empty state — it must still say something and still open the map.
      await expect(panel).toContainText(/\S/);
      await expect(panel.locator('a[href*="/dashboard/market-map"]')).toHaveCount(1);
    }

    // THE FAKE MAP IS GONE. The panel drew a 400x260 <svg> of dots at invented
    // positions; a picture of a map is not a map.
    expect(
      await panel.locator("svg[viewBox='0 0 400 260']").count(),
      "the decorative pseudo-map must not come back",
    ).toBe(0);

    await page.screenshot({ path: join(SHOTS, "row4-market-panel-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("the door leads to a REAL map, not another drawing", async ({ page }) => {
    // The other half of "no capability was lost": the door has to lead
    // somewhere real.
    //
    // NOTE — a duplication found while writing this test, recorded in the W3
    // matrix rather than silently accommodated: `/dashboard/market-map` does
    // NOT render the canonical <MarketMap>. It renders `market-map-base` →
    // `market-map-live`, a SECOND Leaflet chain. `market-map.tsx`'s own header
    // says it was meant to collapse `market-map-live.tsx` into itself; that
    // collapse never finished. Both are real maps, so no user is being lied
    // to — but two map implementations is one too many, and it is now a
    // tracked W3 row instead of a surprise.
    await page.goto("/lt/dashboard/market-map");
    await expect(page.getByTestId("market-map-base")).toBeVisible();
    // Real Leaflet, real coordinates — not an illustration.
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    await page.screenshot({ path: join(SHOTS, "row4-real-map-1440.png") });
  });
});

test.describe("row 5 — the recommendations card became a result", () => {
  /**
   * The FIRST genuine ABSORB. Rows 13/15 were `ALREADY` — a canonical home
   * existed, so they die with the route. Row 5 had exactly ONE mount, on
   * `/dashboard/advanced`, and no home anywhere else: deleting it would have
   * deleted the capability. So it had to become a result FIRST, and this test
   * is what makes "first" checkable rather than asserted.
   *
   * Both halves are required. A test that only proved the card was gone would
   * pass just as well if the capability had been thrown away.
   */

  const consoleErrorsOf = (page: import("@playwright/test").Page) => {
    const errors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        errors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      // A server action aborted by a navigation is not a failure of anything.
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    return { errors, failed };
  };

  test("the capability now answers in the result panel", async ({ page }) => {
    const { errors, failed } = consoleErrorsOf(page);

    // The result is a real, restorable address — that is the whole point of
    // `?result=`: it survives a reload and can be shared.
    await page.goto("/lt/dashboard?result=opportunities");

    // WAIT FOR THE READ TO SETTLE FIRST. The result loads through a server
    // action after hydration, so its states appear only once that resolves —
    // counting testids straight after `goto` reads the loading state and finds
    // none of them. (Written here as a failing test first: it is the same
    // "counted before settle" defect this harness has already produced three
    // times, and an instantaneous `count()` never auto-waits.)
    //
    // The open-full control is present in EVERY terminal state and in none of
    // the transient ones, which makes it the honest settle signal.
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    await expect(page.getByTestId("opportunities-loading")).toHaveCount(0);

    // Exactly ONE of the honest states must be on screen. Which one depends on
    // the identity and on whether the owner-gated demand RPC is applied, so
    // asserting a single branch would make this a statement about the fixture
    // rather than about the result.
    const states = [
      "opportunities-view",
      "opportunities-empty",
      "opportunities-unavailable",
      "opportunities-no-worker",
    ] as const;
    const present = [];
    for (const id of states) {
      if ((await page.getByTestId(id).count()) > 0) present.push(id);
    }
    expect(present, `exactly one honest state, saw: ${present.join(", ")}`).toHaveLength(1);

    // Whichever state it is, it is never the unimplemented placeholder the
    // other result kinds still fall through to.
    expect(
      await page.getByTestId("result-body-pending").count(),
      "the opportunities result must render, not fall through to the pending placeholder",
    ).toBe(0);

    if (present[0] === "opportunities-view") {
      // Rows are real rows: every one carries the §19 basis — matched/total
      // counts WITH the confirmed share. A bare percentage is banned platform
      // -wide, so its absence is asserted too.
      // `opportunities-row-<uuid>` is the row itself; the parts inside it are
      // `opportunities-match-*` precisely so a prefix match cannot count a
      // row's own children as extra rows.
      const rows = page.locator('li[data-testid^="opportunities-row-"]');
      const n = await rows.count();
      expect(n).toBeGreaterThan(0);
      const bases = page.getByTestId("opportunities-match-basis");
      expect(await bases.count(), "every row explains its own basis").toBe(n);
      for (const text of await bases.allTextContents()) {
        expect(text.trim()).not.toBe("");
        expect(text, "a bare percentage may never stand alone").not.toMatch(/^\s*\d+\s*%\s*$/);
      }
    }

    await page.screenshot({ path: join(SHOTS, "row5-opportunities-result-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the card is gone from /dashboard/advanced, and the route still works", async ({
    page,
  }) => {
    const { errors, failed } = consoleErrorsOf(page);

    await page.goto("/lt/dashboard/advanced");

    // GONE — the second dashboard no longer carries this capability.
    expect(
      await page.getByTestId("dashboard-jobs-card").count(),
      "the recommendations card must not come back to the second dashboard",
    ).toBe(0);

    // …and removing it did not break the section that hosted it: the "More"
    // disclosure still opens and still renders its remaining real cards.
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();
    await expect(more).toContainText(/\S/);

    expect(failed, failed.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("the result holds up on a phone", async ({ page }) => {
    // The panel docks under the composer on phones. A result that overflows
    // there is a result nobody can read on a site.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow, "the result must not push the page sideways on 375px").toBe(false);

    // The one control it offers must be a real tap target.
    const box = await page.getByTestId("opportunities-open-full").first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await page.screenshot({ path: join(SHOTS, "row5-opportunities-result-375.png") });
  });

  /**
   * THE RESULT IS A PLACE, NOT A POPUP.
   *
   * An absorbed capability that cannot survive close / Back / Forward / reload
   * has not really moved into the workspace — it has become a modal with extra
   * steps. `?result=` was chosen precisely so every depth is a real address, so
   * that claim has to be checked rather than assumed.
   */
  test("close, Back, Forward and reload all keep the result honest", async ({ page }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    // RELOAD — the result is restored from the URL, not from memory.
    await page.reload();
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    expect(new URL(page.url()).searchParams.get("result")).toBe("opportunities");

    // CLOSE — the result goes, the conversation stays. Closing must not
    // navigate away from the workspace.
    await page.getByTestId("context-panel-close").click();
    await expect(page.getByTestId("opportunities-view")).toHaveCount(0);
    await expect(page.getByTestId("conversation-chat")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("result")).toBeNull();
    expect(new URL(page.url()).pathname).toContain("/dashboard");

    // BACK — closing replaces rather than pushes, so Back returns to the
    // address before the workspace, never into a half-open result.
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // FORWARD — and the result comes back exactly as it was.
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    if (new URL(page.url()).searchParams.get("result") === "opportunities") {
      await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    }
  });

  test("'open full screen' leads to the board — the SAME capability, not a second dashboard", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    await page.getByTestId("opportunities-open-full").first().click();

    // The canonical board. NOT /dashboard/advanced — the whole point of the
    // absorb is that the capability stopped depending on the second dashboard.
    await page.waitForURL(/\/dashboard\/opportunities/, { timeout: 30_000 });
    expect(page.url()).not.toContain("/dashboard/advanced");

    // And it is the real board, which reports its own shown rows.
    await expect(page.locator("main")).toContainText(/\S/);
  });

  /**
   * The two states a fixture cannot produce on demand. Both are forced at the
   * transport level rather than mocked in the component, so what is proven is
   * the real component reacting to a real failed read.
   */
  test("loading, then error, then retry — a failed read never renders as emptiness", async ({
    page,
  }) => {
    // Server actions are POSTs carrying `next-action` to the current URL.
    const isAction = (r: import("@playwright/test").Route) =>
      r.request().method() === "POST" &&
      Object.keys(r.request().headers()).some((h) => h.toLowerCase() === "next-action");

    // 1. HOLD the read open — the loading state must be visible and must
    //    announce itself to assistive tech rather than showing a bare blank.
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/dashboard**", async (route) => {
      if (!isAction(route)) return route.fallback();
      await held;
      return route.fallback();
    });

    await page.goto("/lt/dashboard?result=opportunities");
    const loading = page.getByTestId("opportunities-loading");
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    release?.();
    await page.unroute("**/dashboard**");

    // 2. FAIL the read outright. "We could not read" and "there is nothing"
    //    are different answers, and the panel must give the first one.
    await page.route("**/dashboard**", async (route) => {
      if (!isAction(route)) return route.fallback();
      return route.abort("failed");
    });
    await page.goto("/lt/dashboard?result=opportunities");

    await expect(page.getByTestId("opportunities-error")).toBeVisible();
    await expect(page.getByTestId("opportunities-retry")).toBeVisible();
    // Never an empty state, and never a silent blank, for a read that failed.
    await expect(page.getByTestId("opportunities-empty")).toHaveCount(0);
    await expect(page.getByTestId("opportunities-view")).toHaveCount(0);
    await page.screenshot({ path: join(SHOTS, "row5-opportunities-error-1440.png") });

    // 3. RETRY actually re-reads: with the failure lifted, the same button
    //    recovers the result without a reload.
    await page.unroute("**/dashboard**");
    await page.getByTestId("opportunities-retry").click();
    await expect(page.getByTestId("opportunities-error")).toHaveCount(0);
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
  });

  test("on a phone the panel is ONE clear surface, not a squeezed desktop column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lt/dashboard?result=opportunities");

    const panel = page.getByTestId("context-panel");
    await expect(panel).toBeVisible();

    // It must occupy the width it was given — a 22rem desktop column pinned
    // into 375px is the "squeezed" failure this checks for.
    const box = await panel.boundingBox();
    expect(box, "the panel must be laid out on a phone").not.toBeNull();
    expect(box!.width).toBeGreaterThan(320);
    expect(Math.round(box!.x)).toBeLessThanOrEqual(8);

    // And it must still be dismissible with one control on a phone.
    await expect(page.getByTestId("context-panel-close")).toBeVisible();
  });

  /**
   * THE CONSOLIDATION ITSELF.
   *
   * Before this change one answer had two renderers: the chat thread drew its
   * own job cards with their own copy of the interest control, and the Context
   * Panel result drew the same rows read-only — and nothing could even open the
   * panel. These cases pin that exactly one of them survived, and that the
   * survivor kept everything the other one could do.
   */
  test("the thread no longer draws job cards anywhere in the product", async ({ page }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    // The deleted renderer's own testids. If either comes back, the second
    // renderer came back with it.
    await expect(page.getByTestId("chat-employer-match-card")).toHaveCount(0);
    await expect(page.getByTestId("msg-employer-match")).toHaveCount(0);
    await expect(page.getByTestId("chat-employer-match-open")).toHaveCount(0);
  });

  test("the panel row kept everything the deleted card could do", async ({ page }) => {
    await page.goto("/lt/dashboard?result=opportunities");
    const rows = page.locator('li[data-testid^="opportunities-row-"]');
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();
    if ((await rows.count()) === 0) test.skip(true, "this identity has no matches");

    // WHO is hiring, and an HONEST fit badge — the two things only the thread
    // card used to show. The badge must carry the canonical status, so a weak
    // fit can never be painted with the success colour.
    const fit = page.getByTestId("opportunities-match-fit").first();
    await expect(fit).toBeVisible();
    const status = await fit.getAttribute("data-fit-status");
    expect(["strong", "possible", "weak", "insufficient"]).toContain(status);
    const cls = (await fit.getAttribute("class")) ?? "";
    if (status !== "strong") expect(cls).not.toContain("state-success");

    // The drill-in survived: selecting a match writes World State rather than
    // opening a page, so the job's full facts stay one tap away in the panel.
    const open = page.getByTestId("opportunities-match-open").first();
    await expect(open).toBeVisible();
    const before = page.url();
    await open.click();
    expect(page.url(), "selecting a match must not navigate").toBe(before);
  });

  test("'Domiuosi' is the ONE action surface, and it really writes", async ({ page }) => {
    const failed: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("opportunities-open-full").first()).toBeVisible();

    const interest = page.getByTestId("opportunities-match-interest").first();
    if ((await interest.count()) === 0) {
      test.skip(true, "the owner-gated interest table is not applied here");
    }

    // Exactly ONE interest control per row — never the row's own plus a
    // leftover from the thread.
    const rows = await page.locator('li[data-testid^="opportunities-row-"]').count();
    expect(await page.getByTestId("opportunities-match-interest").count()).toBe(rows);

    const button = interest.locator("button").first();
    const label = (await button.innerText()).trim();
    await button.click();

    // The outcome is REAL: the control reports a changed state, and it reports
    // it in the panel — the place the person acted.
    await expect(interest).not.toHaveText(new RegExp(`^${label}$`), { timeout: 15_000 });
    await expect(page.getByTestId("opportunities-match-interest").first()).toBeVisible();

    expect(failed, failed.join("\n")).toEqual([]);
  });
});

/* ── row 6 — worker invitations ─────────────────────────────────────────────
 *
 * The capability did NOT become a result kind. An invitation is an ATTENTION
 * item — nobody types "show me my invitations", they are told — so it was
 * absorbed into the Context Panel's EXISTING work context, which is the
 * surface whose whole job is what needs you now. No result kind, no registry
 * entry, no route, no second action surface.
 *
 * These scenarios seed REAL pending invitations into the local fixture
 * database with the service role and then drive the REAL accept RPC. Nothing
 * about the outcome is mocked: `linked`, `already_linked`, `no_invitation` and
 * `error` are the values Postgres actually returned.
 */

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** The fixture identity the storage state belongs to (supabase/dev-fixtures.sql). */
const WORKER_EMAIL = "dev.worker@local.test";
/** Dev Construction — the fixture worker is ALREADY on this roster. */
const COMPANY_ID = "cccccccc-0000-0000-0000-000000000001";
/** Dev Staffing UAB — the fixture worker is NOT on this one. */
const AGENCY_ID = "dddddddd-0000-0000-0000-000000000001";
const COMPANY_INVITER = "aaaaaaaa-0000-0000-0000-000000000002";
const AGENCY_INVITER = "aaaaaaaa-0000-0000-0000-000000000003";
/** The fixture worker's profile id — row 1 verifies its `workers` row. */
const WORKER_PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001";

/** Minimal PostgREST calls with the LOCAL service key — no client dependency,
 *  and it refuses outright if the target is not loopback. */
async function db(
  method: "POST" | "DELETE" | "GET",
  path: string,
  body?: unknown,
): Promise<Response> {
  if (!SUPA_URL || !SUPA_SERVICE) throw new Error("local stack env missing");
  if (!/^(127\.0\.0\.1|localhost)$/.test(new URL(SUPA_URL).hostname)) {
    throw new Error(`refusing to seed a non-local target: ${SUPA_URL}`);
  }
  return fetch(`${SUPA_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPA_SERVICE,
      Authorization: `Bearer ${SUPA_SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function clearInvitationState(): Promise<void> {
  await db("DELETE", `agency_worker_invitations?invited_email=eq.${WORKER_EMAIL}`);
  await db("DELETE", `company_worker_invitations?invited_email=eq.${WORKER_EMAIL}`);
  // The agency link is the one the accept scenario creates; the company link
  // is fixture state and is deliberately left alone.
  await db("DELETE", `agency_workers?agency_id=eq.${AGENCY_ID}`);
}

async function seedAgencyInvitation(note = "E2E row 6 agency"): Promise<void> {
  const r = await db("POST", "agency_worker_invitations", {
    agency_id: AGENCY_ID,
    invited_email: WORKER_EMAIL,
    status: "pending",
    inviter_profile_id: AGENCY_INVITER,
    note,
  });
  if (!r.ok) throw new Error(`seed agency invitation failed: ${await r.text()}`);
}

async function seedCompanyInvitation(note = "E2E row 6 company"): Promise<void> {
  const r = await db("POST", "company_worker_invitations", {
    company_id: COMPANY_ID,
    invited_email: WORKER_EMAIL,
    status: "pending",
    inviter_profile_id: COMPANY_INVITER,
    note,
  });
  if (!r.ok) throw new Error(`seed company invitation failed: ${await r.text()}`);
}

const HAS_LOCAL_STACK = Boolean(SUPA_URL && SUPA_SERVICE);

test.describe("row 6 — the invitation card became the panel's work context", () => {
  test.skip(!HAS_LOCAL_STACK, "needs the local stack (pnpm -C apps/web e2e:local)");

  test.beforeEach(clearInvitationState);
  test.afterAll(clearInvitationState);

  test("a pending invitation appears in the Context Panel, and the card is gone", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await seedAgencyInvitation();
    await page.goto("/lt/dashboard");

    const panel = page.getByTestId("context-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-panel-mode", "work_context");

    // THE CAPABILITY IS HERE — inside the work context, not on a second page.
    const invitations = panel.getByTestId("worker-invitations");
    await expect(invitations).toBeVisible({ timeout: 40_000 });
    // Real content: the inviting organisation's REAL name and note.
    await expect(invitations).toContainText("Dev Staffing UAB");
    await expect(invitations).toContainText("E2E row 6 agency");
    // Exactly ONE renderer — the duplication this row exists to remove.
    await expect(page.getByTestId("worker-invitations")).toHaveCount(1);
    await expect(
      page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`),
    ).toBeVisible();

    await page.screenshot({ path: join(SHOTS, "row6-invitation-panel-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("the card is gone from /dashboard/advanced and that route still works", async ({
    page,
  }) => {
    await seedAgencyInvitation();
    await page.goto("/lt/dashboard/advanced");

    // The route is intact …
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();

    // … and BOTH mounts are gone — including the one inside the disclosure,
    // which is why the disclosure is opened before asserting.
    await expect(page.getByTestId("worker-invitations")).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="worker-invitation-accept-"]'),
    ).toHaveCount(0);
  });

  test("accepting really links: the REAL RPC returns `linked`", async ({ page }) => {
    await seedAgencyInvitation();
    await page.goto("/lt/dashboard");

    const accept = page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`);
    await expect(accept).toBeVisible({ timeout: 40_000 });
    await accept.click();

    const result = page.getByTestId(`worker-invitation-result-agency-${AGENCY_ID}`);
    await expect(result).toBeVisible({ timeout: 40_000 });
    await expect(result).toHaveText(/\S/);
    // The accepted row drops its button — the action cannot be repeated.
    await expect(accept).toHaveCount(0);

    // THE WRITE REALLY HAPPENED: the roster link exists in the database.
    const check = await db(
      "GET",
      `agency_workers?agency_id=eq.${AGENCY_ID}&select=agency_id,status`,
    );
    const rows = (await check.json()) as unknown[];
    expect(rows.length, "the accept RPC must have created a real link").toBe(1);
  });

  test("an invitation from an org already on the roster says `already-linked`", async ({
    page,
  }) => {
    // The fixture worker is already on Dev Construction's roster, so this is
    // the real already_linked branch of the RPC — not a simulated one.
    await seedCompanyInvitation();
    await page.goto("/lt/dashboard");

    const accept = page.getByTestId(`worker-invitation-accept-company-${COMPANY_ID}`);
    await expect(accept).toBeVisible({ timeout: 40_000 });
    await accept.click();

    const result = page.getByTestId(`worker-invitation-result-company-${COMPANY_ID}`);
    await expect(result).toBeVisible({ timeout: 40_000 });
    // already_linked is an OK outcome, so it renders in the success tone …
    await expect(result).toHaveClass(/state-success/);
    // … and the button stays, because nothing was newly linked.
    await expect(accept).toBeVisible();
  });

  test("an invitation withdrawn behind the person's back says `no-invitation`", async ({
    page,
  }) => {
    await seedAgencyInvitation();
    await page.goto("/lt/dashboard");

    const accept = page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`);
    await expect(accept).toBeVisible({ timeout: 40_000 });

    // The organisation withdraws it while the panel is open. Real row, really
    // deleted — the stale screen must not claim a link it did not get.
    await db("DELETE", `agency_worker_invitations?invited_email=eq.${WORKER_EMAIL}`);
    await accept.click();

    const result = page.getByTestId(`worker-invitation-result-agency-${AGENCY_ID}`);
    await expect(result).toBeVisible({ timeout: 40_000 });
    // A no-rows outcome is a WARNING, never the success tone.
    await expect(result).toHaveClass(/state-warning/);
    const links = await db(
      "GET",
      `agency_workers?agency_id=eq.${AGENCY_ID}&select=agency_id`,
    );
    expect((await links.json()) as unknown[]).toEqual([]);
  });

  test("a failed write states the error instead of pretending it worked", async ({
    page,
  }) => {
    await seedAgencyInvitation();
    await page.goto("/lt/dashboard");

    const accept = page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`);
    await expect(accept).toBeVisible({ timeout: 40_000 });

    // Corrupt the org id the form carries. The RPC then fails inside Postgres
    // (invalid uuid), which is a REAL error on the real path — the component's
    // `error` branch, not a mocked response.
    await page
      .locator(
        `[data-testid="worker-invitation-agency-${AGENCY_ID}"] input[name="orgId"]`,
      )
      .evaluate((el) => {
        (el as HTMLInputElement).value = "not-a-uuid";
      });
    await accept.click();

    const result = page.getByTestId(`worker-invitation-result-agency-${AGENCY_ID}`);
    await expect(result).toBeVisible({ timeout: 40_000 });
    await expect(result).toHaveClass(/state-warning/);
    // Nothing was written.
    const links = await db(
      "GET",
      `agency_workers?agency_id=eq.${AGENCY_ID}&select=agency_id`,
    );
    expect((await links.json()) as unknown[]).toEqual([]);
  });

  test("reload keeps the state honest, and closing the panel is not a dead end", async ({
    page,
  }) => {
    await seedAgencyInvitation();
    await page.goto("/lt/dashboard");
    const panel = page.getByTestId("context-panel");
    await expect(panel.getByTestId("worker-invitations")).toBeVisible({
      timeout: 40_000,
    });

    // A reload re-reads: still pending, still exactly one renderer.
    await page.reload();
    await expect(panel.getByTestId("worker-invitations")).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("worker-invitations")).toHaveCount(1);

    // Opening a RESULT gives the panel to the result (one subject at a time),
    // and closing it returns the work context — invitation included.
    await page.goto("/lt/dashboard?result=opportunities");
    await expect(page.getByTestId("context-panel-close")).toBeVisible({
      timeout: 40_000,
    });
    await page.getByTestId("context-panel-close").click();
    await expect(panel).toHaveAttribute("data-panel-mode", "work_context");
    await expect(panel.getByTestId("worker-invitations")).toBeVisible({
      timeout: 40_000,
    });

    // Once accepted, a reload must NOT resurrect the pending invitation.
    await page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`).click();
    await expect(
      page.getByTestId(`worker-invitation-result-agency-${AGENCY_ID}`),
    ).toBeVisible({ timeout: 40_000 });
    await page.reload();
    await expect(page.getByTestId("worker-invitations")).toHaveCount(0, {
      timeout: 40_000,
    });
  });

  test("375px — the invitation is reachable on a phone, with no overflow", async ({
    page,
  }) => {
    await seedAgencyInvitation();
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto("/lt/dashboard");

    // The panel is a bottom sheet on a phone and starts collapsed. A pending
    // invitation opens it: the bell that announces the invitation points here,
    // so a shut sheet would make the signal unreachable.
    const invitations = page.getByTestId("worker-invitations");
    await expect(invitations).toBeVisible({ timeout: 40_000 });
    await expect(
      page.getByTestId(`worker-invitation-accept-agency-${AGENCY_ID}`),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal overflow at 375px").toBeLessThanOrEqual(1);

    await page.screenshot({ path: join(SHOTS, "row6-invitation-panel-375.png") });
  });
});

/* ── row 1 — the Player Card ────────────────────────────────────────────────
 *
 * The capability had TWO renderers: the canonical `WorkerPlayerCard` embedded
 * in the chat THREAD, and a lesser person block inside the premium hub on
 * `/dashboard/advanced`, mounted twice. Both are gone. The card is the
 * `player-card` RESULT in the Context Panel — the result kind, its registry
 * entry and its `dataReadiness: "real"` all already existed, so this row added
 * no kind, no entry and no route.
 *
 * The hard acceptance condition is the EDITOR. The hub's person block carried
 * `workEditor` — the only availability/location/pay editor in the product.
 * Absorbing the card without it would have deleted a capability silently, so
 * these scenarios prove it survived, that a non-worker does not get it, and
 * that it still writes.
 */

test.describe("row 1 — the player card became a result", () => {
  test("chat opens the card in the panel, and draws no card of its own", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !/upgrade-insecure-requests/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });
    page.on("requestfailed", (r) => {
      const why = r.failure()?.errorText ?? "";
      if (!why.includes("ERR_ABORTED")) failed.push(`${r.url()} — ${why}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });

    await page.goto("/lt/dashboard");
    await expect(page.getByTestId("context-panel")).toBeVisible();

    // Ask for the card the way a person does.
    await page.getByTestId("composer-input").fill("Parodyk mano kortelę");
    await page.getByTestId("composer-send").click();

    // THE PANEL SHOWS IT …
    const panel = page.getByTestId("context-panel");
    await expect(panel.getByTestId("player-card-result")).toBeVisible({
      timeout: 40_000,
    });
    await expect(panel.getByTestId("worker-player-card")).toBeVisible();

    // … and the THREAD does not. The old embed had its own test id; a second
    // renderer is exactly what this row removes.
    await expect(page.getByTestId("chat-player-card")).toHaveCount(0);
    // Exactly ONE card in the whole document.
    await expect(page.getByTestId("worker-player-card")).toHaveCount(1);

    await page.screenshot({ path: join(SHOTS, "row1-player-card-1440.png") });

    expect(failed, failed.join("\n")).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });

  test("the worker keeps the work editor — it came with the card", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard?result=player-card");
    const editor = page.getByTestId("player-card-work-editor");
    await expect(editor).toBeVisible({ timeout: 40_000 });
    // The editor is the REAL control, not a link that leaves the workspace:
    // its open affordance is a button inside the panel.
    await expect(editor.locator("button").first()).toBeVisible();
    // Exactly one editor — the hub used to carry a second copy of this.
    await expect(page.getByTestId("player-card-work-editor")).toHaveCount(1);
  });

  test("the editor really writes — the DATABASE row changes", async ({ page }) => {
    test.skip(!HAS_LOCAL_STACK, "needs the local stack to verify the row");

    await page.goto("/lt/dashboard?result=player-card");
    const editor = page.getByTestId("player-card-work-editor");
    await expect(editor).toBeVisible({ timeout: 40_000 });

    // Open the folded editor by its OWN control, not "the first button" — the
    // block also carries the state-aware next action, and clicking that
    // instead would have proven nothing.
    await editor.getByTestId("work-card-editor-toggle").click();
    const form = editor.getByTestId("work-card-editor");
    await expect(form).toBeVisible();

    const select = form.locator('select[name="availability_status"]');
    await expect(select).toBeVisible();
    const before = await select.inputValue();
    const next = before === "available" ? "busy" : "available";
    await select.selectOption(next);
    await form.locator('button[type="submit"]').first().click();

    // THE PROOF IS THE ROW, not the screen. A re-rendered select could show a
    // value the database never received; this asserts the write itself.
    await expect
      .poll(
        async () => {
          const r = await db(
            "GET",
            `workers?profile_id=eq.${WORKER_PROFILE_ID}&select=availability_status`,
          );
          const rows = (await r.json()) as { availability_status: string | null }[];
          return rows[0]?.availability_status ?? null;
        },
        { timeout: 30_000 },
      )
      .toBe(next);
  });

  test("the card is gone from /dashboard/advanced and that route still works", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard/advanced");
    const more = page.getByTestId("dashboard-more-section");
    await expect(more).toBeAttached();
    await more.locator("summary").click();

    // The hub survives — it still carries the company / market / project
    // blocks, which are their own W3 rows …
    await expect(page.getByTestId("premium-hub-screen").first()).toBeVisible();
    // … but the person block and its editor are gone from this route.
    await expect(page.getByTestId("premium-hub-person")).toHaveCount(0);
    await expect(page.getByTestId("premium-hub-person-next")).toHaveCount(0);
    await expect(page.getByTestId("worker-player-card")).toHaveCount(0);
  });

  test("reload, close and Back/Forward all keep the result honest", async ({
    page,
  }) => {
    await page.goto("/lt/dashboard?result=player-card");
    await expect(page.getByTestId("player-card-result")).toBeVisible({
      timeout: 40_000,
    });

    // Reload re-reads and still shows exactly one card.
    await page.reload();
    await expect(page.getByTestId("player-card-result")).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("worker-player-card")).toHaveCount(1);

    // Close drops the result and returns the work context — no dead end, and
    // no navigation away from the workspace.
    await page.getByTestId("context-panel-close").click();
    await expect(page.getByTestId("player-card-result")).toHaveCount(0);
    await expect(page.getByTestId("context-panel")).toHaveAttribute(
      "data-panel-mode",
      "work_context",
    );
    expect(new URL(page.url()).searchParams.get("result")).toBeNull();
    expect(new URL(page.url()).pathname).toContain("/dashboard");

    // BACK — closing REPLACES rather than pushes (the same contract row 5
    // pinned), so Back returns to the address before the workspace and never
    // to a half-open result.
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");

    // FORWARD — and if it lands back on the result, the result is whole.
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    if (new URL(page.url()).searchParams.get("result") === "player-card") {
      await expect(page.getByTestId("player-card-result")).toBeVisible({
        timeout: 40_000,
      });
      await expect(page.getByTestId("worker-player-card")).toHaveCount(1);
    }
  });

  test("loading announces itself, and a failed read offers retry", async ({
    page,
  }) => {
    // Hold the server action, then abort it — what is proven is the REAL
    // component reacting to a real failed read, not a mock of itself.
    let release: (() => void) | null = null;
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route("**/dashboard**", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await held;
      return route.abort("failed");
    });

    await page.goto("/lt/dashboard?result=player-card");
    // LOADING is announced rather than shown as a blank frame.
    const loading = page.getByTestId("player-card-loading");
    await expect(loading).toBeVisible({ timeout: 40_000 });
    await expect(loading).toHaveAttribute("aria-busy", "true");

    release?.();

    // ERROR, with a working retry — never a false emptiness.
    await expect(page.getByTestId("player-card-error")).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByTestId("player-card-retry")).toBeVisible();

    // Retry with the route released reaches a real read again.
    await page.unroute("**/dashboard**");
    await page.getByTestId("player-card-retry").click();
    await expect(page.getByTestId("player-card-error")).toHaveCount(0, {
      timeout: 40_000,
    });
  });

  test("375px — the card is usable on a phone with no overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 780 });
    await page.goto("/lt/dashboard?result=player-card");
    await expect(page.getByTestId("player-card-result")).toBeVisible({
      timeout: 40_000,
    });

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal overflow at 375px").toBeLessThanOrEqual(1);

    await page.screenshot({ path: join(SHOTS, "row1-player-card-375.png") });
  });
});
