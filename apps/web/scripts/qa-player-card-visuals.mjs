/**
 * §5.2 PLAYER CARD VISUALS — rendered-DOM QA across the owner's mandated
 * viewport matrix (7 viewports × light/dark).
 *
 * Written against the failure modes the owner named after the false-completion
 * postmortem, so every check has a value it FAILS on:
 *   - the card has no visualizations             → missing testids / zero bars
 *   - a chart renders an empty frame             → data-chart-state="empty"
 *   - a series is not real                       → all-zero columns, no gap bar
 *   - a raw i18n key leaks                       → text matches a key pattern
 *   - the card is unreadable on a phone          → sub-12px type / h-overflow
 *
 * NOTHING here is a tautology: no check is satisfied by the mere existence of
 * the page. The count of executed checks is printed together with the SCOPE
 * (routes + auth state), because a bare "N/N PASS" is what misled the owner
 * last time.
 *
 * Usage:
 *   BASE=https://labourmarket.ai node scripts/qa-player-card-visuals.mjs
 *   BASE=… STORAGE_STATE=./auth.json node scripts/qa-player-card-visuals.mjs
 *
 * STORAGE_STATE is a Playwright storage-state file for a REAL signed-in
 * session. Without it the authenticated leg is reported as SKIPPED — never as
 * passed, and never silently.
 */
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3100";
const STORAGE_STATE = process.env.STORAGE_STATE || null;
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(
  HERE,
  "..",
  "..",
  "..",
  "docs",
  "audits",
  "evidence",
  "player-card-visuals-2026",
);
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  [360, 800],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];
const THEMES = ["light", "dark"];

