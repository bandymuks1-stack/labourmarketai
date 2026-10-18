import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "Išsaugota" BESIDE THE OLD SALARY (production walk 2026-09-29, synthetic
 * worker): in the chat's work card the salary save persisted (workers row
 * 2600/3600) while the same panel showed the pre-save 3000/3900 — its props
 * were read before the save and React reset the action form to them. The
 * save now returns the row read back from `workers`, the editor shows exactly
 * that, and the chat card re-reads itself.
 */
const APP = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP, p), "utf8");
const ACTION = read("lib/worker/work-card-actions.ts");
const EDITOR = read("components/app/work-card-editor.tsx");
const PANEL = read("components/app/workspace/player-card-result.tsx");

describe("the work card shows what persisted, not what was typed", () => {
  it("the save action reads the stored row back AFTER a successful write", () => {
    const fn = ACTION.slice(ACTION.indexOf("export async function saveWorkerCardAction"));
    expect(fn.indexOf("saveWorkerCardCore(")).toBeLessThan(fn.indexOf("readBackCard(supabase, user.id)"));
    expect(fn).toMatch(/if \(!result\.ok\) return result;/);
    expect(ACTION).toMatch(/salary_min_eur, salary_max_eur/);
    expect(ACTION).toMatch(/\.eq\("profile_id", userId\)/);
  });

  it("the editor's fields come from the read-back once a save is confirmed, and the form remounts on them", () => {
    expect(EDITOR).toMatch(/const values = saveState\?\.ok && saveState\.saved \? saveState\.saved : propValues;/);
    expect(EDITOR).toMatch(/key=\{JSON\.stringify\(values\)\}/);
    // "Išsaugota" still renders only on a confirmed result
    expect(EDITOR).toMatch(/\{saveState\?\.ok && \(/);
  });

  it("the chat's card re-reads quietly after its editor saved", () => {
    expect(EDITOR).toMatch(/window\.dispatchEvent\(new Event\(WORK_CARD_SAVED_EVENT\)\)/);
    expect(PANEL).toMatch(/window\.addEventListener\(WORK_CARD_SAVED_EVENT, reread\)/);
    expect(PANEL).toMatch(/removeEventListener\(WORK_CARD_SAVED_EVENT, reread\)/);
  });
});
