import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE GOAL SURVIVES A PAGE SWITCH — ALSO WHEN THE DOCUMENT GOES (owner P1
 * 2026-11-22, signup-isolated PG).
 *
 * The chat keeps its conversation goal in the tab's session storage so the
 * next chat of the same person in the same workspace can take it back. It was
 * written ONLY in the effect's unmount cleanup, and React never unmounts when
 * the document itself is unloaded (a page load, a reload, an address typed,
 * the phone discarding the tab). "Užpildyk vakarykštį darbo žurnalą", a full
 * load of another page, back, "6 valandas" — and the six hours were filed
 * TODAY. The browser walk is tests/e2e/assistant-intent-isolated.spec.ts (PG);
 * this pins the source so the regression fails before a browser is needed.
 */
const SRC = readFileSync(join(process.cwd(), "components/app/conversation/chat/conversation-chat.tsx"), "utf8");

function goalEffect(): string {
  const at = SRC.indexOf("const goalOwnerKey =");
  expect(at, "the goal-across-pages effect exists").toBeGreaterThan(-1);
  const end = SRC.indexOf("}, [auth0?.user?.id, goalOwnerKey]);", at);
  expect(end, "the effect is keyed on the person and the workspace").toBeGreaterThan(at);
  return SRC.slice(at, end);
}

describe("chat goal across pages", () => {
  it("is kept on pagehide as well as on unmount, with the same keep", () => {
    const body = goalEffect();
    expect(body).toMatch(/window\.addEventListener\("pagehide", keep\)/);
    expect(body).toMatch(/window\.removeEventListener\("pagehide", keep\)/);
    // The unmount cleanup still keeps it (an in-app navigation).
    expect(body).toMatch(/return \(\) => \{[\s\S]*keep\(\);[\s\S]*\};\s*$/);
  });

  it("stays bound to the same person and workspace, within its time limit", () => {
    const body = goalEffect();
    expect(body).toMatch(/kept\.owner === goalOwnerKey/);
    expect(body).toMatch(/Date\.now\(\) - kept\.at < GOAL_ACROSS_PAGES_TTL_MS/);
    expect(body).toMatch(/owner: goalOwnerKey, at: Date\.now\(\), goal: goalRef\.current/);
  });

  it("retires the kept copy when the page comes back from the back/forward cache", () => {
    const body = goalEffect();
    expect(body).toMatch(/window\.addEventListener\("pageshow", back\)/);
    expect(body).toMatch(/if \(!e\.persisted\) return;[\s\S]*removeItem\(GOAL_ACROSS_PAGES_KEY\)/);
  });
});
