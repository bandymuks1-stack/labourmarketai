import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal → "Mano darbo įrodymai" framing guard (slice journal-evidence-v1, PR C).
 *
 * The worker-facing Work Journal must read as a simple EVIDENCE path that
 * strengthens the work card — not a technical journal/draft module. Pins:
 *   - the surface is framed as evidence + connected to the work card,
 *   - worker-facing copy carries no heavy draft/module/pipeline wording,
 *   - the benefit line is honest (evidence is NOT automatic verification),
 *   - one primary CTA on the journal entry surface.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const ltJ = JSON.parse(read("messages/lt/journal.json")) as Record<string, string>;
const enJ = JSON.parse(read("messages/en/journal.json")) as Record<string, string>;
const PAGE = "app/[locale]/dashboard/journal/page.tsx";

// The worker-facing journal strings this slice owns. (The `inbox.*` block is the
// MANAGER review surface and legitimately uses review wording — out of scope.)
const WORKER_KEYS = [
  "navTitle",
  "navSubtitle",
  "composerBenefit",
  "benefitNotAuto",
  "listTitle",
  "listEmpty",
  "listEmptyTitle",
  "listEmptyNext",
  "listEmptyCta",
  "whatDidYouDo",
] as const;

describe("journal is framed as work evidence connected to the work card", () => {
  it("LT title + subtitle name evidence and the work card", () => {
    expect(ltJ.navTitle).toMatch(/įrodym/i);
    expect(ltJ.navSubtitle).toMatch(/darbo kortel/i);
    expect(ltJ.composerBenefit).toMatch(/darbo kortel/i);
  });
  it("EN title + subtitle mirror the evidence + work-card framing", () => {
    expect(enJ.navTitle).toMatch(/evidence/i);
    expect(enJ.navSubtitle).toMatch(/work card/i);
    expect(enJ.composerBenefit).toMatch(/work card/i);
  });
  it("both locales expose every worker-facing key (LT/EN parity for this slice)", () => {
    for (const k of WORKER_KEYS) {
      expect(typeof ltJ[k] === "string" && ltJ[k].trim().length > 0, `lt journal.${k}`).toBe(true);
      expect(typeof enJ[k] === "string" && enJ[k].trim().length > 0, `en journal.${k}`).toBe(true);
    }
  });
});

describe("no heavy technical / module / draft wording on worker-facing copy", () => {
  const HEAVY =
    /server draft|stale draft|draft state|submission pipeline|journal module|žurnalo modul|\bmodulis\b|\bmodule\b|dienorašt/i;
  for (const [name, j] of [["lt", ltJ], ["en", enJ]] as const) {
    it(`${name}: the worker-facing keys carry no heavy wording`, () => {
      for (const k of WORKER_KEYS) {
        expect(HEAVY.test(j[k] ?? ""), `${name} journal.${k}: "${j[k]}"`).toBe(false);
      }
    });
  }
});

describe("benefit copy is honest — only a person confirms (no auto-verify claim)", () => {
  // Phrased AFFIRMATIVELY (a human confirms) so it never carries the forbidden
  // "automatic verification" substring that the honesty guards block.
  it("LT benefitNotAuto says only a person (manager/client) can confirm", () => {
    expect(ltJ.benefitNotAuto).toMatch(/žmogus/i);
    expect(ltJ.benefitNotAuto).toMatch(/vadovas|klient/i);
    expect(ltJ.benefitNotAuto).not.toMatch(/automat/i);
  });
  it("EN benefitNotAuto says only a person (manager/client) can confirm", () => {
    expect(enJ.benefitNotAuto).toMatch(/person/i);
    expect(enJ.benefitNotAuto).toMatch(/manager|client/i);
    expect(enJ.benefitNotAuto).not.toMatch(/automatic/i);
  });
});

describe("journal entry surface stays focused", () => {
  const page = read(PAGE);
  it("renders the evidence subtitle + composer benefit line", () => {
    expect(page).toMatch(/journal-nav-subtitle/);
    expect(page).toMatch(/journal-composer-benefit/);
    expect(page).toMatch(/navSubtitle/);
    expect(page).toMatch(/composerBenefit/);
  });
  it("has at most one primary gradient CTA on the page", () => {
    const n = (page.match(/from-brand-blue to-brand-cyan|variant="primary"/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(1);
  });
});
