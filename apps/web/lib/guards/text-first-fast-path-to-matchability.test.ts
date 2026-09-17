import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { professionsNamedInText } from "@/lib/onboarding/landing-handoff";

/**
 * FAST PATH TO MATCHABILITY (owner command 2026-09-17 §7).
 *
 * Production walk, RU worker with no profession: wrote "Я кладовщик …",
 * confirmed a suggested skill, saved — and stayed unmatchable. The board's
 * gate needs a work type AND skill evidence, and `promoteConfirmedClaimsAction`
 * promotes confirmed claims into `worker_skills` only inside the person's
 * declared directions (`workerProfessionSkillIds` → empty set with no
 * profession) — so the confirmation was dropped in silence, and the
 * profession "кладовщик" was not even recognised (LT-only lexicon).
 *
 * The fix, pinned here:
 *   1. the profession lexicon names the warehouse profession in RU / EN / DE /
 *      NL, not only LT / SV;
 *   2. the text-first flow PROPOSES the professions the text names (a
 *      choice, confirmed by the person, only while no primary exists),
 *      records that direction FIRST, then saves the claims and promotes;
 *   3. when nothing became a catalogued skill and no direction exists, the
 *      flow says so and points at the one step that unblocks matching;
 *   4. suggestion chips show the catalogue name in the person's language.
 * Nothing here weakens the matching gate.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the profession named in the text is recognised beyond Lithuanian", () => {
  it("RU / EN / DE / NL warehouse titles propose warehouse_worker", () => {
    expect(professionsNamedInText("Я кладовщик, 4 года работаю на складе.")).toContain("warehouse_worker");
    expect(professionsNamedInText("I am a warehouse worker, 4 years of order picking.")).toContain("warehouse_worker");
    expect(professionsNamedInText("Ich bin Lagerist seit vier Jahren.")).toContain("warehouse_worker");
    expect(professionsNamedInText("Ik ben magazijnmedewerker.")).toContain("warehouse_worker");
    // LT keeps working.
    expect(professionsNamedInText("Esu sandėlininkas.")).toContain("warehouse_worker");
  });

  it("is a proposal list, bounded, catalogue slugs only, never a guess for empty text", () => {
    expect(professionsNamedInText("")).toEqual([]);
    expect(professionsNamedInText("Labas rytas.")).toEqual([]);
    const many = professionsNamedInText("сварщик, водитель, кладовщик, электрик, плиточник, повар", 3);
    expect(many.length).toBeLessThanOrEqual(3);
    for (const s of many) expect(s).toMatch(/^[a-z_]+$/);
  });
});

describe("the text-first flow offers the direction, records it first, and never drops in silence", () => {
  const flow = read("components", "app", "profile-text-first-flow.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "");

  it("proposes professions only while the person has no primary, through the landing recogniser", () => {
    expect(flow).toContain("professionsNamedInText(raw)");
    expect(flow).toContain("if (!hasPrimaryProfession && !professionSet)");
    expect(flow).toContain('data-testid="profile-text-flow-profession-proposal"');
    expect(flow).toMatch(/type="radio"[\s\S]{0,200}name="profession-proposal"/);
  });

  it("records the chosen direction BEFORE saving claims and promoting, by slug through a server action", () => {
    const set = flow.indexOf("setPrimaryProfessionBySlug(chosenProfession)");
    const save = flow.indexOf("saveProfileSkillClaimsAction(confirmedClaims)");
    const promote = flow.indexOf("promoteConfirmedClaimsAction(confirmedClaims)");
    expect(set).toBeGreaterThan(-1);
    expect(set).toBeLessThan(save);
    expect(save).toBeLessThan(promote);
    const action = read("lib", "worker", "actions.ts");
    expect(action).toMatch(/export async function setPrimaryProfessionBySlug\(slug: string\)/);
    // Resolved server-side against the ACTIVE catalogue; an unknown slug is a no-op.
    expect(action).toContain('.eq("slug", slug)');
    expect(action).toContain('.eq("is_active", true)');
    expect(action).toContain("if (!id) return false;");
  });

  it("says when nothing became a catalogued skill and no direction exists — with the next step", () => {
    expect(flow).toContain('data-testid="profile-text-flow-needs-direction"');
    expect(flow).toContain('href="#profile-edit"');
    for (const locale of ["lt", "en", "ru", "de", "nl"]) {
      const m = JSON.parse(read("messages", `${locale}.json`)) as {
        skills: { textFirst: Record<string, string> };
      };
      for (const k of ["professionProposalTitle", "professionProposalHint", "needsDirection", "needsDirectionCta"]) {
        expect(typeof m.skills.textFirst[k], `${locale}.${k}`).toBe("string");
      }
    }
  });

  it("chips show the catalogue name in the person's language when the label maps to one skill", () => {
    expect(flow).toContain('useTranslations("skillNames")');
    expect(flow).toContain("label={localizedLabel(it.label)}");
    expect(flow).toContain("mapped.length === 1 && tSkillNames.has(mapped[0])");
  });

  it("the page tells the flow whether a primary profession exists, from the same read it already does", () => {
    const page = read("app", "[locale]", "dashboard", "profile", "page.tsx");
    expect(page).toContain("hasPrimaryProfession={currentProfessionId !== null}");
  });

  it("the matching gate itself is untouched", () => {
    const loader = read("lib", "opportunities", "load-worker-opportunities.ts");
    expect(loader).toContain("hasWorkType: Boolean(ctx.subject.professionSlug || evidencedProfessionSlug)");
    expect(loader).toContain("hasSkills: ctx.skillRowCount > 0");
    const promo = read("lib", "profile", "claim-catalog-promotion-actions.ts");
    expect(promo).toContain("workerProfessionSkillIds(supabase, workerId)");
  });
});
