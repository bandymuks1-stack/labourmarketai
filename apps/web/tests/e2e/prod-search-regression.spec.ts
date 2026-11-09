import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect, firstVisit, type Browser, type Page } from "./prod-walk";

/**
 * JOB SEARCH REGRESSION (owner P0 2026-11-09, register rows SR-1…SR-4, SR-10): the same
 * search cases every time, so each search fix is judged by one run id with a line per
 * case — URL, count, milliseconds, PASS or FAIL.
 *
 * Read-only. S-cases run signed out; H-1 reads three Norwegian ads as the synthetic
 * worker, because the description is members-only. Nothing is saved, sent or clicked
 * that writes. A known defect is a FAIL here, never a skip: byggarbetare (SR-10), a
 * typed profession losing its page (SR-4) and the ignored country parameter stay red
 * until they are fixed.
 *
 * Logs carry counts, lengths and hashes only, never an ad's own words (public run
 * logs; the ad text is licensed content). H-1 prints SHA-256 of the description's
 * first 80, last 80 and whole rendered text, so it can be compared against the stored
 * original without publishing it.
 */
const SUPA = process.env.PROD_QA_SUPABASE_URL ?? "";
const ANON = process.env.PROD_QA_ANON_KEY ?? "";
const state = (slot: string) => resolve(__dirname, `.storage-state.prod-qa.${slot}.json`);
const ENABLED = process.env.PROD_QA_WALK === "1";
const MEMBER = ENABLED && SUPA !== "" && ANON !== "" && existsSync(state("worker"));
test.skip(!ENABLED, "production walk: runs only in prod-qa-walk.yml");
test.describe.configure({ timeout: 300_000, retries: 0 });
test.use({ actionTimeout: 30_000, channel: "chrome" });

