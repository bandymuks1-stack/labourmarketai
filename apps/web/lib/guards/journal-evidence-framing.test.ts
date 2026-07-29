import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Journal framing guard (slice journal-evidence-v1, reframed in fix/cv,
 * re-titled in cv-workspace-ia).
 *
 * The worker-facing Work Journal must read as the worker's simple work records
 * that strengthen the work card and feed the CV — NOT as bureaucratic
 * "evidence/įrodymai", not a technical journal/draft module, and not a second
 * surface titled "Mano CV" (only /cv carries that title). Pins:
 *   - the surface is framed as the worker's work records + connected to the
 *     work card,
 *   - worker-facing copy carries no heavy draft/module/pipeline wording,
 *   - the benefit line is honest (adding to the CV is NOT automatic verification),
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
  "listTitle",
  "listEmpty",
  "listEmptyTitle",
  "listEmptyNext",
  "listEmptyCta",
  "whatDidYouDo",
] as const;

describe("journal is framed as the worker's work records connected to the work card", () => {
  it("LT title reads as work records (not 'įrodymai', not a second 'Mano CV')", () => {
    // Canonical-term unification (worker-workspace UX audit v2): the H1 is
    // the ONE canonical "Darbo žurnalas" (same as the nav tab); the records
    // framing stays on listTitle ("Darbo įrašai") directly below it.
    expect(ltJ.navTitle).toMatch(/darbo (įraš|žurnal)/i);
    expect(ltJ.navTitle).not.toMatch(/cv/i);
    expect(ltJ.navTitle).not.toMatch(/įrodym/i);
    expect(ltJ.navSubtitle).toMatch(/darbo kortel/i);
    expect(ltJ.composerBenefit).toMatch(/darbo kortel/i);
  });
  it("EN title reads as work records (not 'evidence', not a second 'My CV')", () => {
    expect(enJ.navTitle).toMatch(/work (record|journal)/i);
    expect(enJ.navTitle).not.toMatch(/cv/i);
    expect(enJ.navTitle).not.toMatch(/evidence/i);
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

// Quiet-UI reframe (fix/cv): the section-level "only a person confirms" honesty
// paragraph (benefitNotAuto) was REMOVED from normal user UI per the owner — the
// composer now shows short labels/status only, no confirmation/verification
// disclaimer. Honesty is preserved structurally (status labels reflect real
// state; no fake-verified claim) and enforced by `no-disclaimer-ui.test.ts`.

describe("journal entry surface stays focused", () => {
  const page = read(PAGE);
  it("renders the evidence subtitle + the log-via-chat framing (owner audit §6.1)", () => {
    expect(page).toMatch(/journal-nav-subtitle/);
    expect(page).toMatch(/navSubtitle/);
    // Intake framing: work is logged in the CONVERSATION; the page states it.
    expect(page).toMatch(/journal-log-via-chat/);
    expect(page).toMatch(/logViaChatBody/);
  });
  it("has at most one primary gradient CTA on the page", () => {
    const n = (page.match(/from-brand-blue to-brand-cyan|variant="primary"/g) ?? []).length;
    expect(n).toBeLessThanOrEqual(1);
  });
});
