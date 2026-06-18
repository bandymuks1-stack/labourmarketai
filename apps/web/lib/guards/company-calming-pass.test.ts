import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Company/agency calming-pass guard (slice company-calming-pass-v1, plan G).
 * A copy-only calm framing line on the cockpit that ALSO restates the honesty
 * contract (real status, no fabricated demand/matching). Non-radical.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));
const page = read("app/[locale]/dashboard/page.tsx");
const note = (j: Record<string, unknown>) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (j as any).auth.dashboard.wow.flow.company.calmNote as string;

describe("active-role overview is action-first (calm explanation note removed)", () => {
  // Superseded by dashboard-active-role-overview-v1 (owner decision A-minimal):
  // the company/agency overview leads with one clear next action, not an
  // explanation note. The calm-note copy is retained in i18n (honesty pinned
  // below) but is no longer rendered on the first screen.
  it("the dashboard no longer renders the calm explanation note", () => {
    expect(page).not.toMatch(/data-testid="company-calm-note"/);
  });
  it("the overview leads with the role's single next action", () => {
    expect(page).toMatch(/<DashboardNextAction\b/);
  });
});

describe("the calm note reassures AND restates the honesty contract", () => {
  it("LT: one step at a time + nothing fabricated", () => {
    const s = note(lt);
    expect(s).toBeTruthy();
    expect(s).toMatch(/žingsn/i);
    expect(s).toMatch(/nepramanyt/i); // demand/matches never fabricated
  });
  it("EN: one step at a time + never fabricated", () => {
    const s = note(en);
    expect(s).toBeTruthy();
    expect(s).toMatch(/one clear step|step at a time/i);
    expect(s).toMatch(/never fabricated/i);
  });
  it("does not claim matching/AI exists", () => {
    const blob = note(lt) + note(en);
    expect(blob).not.toMatch(/artificial intelligence|dirbtin\w* intelekt|automatch|atitiko darbdav/i);
  });
});

describe("design doc keeps the pass non-radical", () => {
  const doc = readFileSync(
    join(root, "..", "..", "docs", "audits", "company-calming-pass-v1.md"),
    "utf8",
  );
  it("states copy-only, no visual/structural redesign", () => {
    expect(doc).toMatch(/no structural \/ visual redesign|copy-only/i);
    expect(doc).toMatch(/RED/);
  });
});
