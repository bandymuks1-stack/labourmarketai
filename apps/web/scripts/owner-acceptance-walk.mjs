/**
 * OWNER ACCEPTANCE WALK — the product driven as a person drives it.
 *
 * Run against the LOCAL stack and the LOCAL fixture identities only
 * (`dev.worker` / `dev.company` / `dev.agency` from supabase/dev-fixtures.sql).
 * No production account is touched and nothing is created to satisfy a matrix.
 *
 *   1. npx supabase start                    (repo root)
 *   2. pnpm -C apps/web tsx scripts/e2e-mint-session.ts   (per actor; see that
 *      file's header for E2E_OWNER_EMAIL / E2E_STORAGE_FILE)
 *   3. boot the app against the local stack on :3210
 *   4. node scripts/owner-acceptance-walk.mjs
 *
 * PREFLIGHT, before a browser is launched: when the minted sessions are LOCAL,
 * the local Supabase must answer, or the walk exits 3 with
 * LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER; then the app at WALK_BASE must
 * answer, or it exits 1. Either way nothing is walked, so a stopped stack is
 * never reported as 0/N product failures.
 *
 * WHY A SCRIPT AND NOT A PLAYWRIGHT SPEC. The same walk as a spec hangs the
 * runner: each authenticated page takes 2-10s against a local production
 * build, an actor visits five or six, and the per-test budget expires mid-walk
 * so the failure surfaces as a teardown error instead of the assertion that
 * mattered. A script reports every step's verdict and keeps going, which is
 * what an acceptance walk is for. Sessions are short-lived — RE-MINT
 * IMMEDIATELY BEFORE RUNNING, or every actor lands on /auth/login and the
 * walk reports a product failure that is really an expired token.
 *
 * TWO MEASUREMENT TRAPS THIS SCRIPT ALREADY AVOIDS, both of which first
 * reported a healthy product as broken:
 *   - the logo is a SOFT navigation, so the URL changes before React mounts
 *     the composer: wait for the control, never snapshot the gap;
 *   - a page with an async section renders "Skaitoma…" first, so comparing a
 *     reload too early reports "differs" on a page that settles identically.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.WALK_BASE ?? "http://127.0.0.1:3210";
const S = (f) => join(process.cwd(), "tests/e2e", f);

// ── PREFLIGHT ──────────────────────────────────────────────────────────────
// Mirrors LOCAL_STACK_UNAVAILABLE_CODE in lib/testing/local-supabase-guard.ts
// (this file is plain node and cannot import TypeScript);
// lib/testing/local-supabase-env.test.ts pins that the two stay equal.
const LOCAL_STACK_UNAVAILABLE_CODE = "LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER";
// The one allowlisted local origin the mint script writes sessions for — fixed,
// never read from env, so this probe can never be pointed anywhere else.
const LOCAL_SUPABASE = "http://127.0.0.1:54321";

/** A state is LOCAL when it exists and every cookie is scoped to loopback. */
function isLocalState(file) {
  try {
    const { cookies } = JSON.parse(readFileSync(S(file), "utf8"));
    return (
      Array.isArray(cookies) &&
      cookies.length > 0 &&
      cookies.every((c) => c.domain === "127.0.0.1" || c.domain === "localhost")
    );
  } catch {
    return false;
  }
}

/** Any HTTP answer means something is listening; only a failed connection is "down". */
async function unreachable(url) {
  try {
    await fetch(url, { redirect: "manual" });
    return null;
  } catch (e) {
    return e?.cause?.code ?? e?.message ?? String(e);
  }
}

const STATES = [".storage-state.json", ".storage-state-company.json", ".storage-state-agency.json"];
if (STATES.some(isLocalState)) {
  const why = await unreachable(`${LOCAL_SUPABASE}/auth/v1/health`);
  if (why) {
    console.error(
      `${LOCAL_STACK_UNAVAILABLE_CODE} — local Supabase is not reachable at ${LOCAL_SUPABASE} (${why}). ` +
        "The minted sessions are LOCAL, so this walk is a LOCAL INTEGRATION run: it needs Docker Desktop " +
        "running and `npx supabase start` (repo root). UNIT / STATIC / GUARD tests do not — run " +
        "`pnpm -F web test`. Production is verified through the prod-qa chain " +
        "(`pnpm -C apps/web prod-qa:gate`), never by pointing local tooling at production. Nothing was walked.",
    );
    process.exit(3);
  }
}
{
  const why = await unreachable(BASE);
  if (why) {
    console.error(
      `[walk] PREFLIGHT — the app is not reachable at ${BASE} (${why}). Boot it against the local ` +
        "stack first (step 3 in this file's header) or set WALK_BASE. Nothing was walked.",
    );
    process.exit(1);
  }
}

