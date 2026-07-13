import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { placeholders } from "@/content/placeholders";

/**
 * Guard: P0 authenticated UI reality audit (2026-06-16).
 *
 * Owner-reported launch blockers from real logged-in testing:
 *   - /dashboard/search was a dead "numatoma M2" placeholder that opened nothing;
 *   - the market map read as an empty "ruošiama" (being prepared) canvas;
 *   - internal roadmap milestone codes (M2/M3/M5…) leaked into user-facing copy.
 *
 * This guard locks the fixes so they cannot silently regress. It is a static,
 * secret-free, no-DB source/i18n contract — it runs in CI via `pnpm -F web test`.
 *
 * Doctrine: PLATFORM_DOCTRINE §7 (no fake UI), §18 (honest product copy);
 * CLAUDE.md "no unlabeled fake data / no broken CTA / no roadmap labels".
 */

const APP_ROOT = join(__dirname, "..", "..");
const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(read(join("messages", `${locale}.json`))) as Record<string, unknown>;
}
function sub(root: Record<string, unknown>, path: string): unknown {
  let cur: unknown = root;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}
/** All string leaf values under `node`, with their dotted key paths. */
function stringLeaves(node: unknown, prefix = "", out: [string, string][] = []): [string, string][] {
  if (typeof node === "string") {
    out.push([prefix, node]);
  } else if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      stringLeaves(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

// ── Rule A: NO internal milestone codes anywhere in served copy ──
// M0–M9 are internal roadmap milestones; they must never reach a user.
const MILESTONE = /\bM[0-9]\b/;

describe("P0 reality: no internal milestone codes in user-facing copy", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}.json has no M0–M9 milestone code in any value`, () => {
      const offenders = stringLeaves(loadMessages(locale))
        .filter(([, v]) => MILESTONE.test(v))
        .map(([k, v]) => `${k}: "${v}"`);
      expect(offenders, `milestone codes leaked:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

describe("P0 reality: no milestone codes in rendered placeholder values", () => {
  // content/placeholders.ts `value.{lt,en,ru}` strings ARE rendered to users
  // (e.g. the legal-page draft notes). Internal metadata (addedIn / Milestone
  // type / replacementSource) is NOT scanned — only the user-facing value.
  it("no placeholder value (lt/en/ru) leaks an M0–M9 code", () => {
    const offenders: string[] = [];
    for (const p of placeholders) {
      const v = p.value as Record<string, unknown> | undefined;
      if (!v) continue;
      for (const loc of ACTIVE_LOCALES) {
        const s = v[loc];
        if (typeof s === "string" && MILESTONE.test(s)) {
          offenders.push(`${p.id}.${loc}: "${s}"`);
        }
      }
    }
    expect(offenders, `milestone codes in placeholder values:\n${offenders.join("\n")}`).toEqual([]);
  });
});

// ── Rule B: NO roadmap-placeholder words in authenticated product copy ──
// Scoped to the namespaces a logged-in user reads in the product. Public
// marketing (waitlist) and legal draft notices are intentionally out of scope:
// a waitlist may say "coming soon", a legal page may say "draft".
const PRODUCT_NAMESPACES = ["auth.dashboard", "marketMap", "skills"] as const;
const ROADMAP_WORD = /\bnumatoma\b|\bplanned\b|coming soon|\bTODO\b/i;

describe("P0 reality: authenticated product copy carries no roadmap labels", () => {
  for (const locale of ACTIVE_LOCALES) {
    const m = loadMessages(locale);
    for (const ns of PRODUCT_NAMESPACES) {
      it(`${locale} "${ns}" has no roadmap placeholder words`, () => {
        const node = sub(m, ns);
        const offenders = stringLeaves(node)
          .filter(([, v]) => ROADMAP_WORD.test(v))
          .map(([k, v]) => `${ns}.${k}: "${v}"`);
        expect(offenders, `roadmap labels leaked:\n${offenders.join("\n")}`).toEqual([]);
      });
    }
  }
});

// ── Rule C: RETIRED (canonical-user-journey v1). The unlinked
// /dashboard/search router page was removed entirely — the ONE CommandFinder
// is embedded on /dashboard, so there is no search route left to guard.
// Rule D below still pins that nothing links to the removed route.

// ── Rule D: the candidates room "search workers" CTA points at a real route ──
describe("P0 reality: candidates room primary CTA is not the dead search page", () => {
  const candidates = read("app/[locale]/dashboard/candidates/page.tsx");
  it("does not send users to the removed /dashboard/search route", () => {
    expect(candidates).not.toMatch(/primaryHref="\/dashboard\/search"/);
  });
  it("points the primary action at the real scouting engine", () => {
    expect(candidates).toMatch(/primaryHref="\/dashboard\/company\/scouting"/);
  });
});

// ── Rule E: the market map no longer reads as an unfinished "preparing" canvas ──
describe("P0 reality: market map is framed as a live signal map, not 'preparing'", () => {
  const shell = read("components/app/market-map-shell.tsx");
  it("does not tag the filter/scope bar as 'preparing'", () => {
    expect(shell).not.toMatch(/t\("preparing"\)/);
  });
  it("frames the dimension bar as a signal scope", () => {
    expect(shell).toMatch(/t\("scopeTitle"\)/);
  });
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: market map empty/layers copy is not a 'preparing canvas' / 'planned layers'`, () => {
      const m = loadMessages(locale);
      const title = String(sub(m, "marketMap.canvasEmptyTitle") ?? "");
      const layers = String(sub(m, "marketMap.layersTitle") ?? "");
      expect(title).not.toMatch(/ruošiama|готовится|being prepared/i);
      expect(layers).not.toMatch(/\bplanned\b|planuojam|планируем/i);
      expect(String(sub(m, "marketMap.scopeTitle") ?? "").trim().length > 0).toBe(true);
    });
  }
});
