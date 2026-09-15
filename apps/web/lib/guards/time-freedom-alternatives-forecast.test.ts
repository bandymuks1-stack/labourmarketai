import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * J-TIME-FREEDOM steps 4 and 7 — the wiring, not the maths.
 *
 * The pure modules have their own tests. What a unit test cannot see is
 * whether the composition reaches a person: an alternatives engine nobody
 * calls, or a forecast no form shows, is exactly the "built, tested, merged,
 * unreachable" shape this repository has produced before. So this guard pins
 * the three edges that make each step a journey link rather than a module:
 *
 *   step 4 — the assign action asks for alternatives AFTER the verdict and
 *            only under a collision; the notice renders them; the page passes
 *            the labels; every routed locale carries the keys.
 *   step 7 — the stages panel derives the forecast from the SAME learned
 *            readings CAL-10 renders, shows it labelled as a forecast, and
 *            adopting it sets the PLAN field (never anything else).
 *
 * Both steps are read-side and store nothing; the guard also pins that no
 * writer for a forecast or a proposal exists.
 */

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LOCALES = ["en", "lt", "de", "nl", "ru"] as const;

describe("step 4 — alternatives are shown where the warning is", () => {
  const actions = read("lib/projects/actions.ts");
  const manager = read("components/app/project-assignment-manager.tsx");
  const page = read("app/[locale]/dashboard/projects/page.tsx");

  it("the assign action proposes alternatives only after a COLLIDING verdict, never before the write", () => {
    expect(actions).toMatch(/const reservation = await reservationAfterAssign\(/);
    expect(actions).toMatch(/if \(reservation\.verdict\.state !== "collides"\) return null;/);
    expect(actions).toMatch(/proposeAssignmentAlternatives\(\{/);
    // The proposal cannot fail the assignment: it is wrapped, and its failure
    // returns null, which renders as "no proposal" — where the product was.
    expect(actions).toMatch(/alternatives proposal failed/);
    // Order: the RPC write precedes both checks.
    const write = actions.indexOf('rpc("assign_worker_to_project"');
    const check = actions.indexOf("const reservation = await reservationAfterAssign(");
    expect(write).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(write);
  });

  it("the notice renders the proposal beneath the clash, and the page supplies the labels", () => {
    expect(manager).toMatch(/function AlternativesNotice\(/);
    expect(manager).toMatch(/alternatives=\{assignState\.alternatives\}/);
    expect(manager).toMatch(/data-testid="assign-alternatives"/);
    for (const key of ["title", "dates", "crew", "none", "unconfirmed", "notStored"]) {
      expect(page).toContain(`t("assign.alternatives.${key}")`);
    }
  });

  it("every routed locale carries the alternatives keys", () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const alt = messages.projects?.assign?.alternatives;
      expect(alt, `${locale}: projects.assign.alternatives`).toBeTruthy();
      for (const key of ["title", "dates", "crew", "none", "unconfirmed", "notStored"]) {
        expect(typeof alt[key], `${locale}: ${key}`).toBe("string");
      }
    }
  });

  it("proposes around NOTHING it could not read — unknown verdicts are not applicable", () => {
    const pure = read("lib/workforce/commitment-alternatives.ts");
    expect(pure).toMatch(/if \(input\.verdict\.state !== "collides"\)/);
    expect(pure).toMatch(/status: "not_applicable"/);
  });
});

describe("step 7 — the forecast is offered, labelled, and never stored", () => {
  const panel = read("components/app/project-stages-panel.tsx");
  const forecast = read("lib/workforce/duration-forecast.ts");

  it("the panel derives the forecast from the same learned readings it renders", () => {
    expect(panel).toMatch(/forecastDuration\(\{ stageName: name, plannedStart, learned: learned\.readings \}\)/);
    expect(panel).toMatch(/data-testid="stage-forecast"/);
    expect(panel).toMatch(/t\("forecast\.label"\)/);
  });

  it("adopting the forecast sets the PLAN field and nothing else", () => {
    expect(panel).toMatch(/onClick=\{\(\) => setPlannedEnd\(forecast\.forecastEnd \?\? ""\)\}/);
    expect(panel).toMatch(/data-testid="stage-forecast-adopt"/);
  });

  it("there is no forecast writer anywhere — a forecast is a value, not a row (SEP-1)", () => {
    expect(forecast).not.toMatch(/\.from\(|\.rpc\(|insert|upsert|update\(/);
    expect(forecast).not.toMatch(/import "server-only"/);
    // The floor is the reading's own floor, imported — never a second number.
    expect(forecast).toMatch(/MIN_OBSERVATIONS/);
    expect(forecast).toMatch(/from "@\/lib\/workforce\/learned-duration"/);
  });

  it("every routed locale carries the forecast keys", () => {
    for (const locale of LOCALES) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const f = messages.projectStages?.forecast;
      expect(f, `${locale}: projectStages.forecast`).toBeTruthy();
      for (const key of ["withEnd", "daysOnly", "label", "adopt"]) {
        expect(typeof f[key], `${locale}: ${key}`).toBe("string");
      }
      expect(typeof f.confidence?.indicative).toBe("string");
      expect(typeof f.confidence?.established).toBe("string");
    }
  });
});
