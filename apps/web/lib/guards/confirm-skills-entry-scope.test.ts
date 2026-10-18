import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A manager's confirmation of ONE journal entry verifies only the skills that
 * entry is linked to (walk 2026-10-11: the inbox offered every unverified skill
 * of the worker, pre-ticked, so one submit verified skills detected in other
 * entries). Enforced in three places: the inbox read, the form, the action.
 */
const APP = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(APP, rel), "utf8");

describe("confirm skills is scoped to the entry", () => {
  it("the inbox offers only the entry's linked skills", () => {
    const page = read("app/[locale]/dashboard/inbox/page.tsx");
    expect(page).toMatch(/from\("journal_entry_skills"\)[\s\S]*\.in\("journal_entry_id", entryIds\)/);
    expect(page).toMatch(/linksByEntry\.get\(r\.id\)\?\.has\(s\.id\)/);
  });

  it("the form pre-ticks nothing", () => {
    const form = read("components/app/journal-inbox-entry.tsx");
    const block = form.slice(form.indexOf('name="skill_id"') - 200, form.indexOf('name="skill_id"') + 300);
    expect(block).not.toMatch(/defaultChecked/);
  });

  it("the server action drops every skill the entry is not linked to", () => {
    const op = read("lib/operations/org-membership.ts");
    const fn = op.slice(op.indexOf("export async function confirmEntryAndVerifySkills"));
    expect(fn).toMatch(/from\("journal_entry_skills"\)[\s\S]*\.eq\("journal_entry_id", entryId\)/);
    expect(fn).toMatch(/p_skill_ids: entrySkillIds/);
    expect(fn.indexOf("entrySkillIds")).toBeLessThan(fn.indexOf('"confirm_entry_and_verify_skills"'));
  });
});
