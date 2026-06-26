import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Employer-preview honesty guard (slice employer-preview-v1).
 *
 * "Taip jus galėtų matyti darbdavys" must mirror ONLY the worker's own saved
 * data back to them. It must never become a fake match / score / claim that an
 * employer is actually viewing them, and it must say plainly that the data is
 * self-provided + unverified.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

const ep = (json: Record<string, unknown>) =>
  (
    json.auth as {
      dashboard: { workCard: { employerPreview: Record<string, string> } };
    }
  ).dashboard.workCard.employerPreview;

describe("employer preview renders only real passed-in data", () => {
  const comp = read("components/app/employer-preview.tsx");
  // Strip comments so the component's own honesty note ("NOT a match / score")
  // is not mistaken for a rendered fake value.
  const compCode = comp
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  it("has no hardcoded score / match / percentage / fake employer in rendered code", () => {
    expect(compCode).not.toMatch(/\bscore\b|\bmatch(ing|ed|es)?\b|\d+\s?%|reitingas|balas/i);
  });
  it("renders the rows it is given (no fabricated values) + an unverified note", () => {
    expect(comp).toMatch(/rows\.map/);
    expect(comp).toMatch(/labels\.notSet/); // empty values say "not set", not faked
    expect(comp).toMatch(/labels\.unverifiedNote/);
  });
  it("is mounted by the work card, gated on real data being present", () => {
    const card = read("components/app/work-card.tsx");
    expect(card).toMatch(/<EmployerPreview\b/);
    expect(card).toMatch(/clear\.length > 0 &&[\s\S]{0,200}<EmployerPreview/);
  });
});

describe("employer-preview copy is honest in LT + EN", () => {
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    it(`${name} exposes toggle/title/intro/notSet/unverifiedNote`, () => {
      const e = ep(json);
      for (const k of ["toggle", "title", "intro", "notSet", "unverifiedNote"]) {
        expect(e?.[k], `${name} employerPreview.${k}`).toBeTruthy();
      }
    });
  }
  it("makes no fake matching / score / 'employer is viewing you' claim", () => {
    const all = [ep(lt), ep(en)].map((e) => JSON.stringify(e)).join(" ");
    expect(all).not.toMatch(/\bscore\b|\d+\s?%|guarantee|garantuo|automat\w*\s+(match|suderin|atitik)/i);
    // It must NOT imply an employer is actively looking / has access.
    expect(all).not.toMatch(/darbdavys jus mato|darbdavys jus rado|employer (is )?view|employer found you|matches you/i);
  });
  it("explicitly disclaims fake visibility + states data is unverified", () => {
    // LT: "niekas jūsų dar neieško" / EN: "nobody is looking for you yet".
    expect(ep(lt).intro).toMatch(/niekas .*neieško/i);
    expect(ep(en).intro).toMatch(/nobody is looking/i);
    // Silent-trust rule: no certification wording. The note still honestly
    // states the data is the worker's own and not (yet) reviewed by a person.
    expect(ep(lt).unverifiedNote).toMatch(/nėra peržiūr|neperžiūr/i);
    expect(ep(en).unverifiedNote).toMatch(/not reviewed/i);
  });
});
