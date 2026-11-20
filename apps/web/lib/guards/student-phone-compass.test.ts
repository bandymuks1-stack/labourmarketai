import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * UX_GAPS 2026-11-18 ST-1 / ST-2 / ST-3 — the student's compass on a phone.
 * ST-1: the next step and the internship door come before "Who you are
 * becoming", so they are on the first screen. ST-2: each step link is a
 * 44 px target. ST-3: the institution name on an education row wraps on
 * phones (truncated only from `sm`).
 */
const web = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(web, rel), "utf8");
const COMPASS = read("components/app/learning-compass-section.tsx");
const EDUCATION = read("components/app/worker-education-section.tsx");

describe("ST-1: the compass opens with the next step", () => {
  it("compass-next and the internship door render before the identity block", () => {
    const next = COMPASS.indexOf('data-testid="compass-next"');
    const internships = COMPASS.indexOf('data-testid="compass-open-internships"');
    const becoming = COMPASS.indexOf('data-testid="compass-becoming"');
    expect(next).toBeGreaterThan(-1);
    expect(internships).toBeGreaterThan(-1);
    expect(becoming).toBeGreaterThan(-1);
    expect(next).toBeLessThan(becoming);
    expect(internships).toBeLessThan(becoming);
  });
});

describe("ST-2: every compass step link is a 44 px target", () => {
  it("the step link carries min-h-11", () => {
    expect(COMPASS).toMatch(
      /data-testid=\{`compass-step-\$\{step\}`\}>\s*<Link href=\{STEP_HREF\[step\]\} className="[^"]*\bmin-h-11\b[^"]*"/,
    );
  });
});

describe("ST-3: the institution name wraps on phones", () => {
  it("is truncated only from sm up", () => {
    const m = EDUCATION.match(/<span className="([^"]*)">\s*\{entry\.institutionName\}/);
    expect(m).not.toBeNull();
    const classes = m![1]!.split(/\s+/);
    expect(classes).not.toContain("truncate");
    expect(classes).toContain("sm:truncate");
  });
});
