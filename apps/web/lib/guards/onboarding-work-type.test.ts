import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PROFESSION_SLUGS, PROFESSION_SKILLS } from "@/lib/taxonomy/profession-skills";
import { AUTH_CLIENT_MESSAGE_ROOTS } from "@/lib/i18n/client-messages";

/**
 * ONBOARDING MUST ASK WHAT WORK THE PERSON DOES.
 *
 * This guard exists because of a measured production outcome, not a style
 * preference. On 2026-08-19: 36 workers, 26 with a country, 4 with a
 * profession. Onboarding asked for the country and did not ask for the work.
 *
 * That one field is not decorative. `worker-subject.ts` reads the primary
 * profession into the match engine's subject; `external-vacancies.ts` uses it
 * to build the profile-directed pool of imported ads; the CV renders it as the
 * work direction. With it null, the whole downstream chain has nothing to work
 * with — so 32 of 36 people could not be matched to anything no matter how
 * good the engine was.
 *
 * `complete_onboarding` has accepted `p_profession_id` since the M1 C-scope
 * migration and writes the primary `worker_professions` row from it. The write
 * path was applied in production the whole time; only the question was
 * missing. These pins keep it asked, keep the answer inside the platform's own
 * registry, and keep it from being silently defaulted on someone's behalf.
 */
const web = join(__dirname, "..", "..");
const WIZARD = join(web, "components", "app", "onboarding-wizard.tsx");
const ACTION = join(web, "lib", "auth", "actions.ts");
const MESSAGES = join(web, "messages");

const read = (p: string) => readFileSync(p, "utf8");

describe("onboarding asks what work the person does", () => {
  it("the worker step renders a REQUIRED work-type select", () => {
    const src = read(WIZARD);
    expect(src).toContain('name="profession_slug"');
    expect(src).toContain('data-testid="onboarding-profession"');
    // Asked only of a worker — a company-only signup is not a person looking
    // for work, and asking them would be a question with no honest answer.
    expect(src).toContain('roles.has("worker") && (');
    // Blocked client-side as well as required in markup, because the form is
    // submitted by `submit()` under noValidate.
    expect(src).toContain('roles.has("worker") && !professionSlug');
    expect(src).toContain("error_profession_required");
  });

  it("nothing is pre-selected — a profession is never declared for someone", () => {
    // §7: the platform does not assert a fact about a person that the person
    // did not state. A defaulted first option would put a profession on 100%
    // of profiles and make the field worthless as evidence.
    const src = read(WIZARD);
    expect(src).toMatch(/useState<string>\(""\);\s*\n[\s\S]{0,400}?setProfessionSlug/);
    expect(src).toContain("profession_placeholder");
  });

  it("the answer must be a slug the platform's own registry holds", () => {
    // A hand-crafted POST cannot record a profession nothing else understands:
    // the action checks the closed set, then resolves it against the ACTIVE
    // registry row. An unknown slug yields null rather than a failed signup.
    const src = read(ACTION);
    expect(src).toContain("PROFESSION_SLUGS.includes(rawProfession)");
    expect(src).toContain('.from("professions")');
    expect(src).toContain('.eq("slug", professionSlug)');
    expect(src).toContain('.eq("is_active", true)');
    expect(src).toContain("p_profession_id: professionId");
  });

  it("only a worker's answer is sent", () => {
    const src = read(ACTION);
    expect(src).toContain('primary === "worker" && professionSlug');
  });

  it("the slug list is derived from the skill map, never re-typed", () => {
    // Drift between this list and the registry would offer a choice that
    // resolves to nothing. `matching-canonical.test.ts` already re-derives the
    // map from the seed migrations link by link, so deriving from it inherits
    // that proof instead of adding a second hand-maintained copy.
    const src = read(join(web, "lib", "taxonomy", "profession-skills.ts"));
    expect(src).toContain("Object.keys(\n  PROFESSION_SKILLS,\n).sort()");
    expect(PROFESSION_SLUGS.length).toBe(Object.keys(PROFESSION_SKILLS).length);
    // 49 = the row count in production `public.professions` (2026-08-19).
    expect(PROFESSION_SLUGS.length).toBe(49);
    expect([...PROFESSION_SLUGS]).toEqual([...PROFESSION_SLUGS].sort());
  });

  it("the labels actually reach the client on this route", () => {
    // The select runs in a client component, so the namespace must be in the
    // onboarding layout's message pick — otherwise every option renders as a
    // missing-key error. This was a real failure caught by
    // `client-messages-allowlist`; pinning it here says WHY it belongs.
    expect([...AUTH_CLIENT_MESSAGE_ROOTS]).toContain("professions");
  });

  it("every shipped locale can ask the question and refuse an empty answer", () => {
    const locales = readdirSync(MESSAGES).filter((f) => f.endsWith(".json"));
    expect(locales.length).toBeGreaterThanOrEqual(11);
    for (const file of locales) {
      const messages = JSON.parse(read(join(MESSAGES, file))) as {
        auth?: { onboarding?: Record<string, unknown> };
      };
      const onboarding = messages.auth?.onboarding ?? {};
      for (const key of [
        "profession_label",
        "profession_placeholder",
        "profession_hint",
        "error_profession_required",
      ]) {
        const value = onboarding[key];
        expect(
          typeof value === "string" && value.trim().length > 0,
          `${file} is missing auth.onboarding.${key}`,
        ).toBe(true);
      }
    }
  });

  it("every offered slug has a label in every locale", () => {
    // An option rendering as a raw slug ("heavy_equipment_operator") in one
    // language is the kind of half-shipped i18n the ratchet exists to stop.
    const localeDirs = readdirSync(MESSAGES, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(localeDirs.length).toBeGreaterThanOrEqual(11);
    for (const dir of localeDirs) {
      const labels = JSON.parse(
        read(join(MESSAGES, dir, "professions.json")),
      ) as Record<string, string>;
      const missing = PROFESSION_SLUGS.filter(
        (s) => typeof labels[s] !== "string" || labels[s].trim().length === 0,
      );
      expect(missing, `${dir}/professions.json missing labels`).toEqual([]);
    }
  });
});
