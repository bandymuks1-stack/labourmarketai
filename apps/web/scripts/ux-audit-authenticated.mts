/**
 * Authenticated UX MEASUREMENT — local stack only.
 *
 * This script does not fix anything and does not have an opinion. It walks
 * representative authenticated routes at a desktop and a phone width with a
 * real signed-in session and reports numbers, so that "the page is too long"
 * or "there are two of those" is a measurement rather than a memory.
 *
 * It exists because a previous UX round produced two defects that did not
 * reproduce — "overlapping header" and "empty contexts" — both artifacts of
 * reading a collapsed `<details>` as empty. Everything below is reported with
 * a number and a way to re-run it, and collapsed disclosures are excluded from
 * the empty-block count by construction.
 *
 * Per route, per width:
 *   height           full document height in px
 *   overflowX        body.scrollWidth − documentElement.clientWidth
 *   headerScroll     sideways scroll inside the header itself
 *   h1 / h2          heading inflation in <main>
 *   emptyBlocks      card-shaped elements with no text and no control
 *   longCopy         paragraphs over 300 characters
 *   contextControls  visible controls naming the active workspace/role
 *   clipped          primary controls whose box leaves the viewport
 *   details          disclosures, and how many are open
 *   firstViewport    the text actually visible without scrolling
 *
 * Usage (server running, local stack):
 *   npx tsx scripts/ux-audit-authenticated.mts > report.json
 */
import { chromium, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_BASE_URL ?? "http://127.0.0.1:3108";
const E2E = join(process.cwd(), "tests", "e2e");

type Persona = { name: string; state: string; routes: string[] };

const PERSONAS: Persona[] = [
  {
    name: "worker",
    state: ".storage-state.worker.json",
    routes: [
      "/lt/dashboard",
      "/lt/dashboard/journal",
      "/lt/dashboard/profile",
      "/lt/dashboard/opportunities",
      "/lt/dashboard/account",
      "/lt/dashboard/network",
    ],
  },
  {
    name: "company",
    state: ".storage-state.company.json",
    routes: [
      "/lt/dashboard/company",
      "/lt/dashboard/company/scouting",
      "/lt/dashboard/projects",
      "/lt/dashboard/market/recognize",
      "/lt/dashboard/people",
    ],
  },
];

const WIDTHS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 375, height: 812 },
];

/**
 * Evaluated as a STRING, deliberately.
 *
 * `tsx` transpiles this file with esbuild, which injects a `__name` helper into
 * transpiled functions. A function passed to `page.evaluate` is serialized WITH
 * that helper, and the browser has never heard of it — every route failed with
 * `ReferenceError: __name is not defined`. A string body is never transpiled,
 * so it must also be plain JS: no type annotations below.
 */
const MEASURE_BODY = `
  const vh = window.innerHeight;
  const text = (el) => (el.textContent || "").trim();
  const visible = (el) => el.offsetParent !== null;

  // A "block" is a card-shaped container — the unit a reader perceives as a
  // section. Counting every div would drown the signal.
  const blocks = Array.from(
    document.querySelectorAll("section, article, [class*='card-border']")
  );

  const emptyBlocks = blocks.filter((b) => {
    // A COLLAPSED disclosure is not an empty block. This is precisely the
    // mistake the previous round made, so it is excluded structurally.
    if (b.querySelector("details:not([open])")) return false;
    if (b.closest("details:not([open])")) return false;
    const r = b.getBoundingClientRect();
    return !text(b) && !b.querySelector("button, a, input, select, textarea") && r.height > 8;
  }).map((b) => String(b.className).slice(0, 60));

  const longCopy = Array.from(document.querySelectorAll("main p"))
    .filter((p) => text(p).length > 300 && !p.closest("details:not([open])"))
    .map((p) => text(p).slice(0, 100));

  // Controls that let a user CHANGE or SWITCH the active context. Two visible
  // at once is the duplicate-context defect.
  //
  // The first version of this matched any testid CONTAINING "workspace", and
  // reported NINE on /dashboard — which looked alarming and was nonsense: eight
  // of them were \`personal-workspace-intro-*\`, the sub-elements of a single
  // intro block. That is the same false positive as the "empty contexts" the
  // previous UX round chased, arriving by a different route, and it is exactly
  // what this tool exists to avoid producing. An exact allowlist of the real
  // switchers replaces the substring match.
  const SWITCHERS = ["workspace-chip", "role-switcher", "workspace-switcher"];
  const contextControls = Array.from(document.querySelectorAll("[data-testid]"))
    .filter((el) => SWITCHERS.indexOf(el.getAttribute("data-testid")) !== -1)
    .filter(visible)
    .map((el) => el.getAttribute("data-testid"));

  const header = document.querySelector("header");
  const headerScroll = header ? Math.max(0, header.scrollWidth - header.clientWidth) : 0;

  const clipped = Array.from(document.querySelectorAll(
    "header button, header a, main button[type='submit'], [data-testid$='-submit']"
  )).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
  }).map((el) => el.getAttribute("data-testid") || text(el).slice(0, 30) || "?");

  const details = Array.from(document.querySelectorAll("details"));

  const firstViewport = Array.from(document.querySelectorAll("main *"))
    .filter((el) => {
      if (el.children.length !== 0 || !text(el)) return false;
      const r = el.getBoundingClientRect();
      return r.top < vh && r.bottom > 0;
    })
    .map(text)
    .join(" | ")
    .slice(0, 500);

  return {
    height: document.documentElement.scrollHeight,
    overflowX: document.body.scrollWidth - document.documentElement.clientWidth,
    headerScroll,
    h1: document.querySelectorAll("main h1").length,
    h2: document.querySelectorAll("main h2").length,
    blocks: blocks.length,
    emptyBlocks,
    longCopy,
    contextControls,
    clipped,
    detailsTotal: details.length,
    detailsOpen: details.filter((d) => d.open).length,
    firstViewport,
  };
`;

async function measure(page: Page, url: string) {
  const errors: string[] = [];
  const onError = (e: Error) => errors.push(e.message);
  page.on("pageerror", onError);
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  const measured = (await page.evaluate(
    `(() => {${MEASURE_BODY}})()`,
  )) as Record<string, unknown>;
  page.off("pageerror", onError);
  return {
    status: res?.status() ?? 0,
    finalUrl: page.url(),
    errors,
    ...measured,
  };
}

const out: Record<string, unknown> = {};
const browser = await chromium.launch();

for (const persona of PERSONAS) {
  const statePath = join(E2E, persona.state);
  if (!existsSync(statePath)) {
    out[persona.name] = { skipped: `missing ${persona.state}` };
    continue;
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({
      storageState: state,
      viewport: { width: w.width, height: w.height },
    });
    const page = await ctx.newPage();
    for (const route of persona.routes) {
      const key = `${persona.name} ${w.label} ${route}`;
      try {
        out[key] = await measure(page, `${BASE}${route}`);
      } catch (e) {
        out[key] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