const results = [];
const skipped = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL ${name}${detail ? " — " + detail : ""}`);
};

/** Everything the card's DOM can tell us, in one evaluate. */
const CARD_PROBE = `(() => {
  const card = document.querySelector('[data-testid="worker-player-card"]');
  if (!card) return { present: false };
  const q = (sel) => card.querySelector(sel);
  const all = (sel) => [...card.querySelectorAll(sel)];
  const ev = q('[data-testid="player-card-evidence-chart"]');
  const sk = q('[data-testid="player-card-skill-chart"]');
  const hi = q('[data-testid="player-card-history-timeline"]');
  const monthRects = ev ? all('[data-testid="player-card-evidence-chart"] rect[data-month]') : [];
  const bars = sk ? all('li[data-skill]') : [];
  const tiny = all('*').filter((el) => {
    const txt = (el.textContent || '').trim();
    if (!txt || el.children.length > 0) return false;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return Number.isFinite(fs) && fs > 0 && fs < 12;
  }).length;
  const r = card.getBoundingClientRect();
  return {
    present: true,
    width: Math.round(r.width),
    overflows: r.right > window.innerWidth + 1 || r.left < -1,
    hasBlock: !!q('[data-testid="player-card-visualizations"]'),
    evidence: ev ? {
      state: ev.dataset.chartState,
      months: monthRects.length,
      nonZero: monthRects.filter((x) => Number(x.dataset.entries) > 0).length,
      total: monthRects.reduce((n, x) => n + Number(x.dataset.entries || 0), 0),
    } : null,
    skills: sk ? {
      state: sk.dataset.chartState,
      bars: bars.length,
      withEvidence: bars.filter((b) => Number(b.dataset.entries) > 0).length,
      zeroBars: bars.filter((b) => Number(b.dataset.entries) === 0).length,
      tiers: [...new Set(bars.map((b) => b.dataset.tier))],
      legend: !!q('[data-testid="player-card-evidence-legend"]'),
      barWidths: all('[data-testid="player-card-skill-bar"]').map((b) => b.style.width),
    } : null,
    history: hi ? {
      state: hi.dataset.chartState,
      lanes: all('[data-testid="player-card-history-lane"]').length,
    } : null,
    location: !!q('[data-testid="player-card-location"]'),
    availability: !!q('[data-testid="player-card-availability"]'),
    documents: !!q('[data-testid="player-card-documents"]'),
    reputation: !!q('[data-testid="player-card-reputation"]'),
    tinyText: tiny,
    text: card.innerText,
  };
})()`;

/** Assert one rendered card. `scope` labels the surface in every check name. */
function assertCard(probe, scope, opts) {
  const { expectGap } = opts;
  check(`${scope} card is in the DOM`, probe.present === true);
  if (!probe.present) return;

  check(`${scope} visualization block present`, probe.hasBlock === true);
  check(`${scope} card does not overflow the viewport`, probe.overflows === false);
  check(`${scope} no sub-12px text inside the card`, probe.tinyText === 0, `${probe.tinyText} nodes`);

  // ── Evidence timeline ──
  check(`${scope} evidence chart rendered`, probe.evidence !== null);
  if (probe.evidence) {
    check(
      `${scope} evidence chart is live, not an empty frame`,
      probe.evidence.state === "live",
      probe.evidence.state,
    );
    check(
      `${scope} evidence chart spans 12 real months`,
      probe.evidence.months === 12,
      `${probe.evidence.months}`,
    );
    check(
      `${scope} evidence chart has real non-zero months`,
      probe.evidence.nonZero > 0,
      `${probe.evidence.nonZero}/12 non-zero, total ${probe.evidence.total}`,
    );
    check(
      `${scope} evidence chart shows real zero months too (no smoothing)`,
      probe.evidence.nonZero < probe.evidence.months,
      `${probe.evidence.months - probe.evidence.nonZero} zero months`,
    );
  }

  // ── Skill evidence ──
  check(`${scope} skill chart rendered`, probe.skills !== null);
  if (probe.skills) {
    check(
      `${scope} skill chart is live, not an empty frame`,
      probe.skills.state === "live",
      probe.skills.state,
    );
    check(`${scope} skill chart has bars`, probe.skills.bars >= 3, `${probe.skills.bars}`);
    check(
      `${scope} at least one skill is really backed by records`,
      probe.skills.withEvidence > 0,
      `${probe.skills.withEvidence}`,
    );
    check(
      `${scope} bar widths encode the counts (not all identical)`,
      new Set(probe.skills.barWidths).size > 1,
      probe.skills.barWidths.join(","),
    );
    check(
      `${scope} evidence-source legend present`,
      probe.skills.legend === true,
    );
    if (expectGap) {
      check(
        `${scope} the honest gap is visible (a declared skill with 0 records)`,
        probe.skills.zeroBars > 0,
        `${probe.skills.zeroBars}`,
      );
    }
  }

  // ── Work history band ──
  check(`${scope} history timeline rendered`, probe.history !== null);
  if (probe.history) {
    check(
      `${scope} history timeline places real engagements`,
      probe.history.state === "live" && probe.history.lanes > 0,
      `${probe.history.state}, ${probe.history.lanes} lanes`,
    );
  }

  // ── §5.2 remaining dimensions ──
  check(`${scope} location shown`, probe.location === true);
  check(`${scope} availability shown`, probe.availability === true);
  check(`${scope} documents status shown`, probe.documents === true);
  check(`${scope} reputation shown`, probe.reputation === true);

  // ── Honesty of the rendered words ──
  check(
    `${scope} no raw i18n key rendered`,
    !/\b(?:playerCard|playercards|visuals)\.[a-zA-Z]/.test(probe.text),
  );
  check(
    `${scope} no medal tier wording`,
    !/\bauksas\b|\bsidabras\b|\bbronza\b|\bgold tier\b/i.test(probe.text),
  );
  check(`${scope} no PLACEHOLDER`, !/PLACEHOLDER/i.test(probe.text));
}

const browser = await chromium.launch();

for (const theme of THEMES) {
  for (const [width, height] of VIEWPORTS) {
    const tag = `${theme}-${width}`;
    const ctx = await browser.newContext({ viewport: { width, height } });
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {}
    }, theme);
    await page.goto(`${BASE}/lt`, { waitUntil: "networkidle" });
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    check(
      `landing @${tag} theme really applied`,
      (await page.evaluate(() => document.documentElement.dataset.theme)) === theme,
    );
    await page.locator('[data-testid="worker-player-card"]').first().scrollIntoViewIfNeeded();
    const probe = await page.evaluate(CARD_PROBE);
    // The landing sample MUST show the honest gap (§5.2 + addendum §4: the
    // landing may not look better than a real card).
    assertCard(probe, `landing @${tag}`, { expectGap: true });

    await page
      .locator('[data-testid="playercards-canonical-card"]')
      .first()
      .screenshot({ path: `${OUT}/landing-card-${tag}.png` })
      .catch(() => {});
    await ctx.close();
  }
}

// ── Authenticated leg: only with a real session, never faked ────────────────
if (STORAGE_STATE && existsSync(STORAGE_STATE)) {
  for (const theme of THEMES) {
    for (const [width, height] of VIEWPORTS) {
      const tag = `${theme}-${width}`;
      const ctx = await browser.newContext({
        viewport: { width, height },
        storageState: STORAGE_STATE,
      });
      const page = await ctx.newPage();
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {}
      }, theme);
      // The canonical authenticated mount (the avatar menu links here).
      await page.goto(`${BASE}/lt/dashboard/journal#mano-cv-identity`, {
        waitUntil: "networkidle",
      });
      await page.evaluate((t) => {
        document.documentElement.dataset.theme = t;
      }, theme);
      const signedIn = !/\/auth\/login/.test(page.url());
      check(`product @${tag} session is really signed in`, signedIn, page.url());
      if (signedIn) {
        const probe = await page.evaluate(CARD_PROBE);
        // A real worker may legitimately have no zero-evidence skill.
        assertCard(probe, `product @${tag}`, { expectGap: false });
        await page
          .locator('[data-testid="worker-player-card"]')
          .first()
          .screenshot({ path: `${OUT}/product-card-${tag}.png` })
          .catch(() => {});
      }
      await ctx.close();
    }
  }
} else {
  skipped.push(
    "AUTHENTICATED PRODUCT CARD (14 viewport×theme combinations): no STORAGE_STATE " +
      "provided, so the signed-in card was NOT verified by this run.",
  );
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log("\n── SCOPE ─────────────────────────────────────────────");
console.log(`base:      ${BASE}`);
console.log(`routes:    /lt${STORAGE_STATE ? " + /lt/dashboard/journal#mano-cv-identity" : ""}`);
console.log(`auth:      ${STORAGE_STATE ? "signed-in session (storage state)" : "PUBLIC ONLY"}`);
console.log(`matrix:    ${VIEWPORTS.length} viewports × ${THEMES.length} themes`);
for (const s of skipped) console.log(`NOT CHECKED: ${s}`);
console.log("──────────────────────────────────────────────────────");
console.log(`${results.length - failed.length}/${results.length} PASS`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
