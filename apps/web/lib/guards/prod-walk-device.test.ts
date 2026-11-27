import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A PRODUCTION WALK CAN RUN ON A PHONE (owner acceptance programme #3322: every
 * journey on a phone and on a computer). The device is chosen in ONE place — the
 * walk's shared `test` — and reaches a walk only through a choice input, so a phone
 * run is the same spec, the same accounts and the same writes at another screen size.
 */
const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");
const fixture = readFileSync(join(APP, "tests/e2e/prod-walk.ts"), "utf8");
const workflow = readFileSync(join(REPO, ".github/workflows/prod-qa-walk.yml"), "utf8");

describe("the device is applied through both doors of the walk's `test`", () => {
  it("the default context and page take the phone as test options", () => {
    expect(fixture).toMatch(/const DEVICE = walkDevice\(process\.env\);/);
    expect(fixture).toContain("...(walkPhone(DEVICE) ?? {}),");
  });

  it("every context a spec opens itself goes through the same rule", () => {
    expect(fixture).toContain("...withWalkDevice(DEVICE, rest, DESKTOP)");
  });
});

describe("the workflow", () => {
  it("offers exactly desktop, phone (390 px), phone-375, tablet-768 and desktop-1440, desktop by default", () => {
    const block = /\n {6}device:\n([\s\S]*?)\n {6}theme:/.exec(workflow)?.[1] ?? "";
    expect(block).toMatch(/type: choice/);
    expect(block).toMatch(/default: desktop/);
    expect(block.match(/^ {10}- ([\w-]+)$/gm)?.map((l) => l.trim())).toEqual(["- desktop", "- phone", "- phone-375", "- tablet-768", "- desktop-1440"]);
  });

  it("offers exactly a light and a dark theme, light by default", () => {
    const block = /\n {6}theme:\n([\s\S]*?)\n {6}budget_override:/.exec(workflow)?.[1] ?? "";
    expect(block).toMatch(/type: choice/);
    expect(block).toMatch(/default: light/);
    expect(block.match(/^ {10}- ([\w-]+)$/gm)?.map((l) => l.trim())).toEqual(["- light", "- dark"]);
  });

  it("hands them to the walk step only, and automatic walks stay on the light desktop", () => {
    const uses = workflow.split("\n").filter((l) => /PROD_QA_DEVICE:/.test(l));
    expect(uses.map((l) => l.trim())).toEqual(["PROD_QA_DEVICE: ${{ github.event_name == 'workflow_dispatch' && inputs.device || 'desktop' }}"]);
    const themes = workflow.split("\n").filter((l) => /PROD_QA_THEME:/.test(l));
    expect(themes.map((l) => l.trim())).toEqual(["PROD_QA_THEME: ${{ github.event_name == 'workflow_dispatch' && inputs.theme || 'light' }}"]);
  });

  it("the theme reaches both doors of the walk's `test`", () => {
    expect(fixture).toMatch(/const THEME = walkTheme\(process\.env\);/);
    expect(fixture).toContain("...SCHEME,");
    expect(fixture).toContain("const rest = { ...SCHEME, ...given };");
    // The product reads the viewer's saved theme, not the system scheme: both doors seed it.
    expect(fixture).toContain("await seedWalkTheme(context, SCHEME.colorScheme);");
    expect(fixture).toContain("await seedWalkTheme(ctx, rest.colorScheme);");
    expect(fixture).toContain('localStorage.setItem("theme", "dark")');
  });

  it("names a dark run as such, so its result is never read as the light one", () => {
    expect(workflow).toContain("format('{0} {1}{2}', inputs.spec, inputs.device, inputs.theme == 'dark' && ' dark' || '')");
  });

  it("says which device and theme ran in the summary, and keeps the artefact names the budget count reads", () => {
    expect(workflow).toContain('echo "device: ${PROD_QA_DEVICE}" >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toContain('echo "theme: ${PROD_QA_THEME}" >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow.match(/name: prod-qa-\$\{\{ needs\.debounce\.outputs\.spec \}\}-\$\{\{ github\.run_id \}\}/g) ?? []).toHaveLength(2);
  });

  it("no spec reads the device itself: the screen is the fixture's business", () => {
    // A spec that branched on the device would be two walks under one name.
    const dir = join(APP, "tests/e2e");
    const offenders = readdirSync(dir).filter((f) => f.endsWith(".spec.ts") && /PROD_QA_DEVICE|walkDevice\(|PROD_QA_THEME|walkTheme\(/.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
