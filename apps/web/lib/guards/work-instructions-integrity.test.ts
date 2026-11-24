import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Work-instructions integrity guard (slice work-instructions-v1).
 *
 * Pins the non-negotiable honesty rules: the ORIGINAL is preserved + always
 * viewable, a translation never replaces the original, the translation-
 * unavailable state is honest, and there is no fake translation / read receipt /
 * delivery / AI-understanding wording.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const ins = (j: Record<string, unknown>) =>
  j.instructions as {
    card: Record<string, string>;
    manager: Record<string, string>;
    worker: Record<string, string>;
    [k: string]: unknown;
  };
const card = read("components/app/worker-instruction-card.tsx");
const composer = read("components/app/manager-instruction-composer.tsx");
const page = read("app/[locale]/dashboard/instructions/page.tsx");

describe("the original is preserved and always viewable", () => {
  it("the worker card renders the original text + a show-original control", () => {
    expect(card).toMatch(/instruction\.originalText/);
    expect(card).toMatch(/data-testid="instruction-show-original"/);
    expect(card).toMatch(/data-testid="instruction-original"/);
  });
  it("a translation is only shown when actually available, never replacing the original", () => {
    // Translation block is gated on translationStatus === 'available' + a real
    // translatedText; otherwise the honest unavailable state shows.
    expect(card).toMatch(/translationStatus\s*===\s*["']available["']/);
    expect(card).toMatch(/translatedText/);
    expect(card).toMatch(/data-testid="instruction-translation-unavailable"/);
  });
});

describe("honest translation state — no fake translation / certainty", () => {
  it("LT + EN expose an honest 'not ready' translation state + original-preserved help", () => {
    for (const j of [lt, en]) {
      expect(ins(j).card.translationUnavailable, "translationUnavailable").toBeTruthy();
      expect(ins(j).card.helpLine).toBeTruthy();
    }
    expect(ins(lt).card.translationUnavailable).toMatch(/dar neparuoštas|neparuoštas/i);
    expect(ins(en).card.translationUnavailable).toMatch(/not ready/i);
    expect(ins(lt).card.helpLine).toMatch(/originalas išlieka|išsaugot/i);
    expect(ins(en).card.helpLine).toMatch(/original stays|preserved/i);
  });
  it("no perfect-translation / fake-certainty / AI-understanding wording", () => {
    const blob = [JSON.stringify(ins(lt)), JSON.stringify(ins(en))].join(" ");
    expect(blob).not.toMatch(/perfect translation|tikslus vertimas|garantuo\w*\s+vertim|guaranteed translation/i);
    expect(blob).not.toMatch(/\bai\b\s+(understands|supranta)|dirbtinis intelektas supranta/i);
  });
});

describe("no fake read receipt / delivery state in the instruction UI", () => {
  it("components render no delivered/read/seen/typing pretence", () => {
    const all = [card, composer].join("\n");
    expect(all).not.toMatch(/\bdelivered\b|\bread receipt\b|\bseen\b|is typing|pristatyta|perskaityta/i);
  });
});

describe("no demo/sample data; instructions render only real passed-in values", () => {
  it("the card/composer invent no sample instruction text", () => {
    const all = [card, composer].join("\n");
    expect(all).not.toMatch(/\bsample\b|\bdemo\b|lorem ipsum|pavyzdinis nurodym/i);
    // The card body comes from the instruction prop, not a literal.
    expect(card).toMatch(/instruction\.originalText/);
  });
});

describe("framed as a safety + convenience communication foundation", () => {
  const fLt = ins(lt).foundationNote as unknown as string;
  const fEn = ins(en).foundationNote as unknown as string;
  it("LT + EN carry a foundation note naming both safety AND convenience", () => {
    expect(fLt).toMatch(/saug/i);
    expect(fLt).toMatch(/patog/i);
    expect(fEn).toMatch(/safety/i);
    expect(fEn).toMatch(/convenience/i);
  });
  it("the page surfaces the foundation note", () => {
    expect(page).toMatch(/data-testid="instructions-foundation-note"/);
    expect(page).toMatch(/foundationNote/);
  });
});

describe("route is role-aware + reachable; copy present in LT + EN", () => {
  it("the instructions route renders manager composer or worker view by role", () => {
    expect(page).toMatch(/<ManagerInstructionComposer\b/);
    expect(page).toMatch(/<WorkerInstructionCard\b/);
    expect(page).toMatch(/MANAGER_ROLES/);
  });
  it("LT + EN expose the worker + manager + card copy", () => {
    for (const j of [lt, en]) {
      expect(ins(j).workerTitle).toBeTruthy();
      expect(ins(j).managerTitle).toBeTruthy();
      expect(ins(j).worker.empty).toBeTruthy();
      for (const k of ["workerLabel", "bodyLabel", "send", "notAuthorized", "noWorkers"]) {
        expect(ins(j).manager[k], `manager.${k}`).toBeTruthy();
      }
      for (const k of ["showOriginal", "clarify", "clarifyBody", "safetyNote"]) {
        expect(ins(j).card[k], `card.${k}`).toBeTruthy();
      }
    }
  });
});