function record(label: string, pass: boolean, detail: string): void {
  console.info(`[result] ${label}: ${pass ? "PASS" : "FAIL"} ${detail}`);
  expect.soft(pass, `${label}: ${detail}`).toBe(true);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

interface Board {
  url: string;
  final: string;
  ms: number;
  count: number | null;
  ids: string[];
  unavailable: boolean;
  sideways: boolean;
}

/** Open a board URL and read what a person sees: the count line, the cards, the honest failure line. */
async function board(page: Page, url: string): Promise<Board> {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const count = page.locator('main p[role="status"]:not([data-testid])').first();
  const unavailable = page.getByTestId("public-jobs-unavailable");
  await expect(count.or(unavailable).first()).toBeVisible({ timeout: 60_000 });
  const ms = Date.now() - t0;
  const isUnavailable = await unavailable.isVisible();
  const line = isUnavailable ? "" : await count.innerText();
  const n = /(\d[\d\s ]*)\s*rasta/.exec(line)?.[1]?.replace(/[\s ]/g, "");
  const ids = await page
    .locator('main a[href^="/lt/jobs/"]')
    .evaluateAll((links) =>
      [...new Set(links.map((a) => (a.getAttribute("href") ?? "").match(/\/jobs\/([0-9a-f-]{36})$/)?.[1] ?? ""))].filter(Boolean),
    );
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const u = new URL(page.url());
  return { url, final: u.pathname + u.search, ms, count: n ? Number(n) : null, ids, unavailable: isUnavailable, sideways };
}

const line = (b: Board) =>
  `url=${b.url} final=${b.final} count=${b.count ?? "?"} cards=${b.ids.length} ms=${b.ms}${b.unavailable ? " unavailable=true" : ""}`;
const overlap = (a: Board, b: Board) => a.ids.filter((id) => b.ids.includes(id)).length;

async function stranger(browser: Browser, viewport = { width: 1280, height: 800 }) {
  const ctx = await browser.newContext(firstVisit({ viewport, locale: "lt-LT" }));
  return { ctx, page: await ctx.newPage() };
}

test("S-1…S-8. free text and filters find the ads that exist (signed out)", async ({ browser }) => {
  const { ctx, page } = await stranger(browser);
  const unfiltered = await board(page, "/lt/jobs");
  record("S-1 unfiltered board", (unfiltered.count ?? 0) > 1000 && unfiltered.ids.length === 20, line(unfiltered));
  // Original Swedish and Norwegian titles, and a Lithuanian word. byggarbetare is SR-10.
  for (const [label, q] of [
    ["S-2 byggarbetare (SR-10)", "byggarbetare"],
    ["S-3 lagerarbetare", "lagerarbetare"],
    ["S-4 undersköterska", "undersk%C3%B6terska"],
    ["S-5 personlig assistent (NO)", "personlig%20assistent"],
    ["S-6 suvirintojas (LT)", "suvirintojas"],
  ] as const) {
    const b = await board(page, `/lt/jobs?q=${q}`);
    record(label, !b.unavailable && (b.count ?? 0) > 0 && b.ids.length > 0, line(b));
  }
  const profession = await board(page, "/lt/jobs?profession=general_laborer");
  record("S-7 profession filter", (profession.count ?? 0) > 0 && profession.ids.length > 0, line(profession));
  // The board offers no country filter; a country in the URL must still narrow, or it is ignored.
  for (const c of ["NO", "SE"]) {
    const b = await board(page, `/lt/jobs?country=${c}`);
    record(`S-8 country=${c} narrows the board`, overlap(b, unfiltered) < b.ids.length, `${line(b)} same_as_unfiltered=${overlap(b, unfiltered)}/${b.ids.length}`);
  }
  await ctx.close();
});

test("S-9…S-12. pages 2 and 3 are new cards and keep their page (signed out)", async ({ browser }) => {
  const { ctx, page } = await stranger(browser);
  for (const [label, base] of [
    ["S-9 unfiltered", "/lt/jobs?"],
    ["S-10 profession", "/lt/jobs?profession=general_laborer&"],
    ["S-11 free text", "/lt/jobs?q=lagerarbetare&"],
  ] as const) {
    const p1 = await board(page, base.replace(/[?&]$/, ""));
    const p2 = await board(page, `${base}page=2`);
    const p3 = await board(page, `${base}page=3`);
    const kept = p2.final.includes("page=2") && p3.final.includes("page=3");
    record(
      `${label} p1/p2/p3`,
      kept && overlap(p1, p2) === 0 && overlap(p2, p3) === 0 && p2.ids.length > 0 && p3.ids.length > 0,
      `${line(p2)} | ${line(p3)} overlap12=${overlap(p1, p2)} overlap23=${overlap(p2, p3)}`,
    );
  }
  // SR-4: a word that maps to a profession must keep its page.
  const typed1 = await board(page, "/lt/jobs?q=elektrikas");
  const typed2 = await board(page, "/lt/jobs?q=elektrikas&page=2");
  record(
    "S-12 elektrikas page 2 (SR-4)",
    typed2.final.includes("page=2") && overlap(typed1, typed2) === 0,
    `${line(typed2)} overlap_with_p1=${overlap(typed1, typed2)}`,
  );
  await ctx.close();
});

test("S-13. a rare word answers in time with the honest empty state (signed out)", async ({ browser }) => {
  const { ctx, page } = await stranger(browser);
  for (const q of ["akupunkt%C5%ABristas", "zqxwvk"]) {
    const b = await board(page, `/lt/jobs?q=${q}`);
    record(`S-13 rare word ${q}`, !b.unavailable && b.count === 0 && b.ms < 10_000, line(b));
  }
  await ctx.close();
});

test("S-14. the same at 390 px: paging and free text, no sideways scroll (signed out)", async ({ browser }) => {
  const { ctx, page } = await stranger(browser, { width: 390, height: 844 });
  const paged = await board(page, "/lt/jobs?q=lagerarbetare&page=2");
  record("S-14 390 px lagerarbetare page 2", paged.final.includes("page=2") && paged.ids.length > 0 && !paged.sideways, `${line(paged)} sideways=${paged.sideways}`);
  const sv = await board(page, "/lt/jobs?q=byggarbetare");
  record("S-14 390 px byggarbetare (SR-10)", (sv.count ?? 0) > 0 && !sv.sideways, `${line(sv)} sideways=${sv.sideways}`);
  await ctx.close();
});

test("H-1 (#3033). a member reads three Norwegian ads as text: no tags, no live markup, paragraphs and lists kept", async ({ browser }) => {
  test.skip(!MEMBER, "needs the minted worker session");
  const ctx = await browser.newContext({ storageState: state("worker"), locale: "lt-LT" });
  const page = await ctx.newPage();
  const candidates: string[] = [];
  for (const word of ["sykepleier", "t%C3%B8mrer", "elektriker", "personlig%20assistent", "renholder"]) {
    await page.goto(`/lt/jobs?q=${word}`);
    await expect(page.locator('main p[role="status"]').first()).toBeVisible({ timeout: 60_000 });
    const hrefs = await page
      .locator('main a[href^="/lt/jobs/"]')
      .filter({ hasText: /norveg/i })
      .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    for (const h of hrefs) if (/\/jobs\/[0-9a-f-]{36}$/.test(h) && !candidates.includes(h)) candidates.push(h);
    if (candidates.length >= 12) break;
  }
  let checked = 0;
  for (const href of candidates) {
    if (checked >= 3) break;
    await page.goto(href);
    // The publisher's words: the one text paragraph in the source language (the
    // translation result carries its own test id and is excluded).
    const body = page.locator("main section p.whitespace-pre-line[lang]:not([data-testid])").first();
    if (!(await body.isVisible({ timeout: 30_000 }).catch(() => false))) continue;
    const text = await body.innerText();
    const bullets = (text.match(/^\s*•/gm) ?? []).length;
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
    // Only ads whose source carried structure (lists or several paragraphs) prove #3033.
    if (bullets === 0 && paragraphs < 2) continue;
    checked += 1;
    const id = href.split("/").pop();
    const live = await body.evaluate((el) => {
      const section = el.closest("section")!;
      return {
        children: el.children.length,
        injected: section.querySelectorAll("script, iframe, object, embed, style, img, a, form").length,
        handlers: [...section.querySelectorAll("*")].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length,
      };
    });
    const tags = /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(text);
    const entities = /&(nbsp|amp|lt|gt|quot|#\d+);/.test(text);
    record(
      `H-1 ad ${id}`,
      !tags && !entities && live.children === 0 && live.injected === 0 && live.handlers === 0 && text.length > 200,
      `len=${text.length} lines=${text.split("\n").length} paragraphs=${paragraphs} bullets=${bullets} tags=${tags} entities=${entities} ` +
        `elements_in_text=${live.children} injected=${live.injected} on_attrs=${live.handlers} ` +
        `sha_first80=${sha(text.slice(0, 80))} sha_last80=${sha(text.slice(-80))} sha_all=${sha(text)}`,
    );
  }
  record("H-1 three structured Norwegian ads found", checked >= 3, `checked=${checked} candidates=${candidates.length}`);
  await ctx.close();
});