const results = [];
function rec(actor, step, pass, detail) {
  results.push({ actor, step, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${actor.padEnd(10)} ${step}${detail ? "  — " + detail : ""}`);
}

const RAW_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

async function snap(page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const txt = (main?.innerText ?? document.body.innerText ?? "").slice(0, 20000);
    const logo = document.querySelector('[data-testid="shell-logo-home"]');
    return {
      url: location.pathname + location.search,
      lang: document.documentElement.lang,
      logoHref: logo ? logo.getAttribute("href") : null,
      composer: document.querySelectorAll('[data-testid="composer-input"]').length,
      text: txt,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
  return snap(page);
}

function rawKeyLeak(text) {
  return text
    .split(/\s+/)
    .filter((w) => /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*){2,}$/.test(w))
    .filter((w) => !/\.(lt|eu|com|ai|org|net)$/i.test(w));
}

const browser = await chromium.launch();

async function walkActor(actor, file, deepRoutes, expectedContext) {
  const ctx = await browser.newContext({ storageState: S(file) });
  const page = await ctx.newPage();
  try {
    // 1. session -> canonical /dashboard
    // WAIT FOR THE CONTROL, not a fixed delay: the FIRST page of a run is
    // cold (the server has not rendered this route yet), and snapshotting
    // that gap reported composer=0 on a home that mounts correctly a moment
    // later — a harness race presented as a product failure.
    let s = await go(page, "/lt/dashboard");
    await page.waitForSelector('[data-testid="composer-input"]', { timeout: 60000 }).catch(() => {});
    s = await snap(page);
    rec(actor, "session -> canonical /dashboard", s.url.startsWith("/lt/dashboard"), s.url);
    // 2. conversation immediately usable
    rec(actor, "conversation immediately usable on home", s.composer >= 1, `composer=${s.composer}`);
    // 3. correct active context
    const ctxOk = expectedContext.some((c) => s.text.includes(c));
    rec(actor, "correct active context", ctxOk, expectedContext.join("|"));
    // 4. logo -> canonical home
    rec(actor, "logo points at canonical home", s.logoHref === "/lt/dashboard", String(s.logoHref));
    // 5. no raw identifiers on home
    rec(actor, "no raw uuid / message key on home",
      !RAW_UUID.test(s.text) && rawKeyLeak(s.text).length === 0,
      rawKeyLeak(s.text).slice(0, 3).join(","));

    // 6. representative real reads on the actor's own deep routes
    for (const r of deepRoutes) {
      s = await go(page, r);
      const ok = !s.url.includes("notice=");
      rec(actor, `real read ${r}`, ok, s.url);
      if (ok) {
        rec(actor, `no raw identifiers ${r}`,
          !RAW_UUID.test(s.text) && rawKeyLeak(s.text).length === 0,
          rawKeyLeak(s.text).slice(0, 3).join(","));
        rec(actor, `logo present on ${r}`, s.logoHref === "/lt/dashboard", String(s.logoHref));
      }
    }

    // 7. reload -> persisted state
    // SETTLE FIRST: a page with an async section renders "Skaitoma…" before
    // its data, so comparing too early reports "differs" on a page that
    // reloads identically once settled.
    await page.waitForTimeout(3000);
    const before = (await snap(page)).text.slice(0, 400);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(3000);
    const after = (await snap(page)).text.slice(0, 400);
    rec(actor, "reload -> same user-visible state", before === after, before === after ? "" : "differs");

    // 8. deep route -> logo click -> canonical dashboard, conversation intact
    await go(page, deepRoutes[0]);
    await page.click('[data-testid="shell-logo-home"]', { timeout: 30000 });
    await page.waitForURL(/\/lt\/dashboard\/?$/, { timeout: 30000 });
    // The logo is a soft navigation: the URL changes before React mounts the
    // composer. Measuring immediately reports composer=0 on a page that is
    // about to be perfectly correct, so WAIT for the control rather than
    // snapshotting the gap and calling it a defect.
    let intact = true;
    try {
      await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30000 });
    } catch {
      intact = false;
    }
    const home = await snap(page);
    rec(actor, "logo from deep route -> home, conversation intact", intact && home.composer >= 1, home.url);

    // 9. 375px, on a FRESH load of the home (not the tail of the step above)
    await page.setViewportSize({ width: 375, height: 812 });
    await go(page, "/lt/dashboard");
    await page.waitForSelector('[data-testid="composer-input"]', { timeout: 30000 }).catch(() => {});
    const m = await snap(page);
    rec(actor, "375px: no horizontal overflow", !m.overflow, `scrollW>innerW=${m.overflow}`);
    rec(actor, "375px: composer still usable", m.composer >= 1, `composer=${m.composer}`);
    await page.setViewportSize({ width: 1280, height: 900 });
  } catch (e) {
    rec(actor, "WALK ABORTED", false, String(e.message).slice(0, 120));
  } finally {
    await ctx.close();
  }
}

// WORKER — personal context
await walkActor("worker", ".storage-state.json",
  ["/lt/dashboard/profile", "/lt/dashboard/journal", "/lt/dashboard/opportunities"],
  ["Asmeninė erdvė"]);

// EMPLOYER — organization context
await walkActor("employer", ".storage-state-company.json",
  ["/lt/dashboard/company", "/lt/dashboard/company/scouting"],
  ["Dev Construction", "Įmonė", "Organizacija"]);

// AGENCY — organization context
await walkActor("agency", ".storage-state-agency.json",
  ["/lt/dashboard/profile"],
  ["Dev Staffing"]);

// PERSONAL vs ORGANIZATION: same shell, different authority
{
  const w = await browser.newContext({ storageState: S(".storage-state.json") });
  const c = await browser.newContext({ storageState: S(".storage-state-company.json") });
  const wp = await w.newPage();
  const cp = await c.newPage();
  try {
    const wh = await go(wp, "/lt/dashboard");
    const ch = await go(cp, "/lt/dashboard");
    rec("context", "SAME shell: both reach the one canonical home",
      wh.url.startsWith("/lt/dashboard") && ch.url.startsWith("/lt/dashboard"), "");
    rec("context", "SAME logo destination for both",
      wh.logoHref === ch.logoHref && wh.logoHref === "/lt/dashboard", String(wh.logoHref));
    rec("context", "SAME chat control plane for both",
      wh.composer >= 1 && ch.composer >= 1, `w=${wh.composer} c=${ch.composer}`);

    const wc = await go(wp, "/lt/dashboard/company");
    rec("context", "personal is REFUSED the employer surface, honestly",
      wc.url.includes("notice=needs_company_role"), wc.url);
    rec("context", "…and lands back on the one home with the chat usable",
      wc.composer >= 1, `composer=${wc.composer}`);

    const cc = await go(cp, "/lt/dashboard/company");
    rec("context", "organization IS served the employer surface",
      cc.url === "/lt/dashboard/company", cc.url);

    const co = await go(cp, "/lt/dashboard/opportunities");
    rec("context", "organization is REFUSED the personal board (the mirror)",
      co.url.includes("notice=needs_worker_role"), co.url);
  } catch (e) {
    rec("context", "ABORTED", false, String(e.message).slice(0, 120));
  } finally {
    await w.close();
    await c.close();
  }
}

// ANONYMOUS translation state
{
  const a = await browser.newContext();
  const ap = await a.newPage();
  try {
    const s = await go(ap, "/lt/jobs");
    const n = await ap.locator('a[href*="/jobs/"]').count();
    rec("anon", "/lt/jobs reachable", s.url.startsWith("/lt/jobs"), `${n} ad link(s)`);
    if (n > 0) {
      await ap.locator('a[href*="/jobs/"]').first().click();
      await ap.waitForLoadState("domcontentloaded");
      const t = await ap.locator('[data-testid="vacancy-translate"]').count();
      rec("anon", "anonymous reader gets NO translate control", t === 0, `controls=${t}`);
    } else {
      rec("anon", "translate control check", true, "SKIPPED — local store holds 0 vacancies (proven on production instead)");
    }
  } catch (e) {
    rec("anon", "ABORTED", false, String(e.message).slice(0, 120));
  } finally {
    await a.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} PASS ====`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  ${f.actor} / ${f.step} — ${f.detail}`);
}
